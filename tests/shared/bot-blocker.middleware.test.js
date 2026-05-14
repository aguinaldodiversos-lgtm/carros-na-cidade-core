import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  botBlockerMiddleware,
  isBadBot,
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

function makeReq({ ua = "", path = "/api/ads" } = {}) {
  return {
    headers: ua ? { "user-agent": ua } : {},
    path,
    url: path,
  };
}

const envBackup = {};

beforeEach(() => {
  envBackup.BAD_BOTS_BLOCKED = process.env.BAD_BOTS_BLOCKED;
});

afterEach(() => {
  if (envBackup.BAD_BOTS_BLOCKED === undefined) delete process.env.BAD_BOTS_BLOCKED;
  else process.env.BAD_BOTS_BLOCKED = envBackup.BAD_BOTS_BLOCKED;
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
  });
});
