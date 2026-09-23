import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/infrastructure/cache/redis.js", () => ({
  redis: null,
}));

import {
  __memoryCacheTesting,
  cacheGet,
  cacheInvalidatePrefix,
} from "../../src/shared/cache/cache.middleware.js";

function makeRes() {
  const headers = {};
  return {
    statusCode: 200,
    body: undefined,
    setHeader(key, value) {
      headers[String(key).toLowerCase()] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
    _headers: headers,
  };
}

function makeReq(query = {}) {
  return {
    method: "GET",
    path: "/api/example",
    query,
    params: {},
  };
}

beforeEach(() => {
  __memoryCacheTesting.clear();
  vi.useRealTimers();
});

describe("cacheGet — fallback LRU em memória sem Redis", () => {
  it("serve HIT da memória sem executar o handler novamente", async () => {
    const mw = cacheGet({
      prefix: "public:test",
      ttlSeconds: 60,
      varyBy: ["query"],
    });
    let handlerCalls = 0;

    const run = async () => {
      const res = makeRes();
      await mw(makeReq({ q: "onix" }), res, () => {
        handlerCalls += 1;
        res.json({ ok: true, value: handlerCalls });
      });
      return res;
    };

    const first = await run();
    const second = await run();

    expect(first.body).toEqual({ ok: true, value: 1 });
    expect(first._headers["x-cache"]).toBe("MISS");
    expect(second.body).toEqual({ ok: true, value: 1 });
    expect(second._headers["x-cache"]).toBe("HIT");
    expect(handlerCalls).toBe(1);
  });

  it("respeita TTL e recalcula após expiração", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-23T00:00:00Z"));

    const mw = cacheGet({ prefix: "public:ttl", ttlSeconds: 1 });
    let handlerCalls = 0;

    const run = async () => {
      const res = makeRes();
      await mw(makeReq(), res, () => {
        handlerCalls += 1;
        res.json({ ok: true, value: handlerCalls });
      });
      return res;
    };

    await run();
    vi.advanceTimersByTime(999);
    expect((await run()).body.value).toBe(1);

    vi.advanceTimersByTime(2);
    expect((await run()).body.value).toBe(2);
    expect(handlerCalls).toBe(2);
  });

  it("invalida por prefixo também sem Redis", async () => {
    const mw = cacheGet({ prefix: "public:city", ttlSeconds: 60 });
    let handlerCalls = 0;

    const run = async () => {
      const res = makeRes();
      await mw(makeReq(), res, () => {
        handlerCalls += 1;
        res.json({ ok: true, value: handlerCalls });
      });
      return res;
    };

    await run();
    expect((await run()).body.value).toBe(1);

    await cacheInvalidatePrefix("public:city");

    expect((await run()).body.value).toBe(2);
    expect(handlerCalls).toBe(2);
  });

  it("mantém tamanho limitado", async () => {
    const max = __memoryCacheTesting.maxEntries;
    for (let i = 0; i < max + 25; i += 1) {
      const mw = cacheGet({
        prefix: "bounded",
        ttlSeconds: 60,
        varyBy: ["query"],
      });
      const res = makeRes();
      await mw(makeReq({ i: String(i) }), res, () => {
        res.json({ ok: true, i });
      });
    }

    expect(__memoryCacheTesting.size()).toBe(max);
  });
});
