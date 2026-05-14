import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listPublicSitemapEntries: vi.fn(),
  getPublicSitemapByType: vi.fn(),
  getPublicSitemapByRegion: vi.fn(),
  getInternalLinksByPath: vi.fn(),
}));

vi.mock("../../src/modules/public/public-seo.service.js", () => ({
  listPublicSitemapEntries: mocks.listPublicSitemapEntries,
}));

vi.mock("../../src/read-models/seo/sitemap-public.service.js", () => ({
  getPublicSitemapByType: mocks.getPublicSitemapByType,
  getPublicSitemapByRegion: mocks.getPublicSitemapByRegion,
}));

vi.mock("../../src/read-models/seo/internal-links-public.service.js", () => ({
  getInternalLinksByPath: mocks.getInternalLinksByPath,
}));

import {
  sendCanonicalSitemapXml,
  getPublicSitemapJson,
  getPublicSitemapByType as ctrlGetByType,
  getPublicSitemapByRegion as ctrlGetByRegion,
} from "../../src/modules/public/public-seo.controller.js";

const listPublicSitemapEntries = mocks.listPublicSitemapEntries;
const getPublicSitemapByType = mocks.getPublicSitemapByType;
const getPublicSitemapByRegion = mocks.getPublicSitemapByRegion;

function makeRes() {
  const headers = {};
  const res = {
    statusCode: 200,
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
    send(body) {
      this.body = body;
      return this;
    },
  };
  res._headers = headers;
  return res;
}

function makeReq({ query = {}, params = {} } = {}) {
  return { query, params };
}

const EXPECTED_CACHE =
  "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800";

beforeEach(() => {
  listPublicSitemapEntries.mockReset();
  getPublicSitemapByType.mockReset();
  getPublicSitemapByRegion.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("sitemap cache (E2 — outbound bandwidth)", () => {
  describe("GET /api/public/seo/sitemap (XML)", () => {
    it("sucesso devolve Cache-Control forte", async () => {
      listPublicSitemapEntries.mockResolvedValue([
        { loc: "/anuncios/sao-paulo", lastmod: "2026-05-13T00:00:00Z" },
      ]);
      const res = makeRes();
      await sendCanonicalSitemapXml(makeReq(), res);

      expect(res.statusCode).toBe(200);
      expect(res._headers["cache-control"]).toBe(EXPECTED_CACHE);
      expect(res._headers["content-type"]).toContain("application/xml");
      expect(typeof res.body).toBe("string");
      expect(res.body).toContain("<urlset");
    });

    it("erro do service ainda devolve fallback mas com no-store (não cachear falha)", async () => {
      listPublicSitemapEntries.mockRejectedValue(new Error("db down"));
      const res = makeRes();
      await sendCanonicalSitemapXml(makeReq(), res);

      expect(res.statusCode).toBe(200);
      expect(res._headers["cache-control"]).toBe("no-store");
    });
  });

  describe("GET /api/public/seo/sitemap.json", () => {
    it("sucesso devolve Cache-Control forte", async () => {
      listPublicSitemapEntries.mockResolvedValue([
        { loc: "/anuncios/sao-paulo", lastmod: "2026-05-13T00:00:00Z" },
      ]);
      const res = makeRes();
      await getPublicSitemapJson(makeReq(), res, vi.fn());

      expect(res.statusCode).toBe(200);
      expect(res._headers["cache-control"]).toBe(EXPECTED_CACHE);
      expect(res._headers["content-type"]).toContain("application/json");
      expect(res.body?.success).toBe(true);
    });

    it("erro vai para next() sem setar cache (handler global decide)", async () => {
      listPublicSitemapEntries.mockRejectedValue(new Error("db down"));
      const next = vi.fn();
      const res = makeRes();
      await getPublicSitemapJson(makeReq(), res, next);
      expect(next).toHaveBeenCalled();
    });
  });

  describe("GET /api/public/seo/sitemap/type/:type", () => {
    it("sucesso devolve Cache-Control forte", async () => {
      getPublicSitemapByType.mockResolvedValue([{ loc: "/comprar/sp" }]);
      const res = makeRes();
      await ctrlGetByType(makeReq({ params: { type: "estado" } }), res, vi.fn());

      expect(res.statusCode).toBe(200);
      expect(res._headers["cache-control"]).toBe(EXPECTED_CACHE);
      expect(res.body?.success).toBe(true);
    });

    it("erro vai para next() (não cacheia falha)", async () => {
      getPublicSitemapByType.mockRejectedValue(new Error("db down"));
      const next = vi.fn();
      const res = makeRes();
      await ctrlGetByType(makeReq({ params: { type: "estado" } }), res, next);
      expect(next).toHaveBeenCalled();
      expect(res._headers["cache-control"]).toBeUndefined();
    });
  });

  describe("GET /api/public/seo/sitemap/region/:state", () => {
    it("sucesso devolve Cache-Control forte", async () => {
      getPublicSitemapByRegion.mockResolvedValue([{ loc: "/comprar/sp" }]);
      const res = makeRes();
      await ctrlGetByRegion(makeReq({ params: { state: "sp" } }), res, vi.fn());

      expect(res.statusCode).toBe(200);
      expect(res._headers["cache-control"]).toBe(EXPECTED_CACHE);
      expect(res.body?.success).toBe(true);
    });

    it("erro vai para next() (não cacheia falha)", async () => {
      getPublicSitemapByRegion.mockRejectedValue(new Error("db down"));
      const next = vi.fn();
      const res = makeRes();
      await ctrlGetByRegion(makeReq({ params: { state: "sp" } }), res, next);
      expect(next).toHaveBeenCalled();
      expect(res._headers["cache-control"]).toBeUndefined();
    });
  });
});
