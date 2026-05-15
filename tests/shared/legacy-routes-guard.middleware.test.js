import { describe, expect, it, vi } from "vitest";

import {
  isAbusivePath,
  isLegacyPublicPath,
  legacyRoutesGuardMiddleware,
} from "../../src/shared/middlewares/legacy-routes-guard.middleware.js";

function makeRes() {
  const headers = {};
  const res = {
    statusCode: 200,
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
      return this;
    },
  };
  res._headers = headers;
  return res;
}

function makeReq(path) {
  return { path, url: path };
}

describe("isLegacyPublicPath", () => {
  const cases = [
    "/catalog/ads/jeep-renegade-byd-yuan-plus-nissan-kicks-honda-civic",
    "/public/listings/algum-slug-aleatorio",
    "/public/ads/qualquer-anuncio",
    "/ads/abc",
    "/api/ads/slug/jeep-renegade",
    "/api/ads/by-slug/qualquer",
    "/listings",
    "/listings/foo",
    "/listing/abc",
  ];
  for (const p of cases) {
    it(`reconhece path legado: ${p}`, () => {
      expect(isLegacyPublicPath(p)).toBe(true);
    });
  }

  const validPaths = [
    "/api/ads",
    "/api/ads/search",
    "/api/ads/facets",
    "/api/ads/autocomplete",
    "/api/ads/abc-123-ad-id",
    "/api/ads/123/event",
    "/api/public/cities/sao-paulo-sp",
    "/api/public/seo/sitemap",
    "/health",
    "/",
  ];
  for (const p of validPaths) {
    it(`NÃO reconhece path válido como legado: ${p}`, () => {
      expect(isLegacyPublicPath(p)).toBe(false);
    });
  }
});

describe("isAbusivePath", () => {
  it("slug com >120 chars é abusivo", () => {
    const longSlug = "a-".repeat(70) + "fim";
    expect(isAbusivePath(`/api/ads/${longSlug}`)).toBe(true);
  });

  it("slug com >=9 hífens (modelos colados) é abusivo", () => {
    expect(
      isAbusivePath("/api/ads/jeep-renegade-byd-yuan-plus-nissan-kicks-honda-civic-caoa-chery")
    ).toBe(true);
  });

  it("slug normal (4-5 hífens) não é abusivo", () => {
    expect(isAbusivePath("/api/ads/honda-civic-2020-flex")).toBe(false);
    expect(isAbusivePath("/api/public/cities/sao-paulo-sp")).toBe(false);
  });

  it("path sem segmento final não é abusivo", () => {
    expect(isAbusivePath("/")).toBe(false);
    expect(isAbusivePath("/api/ads")).toBe(false);
  });
});

describe("legacyRoutesGuardMiddleware", () => {
  it("/catalog/ads/<slug> responde 410 leve com Cache-Control", () => {
    const req = makeReq("/catalog/ads/jeep-renegade-honda-civic");
    const res = makeRes();
    const next = vi.fn();
    legacyRoutesGuardMiddleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(410);
    expect(res.body).toEqual({ error: "gone" });
    expect(res._headers["cache-control"]).toContain("max-age=300");
    expect(res._headers["x-robots-tag"]).toContain("noindex");
  });

  it("/public/listings/<slug> responde 410", () => {
    const res = makeRes();
    legacyRoutesGuardMiddleware(makeReq("/public/listings/foo"), res, vi.fn());
    expect(res.statusCode).toBe(410);
  });

  it("/api/ads/slug/<slug> responde 410", () => {
    const res = makeRes();
    legacyRoutesGuardMiddleware(makeReq("/api/ads/slug/abc"), res, vi.fn());
    expect(res.statusCode).toBe(410);
  });

  it("/api/ads/<slug abusivo> responde 410", () => {
    const longSlug = "jeep-renegade-byd-yuan-plus-nissan-kicks-honda-civic-caoa-chery-tiggo";
    const res = makeRes();
    legacyRoutesGuardMiddleware(makeReq(`/api/ads/${longSlug}`), res, vi.fn());
    expect(res.statusCode).toBe(410);
  });

  it("/api/ads/<id curto válido> passa (não é abusivo)", () => {
    const res = makeRes();
    const next = vi.fn();
    legacyRoutesGuardMiddleware(makeReq("/api/ads/abc-123-id"), res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(200);
  });

  it("/api/ads/search (rota real) passa", () => {
    const res = makeRes();
    const next = vi.fn();
    legacyRoutesGuardMiddleware(makeReq("/api/ads/search"), res, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it("/api/public/cities/<slug-territorial-curto> passa (slug legítimo, não é rota legacy)", () => {
    const res = makeRes();
    const next = vi.fn();
    legacyRoutesGuardMiddleware(makeReq("/api/public/cities/sao-paulo-sp"), res, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it("/health passa", () => {
    const res = makeRes();
    const next = vi.fn();
    legacyRoutesGuardMiddleware(makeReq("/health"), res, next);
    expect(next).toHaveBeenCalledOnce();
  });
});
