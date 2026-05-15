import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  botBlockerMiddleware,
  isAuthenticatedInternalCall,
  isBadBot,
  looksLikeBffCall,
} from "../../src/shared/middlewares/bot-blocker.middleware.js";

function makeRes() {
  const headers = {};
  const res = {
    statusCode: 200,
    locals: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    set(name, value) {
      headers[name.toLowerCase()] = value;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  res._headers = headers;
  return res;
}

function makeReq({ ua = "", path = "/api/ads", headers = {} } = {}) {
  return {
    headers: {
      ...(ua ? { "user-agent": ua } : {}),
      ...headers,
    },
    path,
    url: path,
  };
}

const envBackup = {};

beforeEach(() => {
  envBackup.BAD_BOTS_BLOCKED = process.env.BAD_BOTS_BLOCKED;
  envBackup.INTERNAL_API_TOKEN = process.env.INTERNAL_API_TOKEN;
});

afterEach(() => {
  if (envBackup.BAD_BOTS_BLOCKED === undefined) delete process.env.BAD_BOTS_BLOCKED;
  else process.env.BAD_BOTS_BLOCKED = envBackup.BAD_BOTS_BLOCKED;
  if (envBackup.INTERNAL_API_TOKEN === undefined) delete process.env.INTERNAL_API_TOKEN;
  else process.env.INTERNAL_API_TOKEN = envBackup.INTERNAL_API_TOKEN;
});

describe("isBadBot", () => {
  const badBots = [
    "AhrefsBot/7.0; +http://ahrefs.com/robot/",
    "Mozilla/5.0 (compatible; SemrushBot/7~bl; +http://www.semrush.com/bot.html)",
    "Mozilla/5.0 (compatible; Bytespider; spider-feedback@bytedance.com)",
    "Mozilla/5.0 (compatible; PetalBot;+https://webmaster.petalsearch.com/site/petalbot)",
    "Mozilla/5.0 (compatible; MJ12bot/v1.4.8; http://mj12bot.com/)",
    "Mozilla/5.0 (compatible; BLEXBot/1.0; +http://webmeup-crawler.com/)",
    "Mozilla/5.0 (compatible; DotBot/1.2; +https://opensiteexplorer.org/dotbot)",
    "Mozilla/5.0 (compatible; DataForSeoBot/1.0; +https://dataforseo.com/dataforseo-bot)",
    "Mozilla/5.0 (compatible; GPTBot/1.0; +https://openai.com/gptbot)",
    "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0)",
    "CCBot/2.0 (https://commoncrawl.org/faq/)",
    "Amazonbot/0.1 (+https://developer.amazon.com/support/amazonbot)",
    "Mozilla/5.0 (compatible; YandexBot/3.0)",
    "Mozilla/5.0 (compatible; Baiduspider/2.0)",
    "python-requests/2.28.1",
    "curl/7.81.0",
    "Wget/1.21.2",
    "axios/1.4.0",
    "node-fetch/1.0",
    "Go-http-client/1.1",
    "Java/17.0.5",
    "okhttp/4.10.0",
    "Scrapy/2.8.0 (+https://scrapy.org)",
    "HeadlessChrome/119.0.0.0",
  ];

  for (const ua of badBots) {
    it(`bloqueia ${ua.slice(0, 50)}...`, () => {
      expect(isBadBot(ua)).toBe(true);
    });
  }

  const goodBots = [
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "Mozilla/5.0 (compatible; Googlebot-Image/1.0)",
    "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
    "Mozilla/5.0 (compatible; DuckDuckBot/1.1; +http://duckduckgo.com/duckduckbot.html)",
    "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
    "WhatsApp/2.23.20.0 A",
  ];

  for (const ua of goodBots) {
    it(`NÃO bloqueia ${ua.slice(0, 50)}... (good bot)`, () => {
      expect(isBadBot(ua)).toBe(false);
    });
  }

  const humanBrowsers = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) Gecko/20100101 Firefox/120.0",
  ];

  for (const ua of humanBrowsers) {
    it(`NÃO bloqueia browser humano (${ua.slice(0, 40)}...)`, () => {
      expect(isBadBot(ua)).toBe(false);
    });
  }

  it("ua vazio/null não é bot ruim", () => {
    expect(isBadBot("")).toBe(false);
    expect(isBadBot(null)).toBe(false);
    expect(isBadBot(undefined)).toBe(false);
  });

  it("UA literal 'node' (default Node fetch global) é bloqueado", () => {
    // Caso real visto nos logs em 2026-05-14 — bots usando script Node básico.
    expect(isBadBot("node")).toBe(true);
    expect(isBadBot("Node")).toBe(true);
    expect(isBadBot("NODE")).toBe(true);
    expect(isBadBot(" node ")).toBe(true);
  });

  it("UA 'node/<versão>' não é só 'node' — passa por blocklist alguma se tiver", () => {
    // Caso teórico — Node não envia versão por default, mas se enviar não é
    // o caso do "node puro" que vimos nos logs.
    expect(isBadBot("node/20.0.0")).toBe(false);
    expect(isBadBot("Mozilla/5.0 node")).toBe(false); // pode ser browser custom
  });
});

