import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/infrastructure/storage/r2.service.js", () => ({
  buildR2PublicUrl: vi.fn(() => ""),
}));

import {
  buildCanonicalImageUrlFromStorageKey,
  buildNormalizedPublicImages,
  normalizePublicImageCandidate,
} from "../../src/modules/ads/ads.public-images.js";

describe("ads public images normalization", () => {
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
    expect(normalizePublicImageCandidate("/api/vehicle-images?key=vehicles%2Fabc%2Ffoto.webp")).toBe(
      "/api/vehicle-images?key=vehicles%2Fabc%2Ffoto.webp"
    );
  });

  it("converte storage_key em proxy quando não há base pública do R2", () => {
    expect(buildCanonicalImageUrlFromStorageKey("vehicles/abc/foto.webp")).toBe(
      "/api/vehicle-images?key=vehicles%2Fabc%2Ffoto.webp"
    );
  });

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

  it("preserva imagens válidas já persistidas no ads.images", () => {
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
});
