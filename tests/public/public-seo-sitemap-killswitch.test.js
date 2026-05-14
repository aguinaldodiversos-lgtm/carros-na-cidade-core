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
  getPublicSitemapByType as ctrlByType,
  getPublicSitemapByRegion as ctrlByRegion,
} from "../../src/modules/public/public-seo.controller.js";

function makeRes() {
  const headers = {};
  const res = {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    set(name, value) {
      if (typeof name === "object") {
        for (const [k, v] of Object.entries(name)) {
          headers[k.toLowerCase()] = v;
        }
        return this;
      }
      headers[name.toLowerCase()] = value;
      return this;
    },
    json(body) {
      this.body = body;
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

const envBackup = {};

beforeEach(() => {
  envBackup.SITEMAP_PUBLIC_ENABLED = process.env.SITEMAP_PUBLIC_ENABLED;
  delete process.env.SITEMAP_PUBLIC_ENABLED;
  for (const m of Object.values(mocks)) m.mockReset();
});

afterEach(() => {
  if (envBackup.SITEMAP_PUBLIC_ENABLED === undefined) {
    delete process.env.SITEMAP_PUBLIC_ENABLED;
  } else {
    process.env.SITEMAP_PUBLIC_ENABLED = envBackup.SITEMAP_PUBLIC_ENABLED;
  }
});

describe("Sitemap kill switch (SITEMAP_PUBLIC_ENABLED)", () => {
  describe("default OFF (env ausente)", () => {
    it("/sitemap XML responde 503 leve + X-Robots-Tag noindex + sem chamar service", async () => {
      const res = makeRes();
      await sendCanonicalSitemapXml({ query: {} }, res);

      expect(res.statusCode).toBe(503);
      expect(res._headers["x-robots-tag"]).toContain("noindex");
      expect(res._headers["retry-after"]).toBe("3600");
      expect(res._headers["content-type"]).toContain("application/xml");
      expect(res.body).toContain("temporariamente desabilitado");
      expect(mocks.listPublicSitemapEntries).not.toHaveBeenCalled();
    });

    it("/sitemap.json responde 503 leve", async () => {
      const res = makeRes();
      await getPublicSitemapJson({ query: {} }, res, vi.fn());

      expect(res.statusCode).toBe(503);
      expect(res.body).toEqual({ success: false, error: "sitemap_disabled" });
      expect(mocks.listPublicSitemapEntries).not.toHaveBeenCalled();
    });

    it("/sitemap/type/:type responde 503 leve sem chamar service", async () => {
      const res = makeRes();
      await ctrlByType({ query: {}, params: { type: "estado" } }, res, vi.fn());
      expect(res.statusCode).toBe(503);
      expect(mocks.getPublicSitemapByType).not.toHaveBeenCalled();
    });

    it("/sitemap/region/:state responde 503 leve sem chamar service", async () => {
      const res = makeRes();
      await ctrlByRegion({ query: {}, params: { state: "sp" } }, res, vi.fn());
      expect(res.statusCode).toBe(503);
      expect(mocks.getPublicSitemapByRegion).not.toHaveBeenCalled();
    });

    it("503 vem com Retry-After e cache curto (não cacheia para sempre)", async () => {
      const res = makeRes();
      await getPublicSitemapJson({ query: {} }, res, vi.fn());
      expect(res._headers["retry-after"]).toBe("3600");
      const cc = res._headers["cache-control"];
      // cache curto (5 min) ao invés do forte da rota normal — facilita
      // reverter quando reativar via env
      expect(cc).toContain("max-age=300");
    });
  });

  describe("explicitly ON (=true)", () => {
    beforeEach(() => {
      process.env.SITEMAP_PUBLIC_ENABLED = "true";
    });

    it("/sitemap.json chama service e devolve cache forte", async () => {
      mocks.listPublicSitemapEntries.mockResolvedValue([{ loc: "/x", lastmod: null }]);
      const res = makeRes();
      await getPublicSitemapJson({ query: {} }, res, vi.fn());
      expect(res.statusCode).toBe(200);
      expect(res._headers["cache-control"]).toContain("s-maxage=86400");
      expect(mocks.listPublicSitemapEntries).toHaveBeenCalled();
    });

    it("/sitemap/type/:type chama service e devolve cache forte", async () => {
      mocks.getPublicSitemapByType.mockResolvedValue([{ loc: "/x" }]);
      const res = makeRes();
      await ctrlByType({ query: {}, params: { type: "estado" } }, res, vi.fn());
      expect(res.statusCode).toBe(200);
      expect(res._headers["cache-control"]).toContain("s-maxage=86400");
      expect(mocks.getPublicSitemapByType).toHaveBeenCalled();
    });
  });

  describe("explicitly OFF (=false)", () => {
    beforeEach(() => {
      process.env.SITEMAP_PUBLIC_ENABLED = "false";
    });

    it("/sitemap.json responde 503 (mesma rota do default OFF)", async () => {
      const res = makeRes();
      await getPublicSitemapJson({ query: {} }, res, vi.fn());
      expect(res.statusCode).toBe(503);
    });
  });
});
