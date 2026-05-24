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

  // briefing P1 2026-05-25 — slug de anúncio real terminado em
  // -<13 dígitos> (Unix ms timestamp) NÃO deve cair no anti-bot,
  // mesmo com 13 hifens. Antes desta exceção, o guard bloqueava
  // 6 de 7 anúncios reais do catálogo SP.
  describe("whitelist real-ad: slugs terminados em -<13 dígitos>", () => {
    const realSlugs = [
      // do catálogo /comprar/estado/sp 2026-05-25:
      "byd-dolphin-mini-eletrico-2026-1776912624710", // 5 hífens, ok via threshold
      "fiat-pulse-drive-1-3-8v-flex-aut-2024-1776035190091", // 9 hífens, antes 410
      "gm-chevrolet-onix-hatch-1-0-12v-flex-5p-mec-2024-1778119090914", // 11 hífens, antes 410
      "gm-chevrolet-onix-sedan-plus-1-0-12v-tb-flex-aut-2024-1776302907782", // 12 hífens, antes 410
      "vw-volkswagen-nivus-comfortline-1-0-200-tsi-flex-aut-2024-1776912109892", // 11 hífens, antes 410
      "vw-volkswagen-t-cross-200-tsi-1-0-flex-12v-5p-aut-2024-1775008912992", // 13 hífens, antes 410
    ];
    for (const slug of realSlugs) {
      it(`real-ad slug NÃO é abusivo: ${slug}`, () => {
        expect(isAbusivePath(`/api/ads/${slug}`)).toBe(false);
      });
    }

    it("slug sem sufixo -<13 dígitos> mas com 9+ hífens AINDA é abusivo", () => {
      // mesmo do teste anterior, garantia de que a whitelist é específica.
      expect(
        isAbusivePath("/api/ads/jeep-renegade-byd-yuan-plus-nissan-kicks-honda-civic-caoa-chery")
      ).toBe(true);
    });

    it("slug com sufixo -<11 dígitos> (curto) ainda é abusivo se >8 hífens", () => {
      // padrão visto em log de bot (2026-05-24): -17754205033 tem 11 dígitos,
      // não os 13 do unix ms timestamp.
      expect(
        isAbusivePath(
          "/api/ads/honda-civic-nissan-kicks-nissan-kicks-honda-civic-byd-yuan-plus-fiat-pulse-drive-1-0-turbo-200-flex-aut-2023-17754205033"
        )
      ).toBe(true);
    });

    it("slug com sufixo -<14 dígitos> (longo, fora do range Unix ms) ainda é abusivo", () => {
      // proteção contra forja: bot adicionar 14 dígitos não passa.
      expect(
        isAbusivePath(
          "/api/ads/jeep-renegade-honda-civic-nissan-kicks-volkswagen-taos-fiat-pulse-12345678901234"
        )
      ).toBe(true);
    });
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