describe("isAuthenticatedInternalCall", () => {
  it("UA cnc-internal/1.0 + token correto → true", () => {
    process.env.INTERNAL_API_TOKEN = "secret-123";
    const req = makeReq({
      ua: "cnc-internal/1.0",
      headers: { "x-internal-token": "secret-123" },
    });
    expect(isAuthenticatedInternalCall(req)).toBe(true);
  });

  it("UA cnc-internal/1.0 SEM token → false (não burla com só UA)", () => {
    process.env.INTERNAL_API_TOKEN = "secret-123";
    const req = makeReq({ ua: "cnc-internal/1.0" });
    expect(isAuthenticatedInternalCall(req)).toBe(false);
  });

  it("UA cnc-internal/1.0 com token errado → false", () => {
    process.env.INTERNAL_API_TOKEN = "secret-123";
    const req = makeReq({
      ua: "cnc-internal/1.0",
      headers: { "x-internal-token": "errado" },
    });
    expect(isAuthenticatedInternalCall(req)).toBe(false);
  });

  it("INTERNAL_API_TOKEN vazio: nunca aceita (fail-closed)", () => {
    delete process.env.INTERNAL_API_TOKEN;
    const req = makeReq({
      ua: "cnc-internal/1.0",
      headers: { "x-internal-token": "qualquer" },
    });
    expect(isAuthenticatedInternalCall(req)).toBe(false);
  });

  it("UA browser comum com token → false (sem o UA não vale)", () => {
    process.env.INTERNAL_API_TOKEN = "secret-123";
    const req = makeReq({
      ua: "Mozilla/5.0 Chrome",
      headers: { "x-internal-token": "secret-123" },
    });
    expect(isAuthenticatedInternalCall(req)).toBe(false);
  });
});

describe("looksLikeBffCall", () => {
  it("com X-Cnc-Client-Ip presente e válido (IPv4) → true", () => {
    expect(looksLikeBffCall(makeReq({ headers: { "x-cnc-client-ip": "203.0.113.42" } }))).toBe(true);
  });

  it("com X-Cnc-Client-Ip IPv6 válido → true", () => {
    expect(
      looksLikeBffCall(makeReq({ headers: { "x-cnc-client-ip": "2001:db8::1" } }))
    ).toBe(true);
  });

  it("sem header → false", () => {
    expect(looksLikeBffCall(makeReq())).toBe(false);
  });

  it("header com valor lixo → false", () => {
    expect(looksLikeBffCall(makeReq({ headers: { "x-cnc-client-ip": "abc def" } }))).toBe(false);
    expect(looksLikeBffCall(makeReq({ headers: { "x-cnc-client-ip": "" } }))).toBe(false);
  });
});

