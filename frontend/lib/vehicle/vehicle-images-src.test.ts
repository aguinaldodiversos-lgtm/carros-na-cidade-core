import { describe, expect, it } from "vitest";
import { getSafeUploadPath, normalizeUploadSrcParam } from "./vehicle-images-src";

describe("vehicle-images-src", () => {
  describe("getSafeUploadPath", () => {
    it("aceita path normal", () => {
      expect(getSafeUploadPath("/uploads/ads/foo.png")).toBe("/uploads/ads/foo.png");
    });

    it("decodifica uma vez (%2Fuploads...)", () => {
      expect(getSafeUploadPath("%2Fuploads%2Fads%2Ffoo.png")).toBe("/uploads/ads/foo.png");
    });

    it("decodifica duas vezes (double-encoded)", () => {
      const double = encodeURIComponent(encodeURIComponent("/uploads/ads/foo.png"));
      expect(getSafeUploadPath(double)).toBe("/uploads/ads/foo.png");
    });

    it("normaliza uploads/ sem barra inicial", () => {
      expect(getSafeUploadPath("uploads/ads/foo.png")).toBe("/uploads/ads/foo.png");
    });

    it("extrai pathname de URL absoluta do mesmo site", () => {
      expect(getSafeUploadPath("https://carrosnacidade.com/uploads/ads/foo.png")).toBe(
        "/uploads/ads/foo.png"
      );
    });

    it("rejeita path traversal", () => {
      expect(getSafeUploadPath("/uploads/../etc/passwd")).toBeNull();
    });

    it("rejeita null byte injection", () => {
      expect(getSafeUploadPath("/uploads/ads/foo\0.png")).toBeNull();
    });

    it("rejeita path fora de /uploads/", () => {
      expect(getSafeUploadPath("/etc/passwd")).toBeNull();
      expect(getSafeUploadPath("/api/vehicle-images?key=x")).toBeNull();
    });

    it("rejeita string vazia", () => {
      expect(getSafeUploadPath("")).toBeNull();
    });

    it("aceita subdiretórios dentro de /uploads/ads/", () => {
      expect(getSafeUploadPath("/uploads/ads/2024/01/foto.jpg")).toBe(
        "/uploads/ads/2024/01/foto.jpg"
      );
    });
  });

  describe("normalizeUploadSrcParam", () => {
    it("não quebra path já decodificado", () => {
      expect(normalizeUploadSrcParam("/uploads/ads/a b.png")).toBe("/uploads/ads/a b.png");
    });

    it("decodifica %2F", () => {
      expect(normalizeUploadSrcParam("%2Fuploads%2Fads%2Ffoo.png")).toBe("/uploads/ads/foo.png");
    });

    it("adiciona / antes de uploads/ sem barra", () => {
      expect(normalizeUploadSrcParam("uploads/ads/foo.png")).toBe("/uploads/ads/foo.png");
    });

    it("normaliza // duplo no início", () => {
      expect(normalizeUploadSrcParam("//uploads/ads/foo.png")).toBe("/uploads/ads/foo.png");
    });

    it("extrai pathname de URL absoluta", () => {
      expect(normalizeUploadSrcParam("https://example.com/uploads/ads/x.png")).toBe(
        "/uploads/ads/x.png"
      );
    });

    it("retorna vazio para string vazia", () => {
      expect(normalizeUploadSrcParam("")).toBe("");
    });

    it("normaliza backslashes e adiciona / antes de uploads/", () => {
      expect(normalizeUploadSrcParam("uploads\\ads\\foto.jpg")).toBe("/uploads/ads/foto.jpg");
    });
  });
});
