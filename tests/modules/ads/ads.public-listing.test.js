import { describe, expect, it } from "vitest";

import {
  PUBLIC_LISTING_CONTRACT,
  serializeAdForListing,
  serializeAdsForListing,
} from "../../../src/modules/ads/ads.public-listing.js";

function fullAd(overrides = {}) {
  return {
    id: 42,
    slug: "honda-civic-2020-atibaia",
    title: "Honda Civic EXL 2020",
    brand: "Honda",
    model: "Civic",
    version: "EXL",
    year: 2020,
    year_model: 2021,
    model_year: 2021,
    mileage: 45000,
    fuel: "Flex",
    fuel_type: "Flex",
    transmission: "Automatico",
    body_type: "Sedan",
    price: 95000,
    below_fipe: true,
    reviewed_after_below_fipe: true,
    city: "Atibaia",
    city_id: 123,
    city_slug: "atibaia-sp",
    state: "SP",
    image_url: "https://r2.dev/vehicles/42/0.jpg",
    storage_key: "vehicles/42/0.jpg",
    images: [
      "https://r2.dev/vehicles/42/0.jpg",
      "https://r2.dev/vehicles/42/1.jpg",
      "https://r2.dev/vehicles/42/2.jpg",
      "https://r2.dev/vehicles/42/3.jpg",
      "https://r2.dev/vehicles/42/4.jpg",
      "https://r2.dev/vehicles/42/5.jpg",
    ],
    plan: "destaque",
    priority: 10,
    highlight_until: "2026-06-15T00:00:00Z",
    advertiser_id: 7,
    dealership_id: 7,
    dealership_name: "AutoLoja XYZ",
    seller_name: "AutoLoja XYZ",
    seller_kind: "dealer",
    seller_type: "dealer",
    account_type: "CNPJ",
    status: "active",
    created_at: "2026-04-01T00:00:00Z",
    // Campos que devem ser CORTADOS:
    description: "Lorem ipsum dolor sit amet ".repeat(100),
    whatsapp_number: "+5511999998888",
    search_vector: "'honda':1 'civic':2 'exl':3",
    text_rank: 0.85,
    hybrid_score: 142.7,
    views: 1234,
    clicks: 56,
    leads: 3,
    ctr: 0.045,
    reviewed_at: "2026-04-02T10:00:00Z",
    updated_at: "2026-04-02T10:00:00Z",
    gearbox: "Automatico",
    cambio: "Automatico",
    risk_reasons: ["price_low"],
    risk_score: 0.7,
    risk_level: "medium",
    reviewed_by: "moderator-1",
    rejection_reason: null,
    correction_requested_reason: null,
    structural_change_count: 2,
    ...overrides,
  };
}

describe("serializeAdForListing", () => {
  it("mantem todos os campos do contrato whitelist", () => {
    const ad = fullAd();
    const slim = serializeAdForListing(ad);

    for (const field of PUBLIC_LISTING_CONTRACT.ALLOWED_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(ad, field)) {
        expect(slim).toHaveProperty(field);
      }
    }
  });

  it("remove description, whatsapp_number e campos PII/internos", () => {
    const ad = fullAd();
    const slim = serializeAdForListing(ad);

    expect(slim).not.toHaveProperty("description");
    expect(slim).not.toHaveProperty("whatsapp_number");
    expect(slim).not.toHaveProperty("search_vector");
    expect(slim).not.toHaveProperty("text_rank");
    expect(slim).not.toHaveProperty("hybrid_score");
    expect(slim).not.toHaveProperty("views");
    expect(slim).not.toHaveProperty("clicks");
    expect(slim).not.toHaveProperty("leads");
    expect(slim).not.toHaveProperty("ctr");
    expect(slim).not.toHaveProperty("reviewed_at");
    expect(slim).not.toHaveProperty("gearbox");
    expect(slim).not.toHaveProperty("cambio");
  });

  it("remove residuais de moderacao/risk", () => {
    const ad = fullAd();
    const slim = serializeAdForListing(ad);

    expect(slim).not.toHaveProperty("risk_reasons");
    expect(slim).not.toHaveProperty("risk_score");
    expect(slim).not.toHaveProperty("risk_level");
    expect(slim).not.toHaveProperty("reviewed_by");
    expect(slim).not.toHaveProperty("rejection_reason");
    expect(slim).not.toHaveProperty("correction_requested_reason");
    expect(slim).not.toHaveProperty("structural_change_count");
  });

  it("trunca images para no maximo 3 URLs", () => {
    const ad = fullAd();
    expect(ad.images).toHaveLength(6);
    const slim = serializeAdForListing(ad);
    expect(slim.images).toHaveLength(PUBLIC_LISTING_CONTRACT.IMAGES_LISTING_LIMIT);
    expect(slim.images).toEqual(ad.images.slice(0, 3));
  });

  it("nao toca em images se array curto", () => {
    const ad = fullAd({
      images: ["https://r2.dev/vehicles/42/0.jpg"],
    });
    const slim = serializeAdForListing(ad);
    expect(slim.images).toHaveLength(1);
  });

  it("preserva campos do card que o frontend usa em CatalogVehicleCard", () => {
    const ad = fullAd();
    const slim = serializeAdForListing(ad);

    // Campos verificados em frontend/components/buy/CatalogVehicleCard.tsx
    expect(slim).toMatchObject({
      id: 42,
      slug: "honda-civic-2020-atibaia",
      title: "Honda Civic EXL 2020",
      brand: "Honda",
      model: "Civic",
      version: "EXL",
      year: 2020,
      mileage: 45000,
      city: "Atibaia",
      state: "SP",
      price: 95000,
      image_url: "https://r2.dev/vehicles/42/0.jpg",
      below_fipe: true,
      highlight_until: "2026-06-15T00:00:00Z",
      plan: "destaque",
      dealership_name: "AutoLoja XYZ",
      seller_type: "dealer",
      seller_kind: "dealer",
      reviewed_after_below_fipe: true,
    });
  });

  it("retorna o input quando nao e objeto", () => {
    expect(serializeAdForListing(null)).toBeNull();
    expect(serializeAdForListing(undefined)).toBeUndefined();
    expect(serializeAdForListing("string")).toBe("string");
  });

  it("payload slim e menor que o input completo (regressao bandwidth)", () => {
    const ad = fullAd();
    const slim = serializeAdForListing(ad);

    const inputSize = JSON.stringify(ad).length;
    const slimSize = JSON.stringify(slim).length;

    expect(slimSize).toBeLessThan(inputSize);

    // Conservador: o slim deve cortar ao menos 30% do payload do ad completo
    // por causa do description gigante.
    const reduction = (inputSize - slimSize) / inputSize;
    expect(reduction).toBeGreaterThan(0.3);
  });
});

describe("serializeAdsForListing", () => {
  it("aplica em array", () => {
    const ads = [fullAd(), fullAd({ id: 43, slug: "civic-2021" })];
    const slim = serializeAdsForListing(ads);
    expect(slim).toHaveLength(2);
    expect(slim[0]).not.toHaveProperty("description");
    expect(slim[1]).not.toHaveProperty("description");
  });

  it("retorna array vazio para input invalido", () => {
    expect(serializeAdsForListing(null)).toEqual([]);
    expect(serializeAdsForListing(undefined)).toEqual([]);
    expect(serializeAdsForListing("abc")).toEqual([]);
  });
});
