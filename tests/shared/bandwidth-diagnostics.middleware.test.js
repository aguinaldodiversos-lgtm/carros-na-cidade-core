import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  bandwidthDiagnosticsMiddleware,
  classifyRouteGroup,
  flushAccumulator,
  normalizePathForAggregation,
  summarizeUserAgent,
  __resetForTests,
} from "../../src/shared/middlewares/bandwidth-diagnostics.middleware.js";

describe("normalizePathForAggregation", () => {
  it("substitui IDs numéricos por :id", () => {
    expect(normalizePathForAggregation("/api/ads/12345")).toBe("/api/ads/:id");
  });

  it("substitui UUIDs por :uuid", () => {
    expect(normalizePathForAggregation("/api/ads/a3f9c2e1-1234-4567-89ab-cdef01234567")).toBe(
      "/api/ads/:uuid"
    );
  });

  it("substitui slugs por :slug", () => {
    expect(normalizePathForAggregation("/api/public/cities/sao-paulo-sp")).toBe(
      "/api/public/cities/:slug"
    );
  });

  it("ignora query string", () => {
    expect(normalizePathForAggregation("/api/ads/search?city_slug=sp&page=2")).toBe(
      "/api/ads/search"
    );
  });

  it("preserva paths sem segmentos variáveis", () => {
    expect(normalizePathForAggregation("/api/vehicle-images")).toBe("/api/vehicle-images");
    expect(normalizePathForAggregation("/health")).toBe("/health");
  });
});

describe("classifyRouteGroup", () => {
  it("classifica sitemaps", () => {
    expect(classifyRouteGroup("/api/public/seo/sitemap")).toBe("sitemap");
    expect(classifyRouteGroup("/api/public/seo/sitemap.json")).toBe("sitemap");
    expect(classifyRouteGroup("/api/public/seo/sitemap/type/:slug")).toBe("sitemap");
    expect(classifyRouteGroup("/api/public/seo/sitemap/region/:slug")).toBe("sitemap");
  });

  it("separa ads_search de ads", () => {
    expect(classifyRouteGroup("/api/ads/search")).toBe("ads_search");
    expect(classifyRouteGroup("/api/ads")).toBe("ads");
    expect(classifyRouteGroup("/api/ads/:id")).toBe("ads");
  });

  it("classifica vehicle_images e public_city", () => {
    expect(classifyRouteGroup("/api/vehicle-images")).toBe("vehicle_images");
    expect(classifyRouteGroup("/api/public/cities/:slug")).toBe("public_city");
  });

  it("fallback é 'other'", () => {
    expect(classifyRouteGroup("/qualquer-coisa")).toBe("other");
  });
});

describe("summarizeUserAgent", () => {
  it("identifica bots conhecidos", () => {
    expect(summarizeUserAgent("Mozilla/5.0 (compatible; Googlebot/2.1)")).toBe("bot:google");
    expect(summarizeUserAgent("AhrefsBot/7.0")).toBe("bot:ahrefs");
    expect(summarizeUserAgent("Mozilla/5.0 (compatible; Bytespider)")).toBe("bot:bytespider");
    expect(summarizeUserAgent("GPTBot/1.0")).toBe("bot:ai-crawler");
  });

  it("identifica ferramentas HTTP", () => {
    expect(summarizeUserAgent("python-requests/2.28")).toBe("tool:http-client");
    expect(summarizeUserAgent("curl/7.81.0")).toBe("tool:http-client");
  });

  it("identifica browsers", () => {
    expect(summarizeUserAgent("Mozilla/5.0 Chrome/120")).toBe("browser:chrome");
    expect(summarizeUserAgent("Mozilla/5.0 Firefox/120")).toBe("browser:firefox");
  });

  it("ua nulo/vazio retorna '(none)'", () => {
    expect(summarizeUserAgent(null)).toBe("(none)");
    expect(summarizeUserAgent("")).toBe("(none)");
  });

  it("NUNCA loga UA completo (corta em 60 chars no fallback)", () => {
    const big = "X".repeat(500);
    const summary = summarizeUserAgent(big);
    expect(summary.length).toBeLessThan(80);
  });
});

