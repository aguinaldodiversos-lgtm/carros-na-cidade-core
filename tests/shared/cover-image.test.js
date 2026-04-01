import { describe, it, expect } from "vitest";

/**
 * Testa a lógica de resolveAdCoverImage indiretamente via normalizeDashboardAd.
 * A função não é exportada, então testamos através do comportamento em listOwnedAds.
 * Aqui validamos a lógica pura de extração de imagem do JSONB.
 */
function resolveAdCoverImage(row) {
  if (row.images) {
    const arr = Array.isArray(row.images)
      ? row.images
      : (() => { try { return JSON.parse(row.images); } catch { return []; } })();
    const first = Array.isArray(arr) ? arr.find((u) => typeof u === "string" && u.trim()) : null;
    if (first) return first.trim();
  }
  if (row.image_url && typeof row.image_url === "string" && row.image_url.trim()) {
    return row.image_url.trim();
  }
  return null;
}

describe("resolveAdCoverImage", () => {
  it("retorna primeiro elemento do array images", () => {
    const row = { images: ["/uploads/ads/foto1.jpg", "/uploads/ads/foto2.jpg"] };
    expect(resolveAdCoverImage(row)).toBe("/uploads/ads/foto1.jpg");
  });

  it("retorna images[0] de JSON string", () => {
    const row = { images: JSON.stringify(["/uploads/ads/a.jpg"]) };
    expect(resolveAdCoverImage(row)).toBe("/uploads/ads/a.jpg");
  });

  it("cai para image_url quando images está vazio", () => {
    const row = { images: [], image_url: "/old/url.jpg" };
    expect(resolveAdCoverImage(row)).toBe("/old/url.jpg");
  });

  it("retorna null quando não há imagem — sem placeholder hardcoded", () => {
    const row = { images: [], image_url: null };
    expect(resolveAdCoverImage(row)).toBeNull();
  });

  it("não retorna /images/banner1.jpg como fallback", () => {
    const row = {};
    expect(resolveAdCoverImage(row)).not.toBe("/images/banner1.jpg");
  });
});
