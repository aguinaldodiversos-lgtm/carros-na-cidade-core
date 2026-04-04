import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  collectVehicleImageCandidates,
  LISTING_CARD_FALLBACK_IMAGE,
  normalizeVehicleGalleryImages,
  normalizeVehicleImageUrl,
  resolvePublicListingImageUrl,
  isSupportedVehicleImageUrl,
} from "./detail-utils";

const envKeys = ["API_URL", "NEXT_PUBLIC_API_URL"] as const;

describe("vehicle detail image utils", () => {
  const snapshot: Partial<Record<(typeof envKeys)[number], string | undefined>> = {};

  beforeEach(() => {
    for (const key of envKeys) {
      snapshot[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of envKeys) {
      const value = snapshot[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("aceita imagens locais de upload em jpg, jpeg e png", () => {
    expect(isSupportedVehicleImageUrl("/uploads/ads/foto.jpg")).toBe(true);
    expect(isSupportedVehicleImageUrl("/uploads/ads/foto.jpeg")).toBe(true);
    expect(isSupportedVehicleImageUrl("/uploads/ads/foto.png")).toBe(true);
  });

  it("normaliza caminhos relativos de upload para o frontend quando não há host", () => {
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
    process.env.API_URL = "https://carros-na-cidade-api.onrender.com";

    expect(normalizeVehicleImageUrl("/api/vehicle-images?src=%2Fuploads%2Fads%2Ffoto.jpg")).toBe(
      "/api/vehicle-images?src=%2Fuploads%2Fads%2Ffoto.jpg"
    );
  });

  it("corrige proxy absoluto no host errado e remove dupla codificação do src", () => {
    process.env.API_URL = "https://carros-na-cidade-api.onrender.com";

    expect(
      normalizeVehicleImageUrl(
        "https://carros-na-cidade-api.onrender.com/api/vehicle-images?src=%252Fuploads%252Fads%252Ffoto.jpg"
      )
    ).toBe("/api/vehicle-images?src=%2Fuploads%2Fads%2Ffoto.jpg");
  });

  it("coleta imagens de arrays, json string e objetos de galeria", () => {
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

  it("resolvePublicListingImageUrl usa proxy para uploads e fallback SVG sem fotos", () => {
    expect(
      resolvePublicListingImageUrl({
        images: ["/uploads/ads/card.jpg"],
      })
    ).toBe("/api/vehicle-images?src=%2Fuploads%2Fads%2Fcard.jpg");

    expect(resolvePublicListingImageUrl({ image_url: null, images: [] })).toBe(LISTING_CARD_FALLBACK_IMAGE);
  });
});