describe("bandwidthDiagnosticsMiddleware", () => {
  let nextFn;
  let logSpy;
  const envBackup = {};

  beforeEach(() => {
    envBackup.BACKEND_BANDWIDTH_DIAGNOSTICS_ENABLED =
      process.env.BACKEND_BANDWIDTH_DIAGNOSTICS_ENABLED;
    __resetForTests();
    nextFn = vi.fn();
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    if (envBackup.BACKEND_BANDWIDTH_DIAGNOSTICS_ENABLED === undefined) {
      delete process.env.BACKEND_BANDWIDTH_DIAGNOSTICS_ENABLED;
    } else {
      process.env.BACKEND_BANDWIDTH_DIAGNOSTICS_ENABLED =
        envBackup.BACKEND_BANDWIDTH_DIAGNOSTICS_ENABLED;
    }
    logSpy.mockRestore();
    __resetForTests();
  });

  function makeReqRes({ method = "GET", url = "/api/ads", ua = "" } = {}) {
    const req = {
      method,
      originalUrl: url,
      url,
      headers: ua ? { "user-agent": ua } : {},
      ip: "1.2.3.4",
    };

    const finishCallbacks = [];
    const res = {
      statusCode: 200,
      _written: 0,
      write(chunk) {
        this._written += chunk?.length ?? 0;
        return true;
      },
      end(chunk) {
        if (chunk) this._written += chunk.length;
        for (const cb of finishCallbacks) cb();
      },
      on(event, cb) {
        if (event === "finish") finishCallbacks.push(cb);
      },
    };

    return { req, res };
  }

  it("flag OFF: middleware passa direto sem wrap", () => {
    const { req, res } = makeReqRes();
    bandwidthDiagnosticsMiddleware(req, res, nextFn);
    expect(nextFn).toHaveBeenCalledOnce();
    // res.end original ainda funciona; flush sem dados não loga nada
    flushAccumulator();
    expect(logSpy).not.toHaveBeenCalled();
  });

  describe("flag ON", () => {
    beforeEach(() => {
      process.env.BACKEND_BANDWIDTH_DIAGNOSTICS_ENABLED = "true";
    });

    it("conta bytes e emite agregado JSON no flush", () => {
      const { req, res } = makeReqRes({ url: "/api/ads/search?page=2", ua: "AhrefsBot/7.0" });
      bandwidthDiagnosticsMiddleware(req, res, nextFn);
      res.write(Buffer.alloc(1000));
      res.end(Buffer.alloc(500));

      const summary = flushAccumulator();
      expect(summary).not.toBeNull();
      expect(summary.total_requests).toBe(1);
      expect(summary.total_bytes).toBeGreaterThanOrEqual(1500);
      expect(summary.top_route_groups[0].key).toBe("ads_search");
      expect(summary.top_paths[0].key).toBe("GET /api/ads/search");
      expect(summary.top_user_agents[0].key).toBe("bot:ahrefs");
      expect(summary.top_bot_ip_hashes.length).toBeGreaterThan(0);
    });

    it("spike (>512KB) emite linha individual além do agregado", () => {
      const { req, res } = makeReqRes({ url: "/api/public/seo/sitemap" });
      bandwidthDiagnosticsMiddleware(req, res, nextFn);
      res.write(Buffer.alloc(700_000));
      res.end();

      expect(logSpy).toHaveBeenCalled();
      const spikeCall = logSpy.mock.calls.find((args) =>
        args[0]?.includes?.('"event":"backend_bandwidth_spike"')
      );
      expect(spikeCall).toBeDefined();
      const parsed = JSON.parse(spikeCall[0]);
      expect(parsed.bytes).toBeGreaterThan(500_000);
      expect(parsed.path).toBe("/api/public/seo/sitemap");
    });

    it("nunca loga body/cookies/headers completos", () => {
      const { req, res } = makeReqRes();
      req.body = { senha: "secret", token: "abc" };
      req.headers.cookie = "session=should-not-leak";
      req.headers.authorization = "Bearer should-not-leak";
      bandwidthDiagnosticsMiddleware(req, res, nextFn);
      res.end(Buffer.alloc(100));

      const summary = flushAccumulator();
      const json = JSON.stringify(summary);
      expect(json).not.toContain("secret");
      expect(json).not.toContain("should-not-leak");
      expect(json).not.toContain("Bearer");
      expect(json).not.toContain("senha");
    });

    it("flushAccumulator sem requests retorna null e não loga", () => {
      const result = flushAccumulator();
      expect(result).toBeNull();
      expect(logSpy).not.toHaveBeenCalled();
    });
  });
});
