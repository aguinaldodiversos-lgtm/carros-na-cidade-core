import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  buildVehicleImageProxyUrlFromStorageKey,
  collectVehicleImageCandidates,
  LISTING_CARD_FALLBACK_IMAGE,
  normalizeVehicleGalleryImages,
  normalizeVehicleImageUrl,
  resolvePublicListingImageUrl,
  isSupportedVehicleImageUrl,
} from "./detail-utils";

const envKeys = [
  "API_URL",
  "NEXT_PUBLIC_API_URL",
  "NEXT_PUBLIC_R2_PUBLIC_BASE_URL",
  "PUBLIC_EMIT_LEGACY_IMAGE_PROXY",
  "NODE_ENV",
] as const;

// `process.env.NODE_ENV` é tipado readonly pelo @types/node; cast pra Record
// mantém manipulação possível e o `as const` da chave evita typo.
const env = process.env as Record<string, string | undefined>;

describe("vehicle detail image utils", () => {
  const snapshot: Partial<Record<(typeof envKeys)[number], string | undefined>> = {};

  beforeEach(() => {
    for (const key of envKeys) {
      snapshot[key] = env[key];
      delete env[key];
    }
    // Default explícito para "produção" — sem R2 público e sem legacy proxy.
    // Testes que precisam do comportamento legado setam as envs.
    env.NODE_ENV = "production";
    env.PUBLIC_EMIT_LEGACY_IMAGE_PROXY = "true";
  });

  afterEach(() => {
    for (const key of envKeys) {
      const value = snapshot[key];
      if (value === undefined) delete env[key];
      else env[key] = value;
    }
  });

  it("aceita imagens locais de upload em jpg, jpeg e png", () => {
    expect(isSupportedVehicleImageUrl("/uploads/ads/foto.jpg")).toBe(true);
    expect(isSupportedVehicleImageUrl("/uploads/ads/foto.jpeg")).toBe(true);
    expect(isSupportedVehicleImageUrl("/uploads/ads/foto.png")).toBe(true);
  });

  describe("com legacyImageProxy=true (compat dev / legado)", () => {
    it("normaliza /uploads/... para o proxy quando legacyImageProxy está ligado", () => {
      expect(normalizeVehicleImageUrl("/uploads/ads/foto.jpg")).toBe(
        "/api/vehicle-images?src=%2Fuploads%2Fads%2Ffoto.jpg"
      );
      expect(normalizeVehicleImageUrl("uploads/ads/foto.jpeg")).toBe(
        "/api/vehicle-images?src=%2Fuploads%2Fads%2Ffoto.jpeg"
      );
      expect(normalizeVehicleImageUrl("uploads\\ads\\foto.png")).toBe(
        "/api/vehicle-images?src=%2Fuploads%2Fads%2Ffoto.png"
      );
    });

    it("coleta /uploads/... como proxy em listas", () => {
      const images = collectVehicleImageCandidates(
        ["/uploads/ads/primeira.jpg", "uploads/ads/segunda.jpeg"],
        '[{"url":"/uploads/ads/terceira.png"}]',
        { image_url: "/uploads/ads/quarta.jpg" }
      );
      expect(images).toEqual([
        "/api/vehicle-images?src=%2Fuploads%2Fads%2Fprimeira.jpg",
        "/api/vehicle-images?src=%2Fuploads%2Fads%2Fsegunda.jpeg",
        "/api/vehicle-images?src=%2Fuploads%2Fads%2Fterceira.png",
        "/api/vehicle-images?src=%2Fuploads%2Fads%2Fquarta.jpg",
      ]);
    });

    it("resolvePublicListingImageUrl usa proxy para /uploads/", () => {
      expect(
        resolvePublicListingImageUrl({
          images: ["/uploads/ads/card.jpg"],
        })
      ).toBe("/api/vehicle-images?src=%2Fuploads%2Fads%2Fcard.jpg");
    });
  });

  describe("com legacyImageProxy=false (produção default)", () => {
    beforeEach(() => {
      env.PUBLIC_EMIT_LEGACY_IMAGE_PROXY = "false";
    });

    it("NÃO converte /uploads/... para proxy — devolve null (cai no placeholder)", () => {
      expect(normalizeVehicleImageUrl("/uploads/ads/foto.jpg")).toBeNull();
      expect(normalizeVehicleImageUrl("uploads/ads/foto.jpeg")).toBeNull();
    });

    it("resolvePublicListingImageUrl cai no placeholder quando só há /uploads/", () => {
      expect(resolvePublicListingImageUrl({ images: ["/uploads/ads/x.jpg"] })).toBe(
        LISTING_CARD_FALLBACK_IMAGE
      );
    });
  });

  it("preserva URLs absolutas válidas de backend para formatos suportados", () => {
    process.env.API_URL = "http://127.0.0.1:4012";

    expect(normalizeVehicleImageUrl("http://127.0.0.1:4012/uploads/ads/foto.jpg")).toBe(
      "http://127.0.0.1:4012/uploads/ads/foto.jpg"
    );
    expect(normalizeVehicleImageUrl("https://cdn.example.com/fotos/carro.jpeg")).toBe(
      "https://cdn.example.com/fotos/carro.jpeg"
    );
  });

  it("preserva proxy relativo do portal sem reenviar para o host da API", () => {
    process.env.API_URL = "https://carros-na-cidade-core.onrender.com";

    expect(normalizeVehicleImageUrl("/api/vehicle-images?src=%2Fuploads%2Fads%2Ffoto.jpg")).toBe(
      "/api/vehicle-images?src=%2Fuploads%2Fads%2Ffoto.jpg"
    );
  });

  it("corrige proxy absoluto no host errado e remove dupla codificação do src", () => {
    process.env.API_URL = "https://carros-na-cidade-core.onrender.com";

    expect(
      normalizeVehicleImageUrl(
        "https://carros-na-cidade-core.onrender.com/api/vehicle-images?src=%252Fuploads%252Fads%252Ffoto.jpg"
      )
    ).toBe("/api/vehicle-images?src=%2Fuploads%2Fads%2Ffoto.jpg");
  });

  it("remove placeholders conhecidos da lista final da galeria", () => {
    const images = normalizeVehicleGalleryImages([
      "/images/hero.jpeg",
      "/images/banner1.jpg",
      "/uploads/ads/foto.jpg",
      "",
      null,
    ]);

    expect(images).toEqual(["/api/vehicle-images?src=%2Fuploads%2Fads%2Ffoto.jpg"]);
  });

  it("resolvePublicListingImageUrl aceita cover_image_url, photos e gallery (legacy proxy)", () => {
    expect(
      resolvePublicListingImageUrl({
        cover_image_url: "/uploads/ads/capa.jpg",
      })
    ).toBe("/api/vehicle-images?src=%2Fuploads%2Fads%2Fcapa.jpg");

    expect(
      resolvePublicListingImageUrl({
        photos: [{ url: "/uploads/ads/foto-1.jpg" }],
      })
    ).toBe("/api/vehicle-images?src=%2Fuploads%2Fads%2Ffoto-1.jpg");

    expect(
      resolvePublicListingImageUrl({
        gallery: '[{"url":"/uploads/ads/galeria.png"}]',
      })
    ).toBe("/api/vehicle-images?src=%2Fuploads%2Fads%2Fgaleria.png");
  });

  describe("storage_key → URL pública R2", () => {
    it("sem NEXT_PUBLIC_R2_PUBLIC_BASE_URL: cai no proxy /api/vehicle-images?key=...", () => {
      expect(buildVehicleImageProxyUrlFromStorageKey("vehicles/abc/foto.webp")).toBe(
        "/api/vehicle-images?key=vehicles%2Fabc%2Ffoto.webp"
      );
    });

    it("com NEXT_PUBLIC_R2_PUBLIC_BASE_URL: gera URL absoluta direta (sem passar pelo Render)", () => {
      process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL = "https://cdn.carrosnacidade.com";
      expect(buildVehicleImageProxyUrlFromStorageKey("vehicles/abc/foto.webp")).toBe(
        "https://cdn.carrosnacidade.com/vehicles/abc/foto.webp"
      );
    });

    it("aceita trailing slash no base URL", () => {
      process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL = "https://cdn.carrosnacidade.com/";
      expect(buildVehicleImageProxyUrlFromStorageKey("vehicles/abc/foto.webp")).toBe(
        "https://cdn.carrosnacidade.com/vehicles/abc/foto.webp"
      );
    });

    it("encode-URL components do path (espaços, caracteres especiais) por segmento", () => {
      process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL = "https://cdn.example.com";
      expect(buildVehicleImageProxyUrlFromStorageKey("vehicles/draft id 1/foto bonita.webp")).toBe(
        "https://cdn.example.com/vehicles/draft%20id%201/foto%20bonita.webp"
      );
    });

    it("bloqueia path traversal", () => {
      expect(buildVehicleImageProxyUrlFromStorageKey("../etc/passwd")).toBeNull();
    });

    it("resolvePublicListingImageUrl emite URL R2 direta quando configurado", () => {
      process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL = "https://cdn.carrosnacidade.com";
      expect(
        resolvePublicListingImageUrl({
          storage_key: "vehicles/abc/foto.webp",
          images: [],
        })
      ).toBe("https://cdn.carrosnacidade.com/vehicles/abc/foto.webp");
    });

    it("re-hidrata /api/vehicle-images?key=... persistido para R2 direto", () => {
      process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL = "https://cdn.carrosnacidade.com";
      expect(normalizeVehicleImageUrl("/api/vehicle-images?key=vehicles%2Fabc%2Ffoto.webp")).toBe(
        "https://cdn.carrosnacidade.com/vehicles/abc/foto.webp"
      );
    });

    it("mantém /api/vehicle-images?key=... quando R2 público não está configurado", () => {
      expect(normalizeVehicleImageUrl("/api/vehicle-images?key=vehicles%2Fabc%2Ffoto.webp")).toBe(
        "/api/vehicle-images?key=vehicles%2Fabc%2Ffoto.webp"
      );
    });
  });

  it("resolvePublicListingImageUrl prioriza image_url sobre storage_key", () => {
    process.env.PUBLIC_EMIT_LEGACY_IMAGE_PROXY = "true";
    expect(
      resolvePublicListingImageUrl({
        image_url: "/uploads/ads/x.jpg",
        storage_key: "ads/123/capa.jpg",
      })
    ).toBe("/api/vehicle-images?src=%2Fuploads%2Fads%2Fx.jpg");
  });
});
