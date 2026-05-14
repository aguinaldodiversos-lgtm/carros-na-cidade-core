import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redis: { get: vi.fn(), set: vi.fn() },
}));

vi.mock("../../src/infrastructure/cache/redis.js", () => ({
  redis: mocks.redis,
}));

import { cacheGet } from "../../src/shared/cache/cache.middleware.js";

function makeRes() {
  const headers = {};
  const res = {
    statusCode: 200,
    headersSent: false,
    set: vi.fn(),
    setHeader: vi.fn((k, v) => {
      headers[k.toLowerCase()] = v;
    }),
    status(code) {
      this.statusCode = code;
      return this;
    },
    json: vi.fn(function jsonFn(body) {
      this.body = body;
      return this;
    }),
  };
  res._headers = headers;
  return res;
}

beforeEach(() => {
  mocks.redis.get.mockReset();
  mocks.redis.set.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("cacheGet — allowedQueryKeys (cache key whitelist)", () => {
  it("sem allowedQueryKeys: comportamento legado, query inteira entra na key", async () => {
    mocks.redis.get.mockResolvedValue(null);
    const mw = cacheGet({ prefix: "ads:list", ttlSeconds: 30 });

    // Duas requests com query DIFERENTES devem ter cache keys distintas
    const req1 = { method: "GET", path: "/api/ads", query: { utm: "a" }, params: {} };
    const req2 = { method: "GET", path: "/api/ads", query: { utm: "b" }, params: {} };

    await mw(req1, makeRes(), () => {});
    await mw(req2, makeRes(), () => {});

    // duas chaves diferentes foram consultadas
    const keys = mocks.redis.get.mock.calls.map((c) => c[0]);
    expect(keys[0]).not.toBe(keys[1]);
  });

  it("com allowedQueryKeys: params lixo (utm, fbclid) NÃO entram na key", async () => {
    mocks.redis.get.mockResolvedValue(null);
    const mw = cacheGet({
      prefix: "ads:list",
      ttlSeconds: 30,
      allowedQueryKeys: ["page", "limit", "brand"],
    });

    const req1 = {
      method: "GET",
      path: "/api/ads",
      query: { brand: "fiat", utm_source: "ahrefs", fbclid: "xxx" },
      params: {},
    };
    const req2 = {
      method: "GET",
      path: "/api/ads",
      query: { brand: "fiat", utm_source: "semrush", fbclid: "yyy", _t: "12345" },
      params: {},
    };

    await mw(req1, makeRes(), () => {});
    await mw(req2, makeRes(), () => {});

    const keys = mocks.redis.get.mock.calls.map((c) => c[0]);
    expect(keys[0]).toBe(keys[1]); // mesma key — utm/fbclid/_t ignorados
  });

  it("com allowedQueryKeys: params LEGÍTIMOS distintos GERAM keys distintas", async () => {
    mocks.redis.get.mockResolvedValue(null);
    const mw = cacheGet({
      prefix: "ads:list",
      ttlSeconds: 30,
      allowedQueryKeys: ["page", "limit", "brand"],
    });

    const req1 = { method: "GET", path: "/api/ads", query: { brand: "fiat" }, params: {} };
    const req2 = { method: "GET", path: "/api/ads", query: { brand: "honda" }, params: {} };

    await mw(req1, makeRes(), () => {});
    await mw(req2, makeRes(), () => {});

    const keys = mocks.redis.get.mock.calls.map((c) => c[0]);
    expect(keys[0]).not.toBe(keys[1]);
  });

  it("com allowedQueryKeys vazio: ignora qualquer query", async () => {
    mocks.redis.get.mockResolvedValue(null);
    const mw = cacheGet({
      prefix: "ads:list",
      ttlSeconds: 30,
      allowedQueryKeys: [],
    });

    const req1 = { method: "GET", path: "/api/ads", query: { brand: "fiat" }, params: {} };
    const req2 = { method: "GET", path: "/api/ads", query: { brand: "honda" }, params: {} };

    await mw(req1, makeRes(), () => {});
    await mw(req2, makeRes(), () => {});

    const keys = mocks.redis.get.mock.calls.map((c) => c[0]);
    expect(keys[0]).toBe(keys[1]); // mesma key — nada na query importou
  });
});
