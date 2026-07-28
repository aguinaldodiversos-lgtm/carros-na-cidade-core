import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  __resetForTests,
  publicStormGuardMiddleware,
} from "../../src/shared/middlewares/404-storm-guard.middleware.js";

const envBackup = {};

function makeRes(initialStatus = 200) {
  const headers = {};
  const finishCallbacks = [];
  const res = {
    statusCode: initialStatus,
    set(name, value) {
      headers[name.toLowerCase()] = value;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      this._fireFinish();
      return this;
    },
    on(event, cb) {
      if (event === "finish") finishCallbacks.push(cb);
    },
    _fireFinish() {
      for (const cb of finishCallbacks) cb();
    },
  };
  res._headers = headers;
  return res;
}

function makeReq({ ip = "203.0.113.42", ua = "node", path = "/foo" } = {}) {
  return {
    headers: {
      "user-agent": ua,
      "x-cnc-client-ip": ip,
    },
    path,
    url: path,
    originalUrl: path,
  };
}

function simulate404(req) {
  const res = makeRes(200);
  const next = vi.fn();
  publicStormGuardMiddleware(req, res, next);
  // Simula que o router resolveu como 404
  res.statusCode = 404;
  res._fireFinish();
  return { res, next };
}

beforeEach(() => {
  envBackup.PUBLIC_404_STORM_GUARD_ENABLED = process.env.PUBLIC_404_STORM_GUARD_ENABLED;
  envBackup.PUBLIC_404_STORM_THRESHOLD = process.env.PUBLIC_404_STORM_THRESHOLD;
  envBackup.PUBLIC_404_STORM_BLOCK_SECONDS = process.env.PUBLIC_404_STORM_BLOCK_SECONDS;
  envBackup.INTERNAL_API_TOKEN = process.env.INTERNAL_API_TOKEN;
  __resetForTests();
});

afterEach(() => {
  for (const k of Object.keys(envBackup)) {
    if (envBackup[k] === undefined) delete process.env[k];
    else process.env[k] = envBackup[k];
  }
  __resetForTests();
});

