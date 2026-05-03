import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requireInternalToken } from "../../src/modules/regions/regions.middleware.js";

function makeRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

function makeReq(headers = {}) {
  const lower = Object.fromEntries(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])
  );
  return {
    header(name) {
      return lower[String(name || "").toLowerCase()];
    },
  };
}

describe("requireInternalToken", () => {
  const originalToken = process.env.INTERNAL_API_TOKEN;

  beforeEach(() => {
    delete process.env.INTERNAL_API_TOKEN;
  });

  afterEach(() => {
    if (originalToken === undefined) delete process.env.INTERNAL_API_TOKEN;
    else process.env.INTERNAL_API_TOKEN = originalToken;
  });

  it("retorna 404 quando INTERNAL_API_TOKEN não está configurado (endpoint indisponível)", () => {
    const req = makeReq({ "X-Internal-Token": "qualquer" });
    const res = makeRes();
    const next = vi.fn();

    requireInternalToken(req, res, next);

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ ok: false, error: "Not Found" });
    expect(next).not.toHaveBeenCalled();
  });

  it("retorna 404 quando o header X-Internal-Token está ausente", () => {
    process.env.INTERNAL_API_TOKEN = "secret-token";
    const req = makeReq({});
    const res = makeRes();
    const next = vi.fn();

    requireInternalToken(req, res, next);

    expect(res.statusCode).toBe(404);
    expect(next).not.toHaveBeenCalled();
  });

  it("retorna 404 quando o token está errado", () => {
    process.env.INTERNAL_API_TOKEN = "secret-token";
    const req = makeReq({ "X-Internal-Token": "wrong" });
    const res = makeRes();
    const next = vi.fn();

    requireInternalToken(req, res, next);

    expect(res.statusCode).toBe(404);
    expect(next).not.toHaveBeenCalled();
  });

  it("chama next() quando o token bate com o esperado", () => {
    process.env.INTERNAL_API_TOKEN = "secret-token";
    const req = makeReq({ "X-Internal-Token": "secret-token" });
    const res = makeRes();
    const next = vi.fn();

    requireInternalToken(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(200); // não chamou status()
  });

  it("aceita token com case-insensitive no header (Express normaliza)", () => {
    process.env.INTERNAL_API_TOKEN = "secret-token";
    const req = makeReq({ "x-internal-token": "secret-token" });
    const res = makeRes();
    const next = vi.fn();

    requireInternalToken(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it("nunca retorna 401 ou 403 (evita enumeração da superfície)", () => {
    process.env.INTERNAL_API_TOKEN = "secret-token";

    const cases = [{ "X-Internal-Token": "wrong" }, {}, { "X-Internal-Token": "" }];

    for (const headers of cases) {
      const req = makeReq(headers);
      const res = makeRes();
      requireInternalToken(req, res, vi.fn());
      expect(res.statusCode).toBe(404);
      expect(res.statusCode).not.toBe(401);
      expect(res.statusCode).not.toBe(403);
    }
  });
});
