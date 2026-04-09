import { describe, expect, it } from "vitest";

import {
  classifyAdImageState,
  guessMimeFromFilename,
  isCanonicalAdImageUrl,
  isLegacyUploadPathString,
  normalizeLegacyUploadPath,
  parseImagesJson,
  suggestOrphanAction,
} from "../../scripts/lib/legacy-ad-image-migration.mjs";

describe("legacy-ad-image-migration helpers", () => {
  describe("normalizeLegacyUploadPath", () => {
    it("normaliza path legado com e sem barra", () => {
      expect(normalizeLegacyUploadPath("uploads/ads/x.png")).toBe("/uploads/ads/x.png");
      expect(normalizeLegacyUploadPath("/uploads/ads/x.png")).toBe("/uploads/ads/x.png");
    });

    it("rejeita URLs absolutas", () => {
      expect(normalizeLegacyUploadPath("https://x.com/y")).toBe("");
    });

    it("rejeita string vazia ou nula", () => {
      expect(normalizeLegacyUploadPath("")).toBe("");
      expect(normalizeLegacyUploadPath(null)).toBe("");
      expect(normalizeLegacyUploadPath(undefined)).toBe("");
    });

    it("normaliza backslashes do Windows", () => {
      expect(normalizeLegacyUploadPath("uploads\\ads\\foto.jpg")).toBe("/uploads/ads/foto.jpg");
    });
  });

  describe("isLegacyUploadPathString", () => {
    it("detecta caminhos legados", () => {
      expect(isLegacyUploadPathString("/uploads/ads/foto.jpg")).toBe(true);
      expect(isLegacyUploadPathString("uploads/ads/foto.jpg")).toBe(true);
    });

    it("rejeita caminhos canônicos", () => {
      expect(isLegacyUploadPathString("/api/vehicle-images?key=x")).toBe(false);
      expect(isLegacyUploadPathString("https://cdn.example.com/x.jpg")).toBe(false);
    });
  });

  describe("isCanonicalAdImageUrl", () => {
    it("aceita URLs absolutas como canônicas", () => {
      expect(isCanonicalAdImageUrl("https://cdn.example.com/x.jpg")).toBe(true);
    });

    it("aceita proxy /api/vehicle-images como canônico", () => {
      expect(isCanonicalAdImageUrl("/api/vehicle-images?key=abc")).toBe(true);
    });

    it("aceita storage_key como canônico", () => {
      expect(isCanonicalAdImageUrl("vehicles/ad-1/original/foto.webp")).toBe(true);
    });

    it("rejeita path legado", () => {
      expect(isCanonicalAdImageUrl("/uploads/ads/foto.jpg")).toBe(false);
    });

    it("rejeita string vazia", () => {
      expect(isCanonicalAdImageUrl("")).toBe(false);
    });
  });

  describe("guessMimeFromFilename", () => {
    it("infere mime por extensão conhecida", () => {
      expect(guessMimeFromFilename("a.webp")).toBe("image/webp");
      expect(guessMimeFromFilename("b.jpg")).toBe("image/jpeg");
      expect(guessMimeFromFilename("c.jpeg")).toBe("image/jpeg");
      expect(guessMimeFromFilename("d.png")).toBe("image/png");
      expect(guessMimeFromFilename("e.avif")).toBe("image/avif");
    });

    it("retorna string vazia para extensão desconhecida", () => {
      expect(guessMimeFromFilename("a.unknown")).toBe("");
      expect(guessMimeFromFilename("a.txt")).toBe("");
    });
  });

  describe("parseImagesJson", () => {
    it("aceita array direto", () => {
      expect(parseImagesJson(["a", "b"])).toEqual(["a", "b"]);
    });

    it("parseia string JSON", () => {
      expect(parseImagesJson('["/uploads/ads/a.png"]')).toEqual(["/uploads/ads/a.png"]);
    });

    it("retorna array vazio para null/undefined", () => {
      expect(parseImagesJson(null)).toEqual([]);
      expect(parseImagesJson(undefined)).toEqual([]);
      expect(parseImagesJson("")).toEqual([]);
    });

    it("trata string simples como item único", () => {
      expect(parseImagesJson("/uploads/ads/x.jpg")).toEqual(["/uploads/ads/x.jpg"]);
    });

    it("filtra itens vazios", () => {
      expect(parseImagesJson(["a", "", null, "b"])).toEqual(["a", "b"]);
    });
  });

  describe("classifyAdImageState", () => {
    it("classifica como already_migrated quando só storage_key sem legado", () => {
      expect(
        classifyAdImageState({
          hasStorageKeyInVehicleImages: true,
          hasLegacyInAdsJson: false,
          hasLegacyInVehicleImageUrl: false,
        })
      ).toBe("already_migrated");
    });

    it("classifica como migratable quando há legado com binário disponível", () => {
      expect(
        classifyAdImageState({
          hasStorageKeyInVehicleImages: false,
          hasLegacyInAdsJson: true,
          hasLegacyInVehicleImageUrl: false,
          hasBinaryAvailable: true,
        })
      ).toBe("migratable");
    });

    it("classifica como orphan quando há legado sem binário disponível", () => {
      expect(
        classifyAdImageState({
          hasStorageKeyInVehicleImages: false,
          hasLegacyInAdsJson: true,
          hasLegacyInVehicleImageUrl: false,
          hasBinaryAvailable: false,
        })
      ).toBe("orphan");
    });

    it("classifica como migratable_or_orphan quando binário não foi verificado", () => {
      expect(
        classifyAdImageState({
          hasStorageKeyInVehicleImages: false,
          hasLegacyInAdsJson: true,
          hasLegacyInVehicleImageUrl: false,
        })
      ).toBe("migratable_or_orphan");
    });

    it("classifica como inconsistent quando storage_key existe mas ads.json não tem legado e vehicle_images tem", () => {
      expect(
        classifyAdImageState({
          hasStorageKeyInVehicleImages: true,
          hasLegacyInAdsJson: false,
          hasLegacyInVehicleImageUrl: true,
        })
      ).toBe("inconsistent");
    });

    it("classifica como ok quando nada é legado e não há storage_key", () => {
      expect(
        classifyAdImageState({
          hasStorageKeyInVehicleImages: false,
          hasLegacyInAdsJson: false,
          hasLegacyInVehicleImageUrl: false,
        })
      ).toBe("ok");
    });
  });

  describe("suggestOrphanAction", () => {
    it("sugere ação para cada tipo de razão", () => {
      expect(suggestOrphanAction("file_not_found")).toBe("reupload_manual_or_remove_reference");
      expect(suggestOrphanAction("unsupported_extension")).toBe("convert_and_reupload_or_remove");
      expect(suggestOrphanAction("source_unreachable")).toBe("retry_later_or_reupload_manual");
      expect(suggestOrphanAction("inconsistent_metadata")).toBe("inspect_and_fix_metadata");
      expect(suggestOrphanAction("vehicle_images_row_file_not_found")).toBe("reupload_manual_or_cleanup_row");
    });

    it("retorna manual_inspection para razão desconhecida", () => {
      expect(suggestOrphanAction("unknown_reason")).toBe("manual_inspection");
    });
  });
});