describe("publicStormGuardMiddleware — flag OFF", () => {
  it("flag OFF: middleware passa direto sem contar nada", () => {
    delete process.env.PUBLIC_404_STORM_GUARD_ENABLED;
    const req = makeReq();
    const res = makeRes();
    const next = vi.fn();
    publicStormGuardMiddleware(req, res, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it("flag OFF: mesmo após 50 404s, próximo request passa", () => {
    delete process.env.PUBLIC_404_STORM_GUARD_ENABLED;
    const req = makeReq();
    for (let i = 0; i < 50; i++) simulate404(req);
    const res = makeRes();
    const next = vi.fn();
    publicStormGuardMiddleware(req, res, next);
    expect(next).toHaveBeenCalledOnce();
  });
});

describe("publicStormGuardMiddleware — flag ON", () => {
  beforeEach(() => {
    process.env.PUBLIC_404_STORM_GUARD_ENABLED = "true";
    process.env.PUBLIC_404_STORM_THRESHOLD = "5"; // threshold baixo pro teste
  });

  it("primeiros N-1 404s passam, no N-ésimo conta e bloqueia o PRÓXIMO", () => {
    const req = makeReq();
    // 5 hits de 404 atingem o threshold
    for (let i = 0; i < 5; i++) simulate404(req);

    // 6º request com mesma chave → bloqueado
    const res = makeRes();
    const next = vi.fn();
    publicStormGuardMiddleware(req, res, next);
    expect(res.statusCode).toBe(429);
    expect(res.body).toEqual({ error: "rate_limited" });
    expect(res._headers["retry-after"]).toBeDefined();
    expect(next).not.toHaveBeenCalled();
  });

  it("IP/UA diferente NÃO é bloqueado por conta de outro", () => {
    const ipA = makeReq({ ip: "1.1.1.1" });
    for (let i = 0; i < 5; i++) simulate404(ipA);

    const ipB = makeReq({ ip: "2.2.2.2" });
    const res = makeRes();
    const next = vi.fn();
    publicStormGuardMiddleware(ipB, res, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it("respostas 2xx/3xx não contam para o threshold", () => {
    const req = makeReq();

    // 10 hits 200 — não contam
    for (let i = 0; i < 10; i++) {
      const res = makeRes(200);
      const next = vi.fn();
      publicStormGuardMiddleware(req, res, next);
      res.statusCode = 200;
      res._fireFinish();
    }

    // 11º request: ainda passa
    const res = makeRes();
    const next = vi.fn();
    publicStormGuardMiddleware(req, res, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it("/health não é contado mesmo com 404", () => {
    const req = makeReq({ path: "/health" });
    for (let i = 0; i < 5; i++) simulate404(req);

    const res = makeRes();
    const next = vi.fn();
    publicStormGuardMiddleware(req, res, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it("emite linha 'public_404_storm_blocked' em stdout quando bloqueia", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const req = makeReq();
    for (let i = 0; i < 5; i++) simulate404(req);

    const call = logSpy.mock.calls.find((args) =>
      args[0]?.includes?.('"event":"public_404_storm_blocked"')
    );
    expect(call).toBeDefined();
    const parsed = JSON.parse(call[0]);
    expect(parsed.event).toBe("public_404_storm_blocked");
    expect(parsed.ua_summary).toBeDefined();
    expect(parsed.ip_hash).toMatch(/^[0-9a-f]+$/);
    expect(parsed.count_404).toBeGreaterThanOrEqual(5);
    expect(parsed.sample_path).toBe("/foo");
    logSpy.mockRestore();
  });

  it("após janela de bloqueio, contagem volta a zero (TTL via blockedUntil)", () => {
    process.env.PUBLIC_404_STORM_BLOCK_SECONDS = "0.1"; // 100ms
    const req = makeReq();
    for (let i = 0; i < 5; i++) simulate404(req);

    // bloqueado agora
    const blockedRes = makeRes();
    publicStormGuardMiddleware(req, blockedRes, vi.fn());
    expect(blockedRes.statusCode).toBe(429);

    // espera o block expirar
    return new Promise((resolve) => {
      setTimeout(() => {
        const res = makeRes();
        const next = vi.fn();
        publicStormGuardMiddleware(req, res, next);
        expect(next).toHaveBeenCalledOnce();
        resolve();
      }, 150);
    });
  });
});

/**
 * Regressão do incidente 2026-07-28: este guard era a ÚNICA camada sem skip
 * para chamada interna autenticada. 404s do próprio SSR armaram o guard e o
 * backend passou a responder 429 para TODA chamada do frontend por 1h — só
 * `/health` escapava (allowlist). O portal seguiu de pé servindo cache stale,
 * o que escondeu a queda por semanas.
 *
 * A correção não pode ser "deixar de contar": ficar cego para 404 gerado por
 * bug nosso foi o que custou o tempo de diagnóstico. Interno é contado e
 * REPORTADO, só nunca bloqueado.
 */
describe("publicStormGuardMiddleware — chamada interna autenticada", () => {
  const TOKEN = "token-interno-de-teste";

  function makeInternalReq({ path = "/api/qualquer-404" } = {}) {
    return {
      headers: {
        "user-agent": "cnc-internal/1.0",
        "x-internal-token": TOKEN,
        "x-cnc-client-ip": "10.0.0.7",
      },
      path,
      url: path,
      originalUrl: path,
    };
  }

  beforeEach(() => {
    process.env.PUBLIC_404_STORM_GUARD_ENABLED = "true";
    process.env.PUBLIC_404_STORM_THRESHOLD = "5";
    process.env.INTERNAL_API_TOKEN = TOKEN;
  });

  it("NUNCA bloqueia: após 4x o threshold, segue passando", () => {
    const req = makeInternalReq();
    for (let i = 0; i < 20; i++) simulate404(req);

    const res = makeRes();
    const next = vi.fn();
    publicStormGuardMiddleware(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).not.toBe(429);
  });

  it("mas REPORTA o burst — não fica cego para bug nosso", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const req = makeInternalReq({ path: "/api/rota/que/nao/existe" });
    for (let i = 0; i < 6; i++) simulate404(req);

    const events = spy.mock.calls
      .map((c) => {
        try {
          return JSON.parse(c[0]);
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    const burst = events.find((e) => e.event === "internal_404_burst");
    expect(burst).toBeDefined();
    expect(burst.blocked).toBe(false);
    expect(burst.sample_path).toBe("/api/rota/que/nao/existe");
    // Nunca deve emitir o evento de bloqueio para chamada interna.
    expect(events.some((e) => e.event === "public_404_storm_blocked")).toBe(false);
    spy.mockRestore();
  });

  it("token INVÁLIDO não ganha o skip — continua sendo bloqueado", () => {
    const req = makeInternalReq();
    req.headers["x-internal-token"] = "token-errado";
    for (let i = 0; i < 5; i++) simulate404(req);

    const res = makeRes();
    const next = vi.fn();
    publicStormGuardMiddleware(req, res, next);

    expect(res.statusCode).toBe(429);
    expect(next).not.toHaveBeenCalled();
  });

  it("bot externo continua bloqueado normalmente (guard preserva sua função)", () => {
    const req = makeReq({ ua: "python-requests/2.31", ip: "45.9.1.2" });
    for (let i = 0; i < 5; i++) simulate404(req);

    const res = makeRes();
    const next = vi.fn();
    publicStormGuardMiddleware(req, res, next);

    expect(res.statusCode).toBe(429);
    expect(next).not.toHaveBeenCalled();
  });
});
