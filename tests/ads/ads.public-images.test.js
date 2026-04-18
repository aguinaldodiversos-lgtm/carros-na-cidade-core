import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/infrastructure/storage/r2.service.js", () => ({
  buildR2PublicUrl: vi.fn(() => ""),
}));

import {
  buildCanonicalImageUrlFromStorageKey,
  buildNormalizedPublicImages,
  normalizePublicImageCandidate,
  shouldEmitLegacyImageProxy,
} from "../../src/modules/ads/ads.public-images.js";

describe("ads public images normalization", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("normalizePublicImageCandidate", () => {
    it("converte caminhos legados /uploads/ads na URL do proxy público (portal)", () => {
      expect(normalizePublicImageCandidate("/uploads/ads/foto.jpg")).toBe(
        "/api/vehicle-images?src=%2Fuploads%2Fads%2Ffoto.jpg"
      );
      expect(normalizePublicImageCandidate("uploads/ads/foto.png")).toBe(
        "/api/vehicle-images?src=%2Fuploads%2Fads%2Ffoto.png"
      );
    });

    it("mantém URLs absolutas e proxies já canônicos", () => {
      expect(normalizePublicImageCandidate("https://cdn.example.com/foto.webp")).toBe(
        "https://cdn.example.com/foto.webp"
      );
      expect(
        normalizePublicImageCandidate("/api/vehicle-images?key=vehicles%2Fabc%2Ffoto.webp")
      ).toBe("/api/vehicle-images?key=vehicles%2Fabc%2Ffoto.webp");
    });

    it("converte storage_key cru em URL canônica", () => {
      expect(normalizePublicImageCandidate("vehicles/ad-5/original/foto.webp")).toBe(
        "/api/vehicle-images?key=vehicles%2Fad-5%2Foriginal%2Ffoto.webp"
      );
    });

    it("preserva imagens estáticas /images/", () => {
      expect(normalizePublicImageCandidate("/images/vehicle-placeholder.svg")).toBe(
        "/images/vehicle-placeholder.svg"
      );
    });

    it("retorna null para string vazia", () => {
      expect(normalizePublicImageCandidate("")).toBe(null);
    });

    it("em produção não emite proxy legado por padrão", () => {
      vi.stubEnv("NODE_ENV", "production");
      expect(normalizePublicImageCandidate("/uploads/ads/foto.jpg")).toBe(null);
    });

    it("em produção não emite proxy legado quando PUBLIC_EMIT_LEGACY_IMAGE_PROXY=false", () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("PUBLIC_EMIT_LEGACY_IMAGE_PROXY", "false");
      expect(normalizePublicImageCandidate("/uploads/ads/foto.jpg")).toBe(null);
    });

    it("em produção emite proxy legado quando PUBLIC_EMIT_LEGACY_IMAGE_PROXY=true", () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("PUBLIC_EMIT_LEGACY_IMAGE_PROXY", "true");
      expect(normalizePublicImageCandidate("/uploads/ads/foto.jpg")).toBe(
        "/api/vehicle-images?src=%2Fuploads%2Fads%2Ffoto.jpg"
      );
    });
  });

  describe("shouldEmitLegacyImageProxy", () => {
    it("retorna true quando flag é 'true'", () => {
      vi.stubEnv("PUBLIC_EMIT_LEGACY_IMAGE_PROXY", "true");
      expect(shouldEmitLegacyImageProxy()).toBe(true);
    });

    it("retorna false quando flag é 'false'", () => {
      vi.stubEnv("PUBLIC_EMIT_LEGACY_IMAGE_PROXY", "false");
      expect(shouldEmitLegacyImageProxy()).toBe(false);
    });

    it("retorna false em production sem flag", () => {
      vi.stubEnv("NODE_ENV", "production");
      expect(shouldEmitLegacyImageProxy()).toBe(false);
    });

    it("retorna true em development sem flag", () => {
      vi.stubEnv("NODE_ENV", "development");
      expect(shouldEmitLegacyImageProxy()).toBe(true);
    });
  });

  describe("buildCanonicalImageUrlFromStorageKey", () => {
    it("converte storage_key em proxy quando não há base pública do R2", () => {
      expect(buildCanonicalImageUrlFromStorageKey("vehicles/abc/foto.webp")).toBe(
        "/api/vehicle-images?key=vehicles%2Fabc%2Ffoto.webp"
      );
    });

    it("retorna null para key vazia", () => {
      expect(buildCanonicalImageUrlFromStorageKey("")).toBe(null);
    });

    it("strip leading slashes", () => {
      expect(buildCanonicalImageUrlFromStorageKey("/vehicles/abc/foto.webp")).toBe(
        "/api/vehicle-images?key=vehicles%2Fabc%2Ffoto.webp"
      );
    });
  });

  describe("buildNormalizedPublicImages", () => {
    it("prioriza vehicle_images com storage_key e ignora imagens legadas quebradas", () => {
      const images = buildNormalizedPublicImages(
        {
          id: 25,
          image_url: "/uploads/ads/capa.jpg",
          images: ["/uploads/ads/capa.jpg", "/uploads/ads/galeria.jpg"],
        },
        [
          {
            storage_key: "vehicles/ad-25/original/2026/04/capa.webp",
            image_url: "",
          },
        ]
      );

      expect(images).toEqual([
        "/api/vehicle-images?key=vehicles%2Fad-25%2Foriginal%2F2026%2F04%2Fcapa.webp",
      ]);
    });

    it("ignora vehicle_images só com path legado sem storage_key e usa ads.images", () => {
      const images = buildNormalizedPublicImages(
        {
          id: 41,
          image_url: null,
          images: ["https://cdn.example.com/salva-no-json.jpg"],
        },
        [
          {
            storage_key: "",
            image_url: "/uploads/ads/somente-legado.jpg",
          },
        ]
      );

      expect(images).toEqual(["https://cdn.example.com/salva-no-json.jpg"]);
    });

    it("preserva imagens válidas já persistidas no ads.images, filtrando legado", () => {
      const images = buildNormalizedPublicImages({
        id: 30,
        images: [
          "https://cdn.example.com/a.jpg",
          "/api/vehicle-images?key=vehicles%2F30%2Fa.jpg",
          "/uploads/ads/quebrada.jpg",
        ],
      });

      expect(images).toEqual([
        "https://cdn.example.com/a.jpg",
        "/api/vehicle-images?key=vehicles%2F30%2Fa.jpg",
      ]);
    });

    it("retorna array vazio quando não há imagens válidas", () => {
      vi.stubEnv("NODE_ENV", "production");
      const images = buildNormalizedPublicImages({
        id: 99,
        images: ["/uploads/ads/only-legacy.jpg"],
      });
      expect(images).toEqual([]);
    });

    it("deduplica URLs", () => {
      const images = buildNormalizedPublicImages(
        {
          id: 50,
          images: [
            "/api/vehicle-images?key=vehicles%2F50%2Fa.jpg",
            "/api/vehicle-images?key=vehicles%2F50%2Fa.jpg",
          ],
        },
        []
      );
      expect(images).toEqual(["/api/vehicle-images?key=vehicles%2F50%2Fa.jpg"]);
    });

    it("parseia images como string JSON", () => {
      const images = buildNormalizedPublicImages({
        id: 60,
        images: '["https://cdn.example.com/a.jpg"]',
      });
      expect(images).toEqual(["https://cdn.example.com/a.jpg"]);
    });

    it("lida com vehicle_images múltiplas com storage_key", () => {
      const images = buildNormalizedPublicImages({ id: 70, images: [] }, [
        { storage_key: "vehicles/70/cover.webp", image_url: "" },
        { storage_key: "vehicles/70/gallery-1.webp", image_url: "" },
      ]);
      expect(images).toHaveLength(2);
      expect(images[0]).toContain("cover.webp");
      expect(images[1]).toContain("gallery-1.webp");
    });

    it("não retorna imagens de vehicle_images sem storage_key quando ads.images tem R2 URL", () => {
      const images = buildNormalizedPublicImages(
        {
          id: 80,
          images: ["/api/vehicle-images?key=vehicles%2F80%2Fphoto.webp"],
        },
        [{ storage_key: "", image_url: "/uploads/ads/legacy.jpg" }]
      );
      expect(images).toEqual(["/api/vehicle-images?key=vehicles%2F80%2Fphoto.webp"]);
    });
  });
});