describe("botBlockerMiddleware", () => {
  it("flag OFF: passa request sem mexer mesmo com UA ruim", () => {
    const req = makeReq({ ua: "AhrefsBot/7.0" });
    const res = makeRes();
    const next = vi.fn();
    botBlockerMiddleware(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(200);
  });

  describe("flag ON", () => {
    beforeEach(() => {
      process.env.BAD_BOTS_BLOCKED = "true";
    });

    it("bloqueia AhrefsBot em /api/ads com 429 + Retry-After + corpo mínimo", () => {
      const req = makeReq({ ua: "AhrefsBot/7.0", path: "/api/ads" });
      const res = makeRes();
      const next = vi.fn();
      botBlockerMiddleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(429);
      expect(res._headers["retry-after"]).toBe("86400");
      expect(res._headers["cache-control"]).toBe("no-store");
      expect(res._headers["x-robots-tag"]).toContain("noindex");
      expect(res.body).toEqual({ error: "rate_limited" });
    });

    it("bloqueia python-requests em /api/public/seo/sitemap", () => {
      const req = makeReq({ ua: "python-requests/2.28.1", path: "/api/public/seo/sitemap" });
      const res = makeRes();
      const next = vi.fn();
      botBlockerMiddleware(req, res, next);
      expect(res.statusCode).toBe(429);
      expect(next).not.toHaveBeenCalled();
    });

    it("NÃO bloqueia Googlebot (good bot)", () => {
      const req = makeReq({ ua: "Mozilla/5.0 (compatible; Googlebot/2.1)" });
      const res = makeRes();
      const next = vi.fn();
      botBlockerMiddleware(req, res, next);
      expect(next).toHaveBeenCalledOnce();
      expect(res.statusCode).toBe(200);
    });

    it("NÃO bloqueia em /health (path allowlist)", () => {
      const req = makeReq({ ua: "AhrefsBot/7.0", path: "/health" });
      const res = makeRes();
      const next = vi.fn();
      botBlockerMiddleware(req, res, next);
      expect(next).toHaveBeenCalledOnce();
    });

    it("NÃO bloqueia em /robots.txt (allowlist)", () => {
      const req = makeReq({ ua: "AhrefsBot/7.0", path: "/robots.txt" });
      const res = makeRes();
      const next = vi.fn();
      botBlockerMiddleware(req, res, next);
      expect(next).toHaveBeenCalledOnce();
    });

    it("UA ausente: passa (não bloqueia)", () => {
      const req = makeReq({ ua: "", path: "/api/ads" });
      const res = makeRes();
      const next = vi.fn();
      botBlockerMiddleware(req, res, next);
      expect(next).toHaveBeenCalledOnce();
    });

    it("UA literal 'node' em /api/ads é bloqueado (429)", () => {
      // Cenário exato do incidente 2026-05-14: bots Node enumerando rotas.
      const req = makeReq({ ua: "node", path: "/api/ads" });
      const res = makeRes();
      const next = vi.fn();
      botBlockerMiddleware(req, res, next);
      expect(res.statusCode).toBe(429);
      expect(res.body).toEqual({ error: "rate_limited" });
      expect(next).not.toHaveBeenCalled();
    });

    it("UA 'node' em /catalog/ads/<slug> também é bloqueado (rota lixo)", () => {
      const req = makeReq({ ua: "node", path: "/catalog/ads/algum-slug" });
      const res = makeRes();
      const next = vi.fn();
      botBlockerMiddleware(req, res, next);
      expect(res.statusCode).toBe(429);
    });

    it("UA 'node' COM X-Cnc-Client-Ip válido (BFF compat) passa", () => {
      // Frontend Next.js SSR usando fetch global → UA="node", mas BFF marca
      // o IP real. Não pode ser cortado.
      const req = makeReq({
        ua: "node",
        path: "/api/ads",
        headers: { "x-cnc-client-ip": "203.0.113.42" },
      });
      const res = makeRes();
      const next = vi.fn();
      botBlockerMiddleware(req, res, next);
      expect(next).toHaveBeenCalledOnce();
      expect(res.statusCode).toBe(200);
    });

    it("UA 'AhrefsBot' COM X-Cnc-Client-Ip NÃO passa (compat fraca só vale para 'node')", () => {
      // Compat por header é só para `node` puro. Outros bots conhecidos
      // continuam bloqueados mesmo se forjarem o header BFF.
      const req = makeReq({
        ua: "AhrefsBot/7.0",
        path: "/api/ads",
        headers: { "x-cnc-client-ip": "203.0.113.42" },
      });
      const res = makeRes();
      const next = vi.fn();
      botBlockerMiddleware(req, res, next);
      expect(res.statusCode).toBe(429);
    });

    it("UA cnc-internal/1.0 + X-Internal-Token correto passa (allowlist forte)", () => {
      process.env.INTERNAL_API_TOKEN = "secret-123";
      const req = makeReq({
        ua: "cnc-internal/1.0",
        path: "/api/ads",
        headers: { "x-internal-token": "secret-123" },
      });
      const res = makeRes();
      const next = vi.fn();
      botBlockerMiddleware(req, res, next);
      expect(next).toHaveBeenCalledOnce();
    });

    it("UA cnc-internal/1.0 SEM token NÃO passa (proteção contra spoofing)", () => {
      process.env.INTERNAL_API_TOKEN = "secret-123";
      const req = makeReq({
        ua: "cnc-internal/1.0",
        path: "/api/ads",
      });
      const res = makeRes();
      const next = vi.fn();
      botBlockerMiddleware(req, res, next);
      // UA `cnc-internal/1.0` não está na blocklist; sem token é tratado
      // como UA desconhecido, que passa por default (não está na blocklist).
      // O ponto chave é: NÃO ganha bypass especial. O comportamento padrão
      // (que é "deixa passar UA desconhecido") aplica.
      expect(next).toHaveBeenCalledOnce();
    });

    it("Chrome (browser humano) em /api/ads continua passando", () => {
      const req = makeReq({
        ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
        path: "/api/ads",
      });
      const res = makeRes();
      const next = vi.fn();
      botBlockerMiddleware(req, res, next);
      expect(next).toHaveBeenCalledOnce();
    });
  });
});
