import { describe, it, expect } from "vitest";
import { buildVehicleJsonLd } from "./vehicle-structured-data";
import type { VehicleDetail } from "@/lib/vehicle/public-vehicle";

function vehicle(overrides: Partial<VehicleDetail> = {}): VehicleDetail {
  return {
    id: "10",
    slug: "onix-2024-atibaia",
    brand: "Chevrolet",
    model: "Onix Hatch",
    version: "1.0 Flex",
    fullName: "Chevrolet Onix Hatch 1.0 Flex",
    price: "R$ 88.900",
    priceNumeric: 88900,
    condition: "Usado",
    year: "2024/2024",
    km: "25.000 km",
    fuel: "Flex",
    transmission: "Manual",
    bodyType: "Hatch",
    color: "Prata",
    city: "Atibaia (SP)",
    citySlug: "atibaia-sp",
    adCode: "10",
    adPublishedAt: "2026-06-01T10:00:00.000Z",
    adUpdatedAt: "2026-06-10T10:00:00.000Z",
    isBelowFipe: true,
    fipePrice: "R$ 92.000",
    fipeDeltaBrl: -3100,
    fipeDeltaPercent: -3.4,
    isPaidListing: false,
    advertiserId: "5",
    reviewedAfterBelowFipe: false,
    images: ["https://cdn.test/a.webp", "https://cdn.test/b.webp"],
    hasRealImages: true,
    description: "Carro revisado, único dono.",
    optionalItems: [],
    safetyItems: [],
    comfortItems: [],
    sellerNotes: "",
    seller: { type: "private", name: "João" },
    ...overrides,
  };
}

const URL = "https://www.carrosnacidade.com/veiculo/onix-2024-atibaia";

describe("buildVehicleJsonLd", () => {
  it("emite Product+Car com Offer UsedCondition e campos de veículo", () => {
    const ld = buildVehicleJsonLd(vehicle(), { url: URL });
    expect(ld).toBeTruthy();
    expect(ld!["@type"]).toEqual(["Product", "Car"]);
    expect(ld!.name).toBe("Chevrolet Onix Hatch 1.0 Flex");
    expect((ld!.brand as Record<string, unknown>).name).toBe("Chevrolet");
    expect(ld!.vehicleModelDate).toBe("2024");
    expect(ld!.fuelType).toBe("Flex");
    expect(ld!.vehicleTransmission).toBe("Manual");
    expect(ld!.color).toBe("Prata");
    expect((ld!.mileageFromOdometer as Record<string, unknown>).value).toBe(25000);

    const offer = ld!.offers as Record<string, unknown>;
    expect(offer["@type"]).toBe("Offer");
    expect(offer.priceCurrency).toBe("BRL");
    expect(offer.price).toBe("88900");
    expect(offer.itemCondition).toBe("https://schema.org/UsedCondition");
    expect(offer.availability).toBe("https://schema.org/InStock");
    expect(offer.url).toBe(URL);
  });

  it("imagem principal vira ImageObject com caption (alt)", () => {
    const ld = buildVehicleJsonLd(vehicle(), { url: URL });
    const image = ld!.image as unknown[];
    const first = image[0] as Record<string, unknown>;
    expect(first["@type"]).toBe("ImageObject");
    expect(first.url).toBe("https://cdn.test/a.webp");
    expect(first.caption).toBe("Chevrolet Onix Hatch 2024 usado em Atibaia - SP");
    expect(image[1]).toBe("https://cdn.test/b.webp");
  });

  it("seller loja vira AutoDealer com url da loja", () => {
    const ld = buildVehicleJsonLd(
      vehicle({
        seller: {
          type: "dealer",
          name: "Loja Exemplo",
          logo: "",
          address: "Rua X, 100",
          rating: 4.5,
          phone: "1133334444",
          storeSlug: "loja-exemplo",
        },
      }),
      { url: URL }
    );
    const seller = (ld!.offers as Record<string, unknown>).seller as Record<string, unknown>;
    expect(seller["@type"]).toBe("AutoDealer");
    expect(seller.name).toBe("Loja Exemplo");
    expect(seller.telephone).toBe("1133334444");
    expect(seller.url).toContain("/lojas/loja-exemplo");
  });

  it("seller particular vira Person", () => {
    const ld = buildVehicleJsonLd(vehicle(), { url: URL });
    const seller = (ld!.offers as Record<string, unknown>).seller as Record<string, unknown>;
    expect(seller["@type"]).toBe("Person");
    expect(seller.name).toBe("João");
  });

  it("sem preço: Offer sem campo price (não inventa)", () => {
    const ld = buildVehicleJsonLd(vehicle({ price: "", priceNumeric: null }), { url: URL });
    const offer = ld!.offers as Record<string, unknown>;
    expect(offer.price).toBeUndefined();
  });

  it("sem fullName → null (não emite JSON-LD inválido)", () => {
    const ld = buildVehicleJsonLd(vehicle({ fullName: "" }), { url: URL });
    expect(ld).toBe(null);
  });

  it("novo usa NewCondition e categoria 'Veículo novo'", () => {
    const ld = buildVehicleJsonLd(vehicle({ condition: "Novo" }), { url: URL });
    expect(ld!.category).toBe("Veículo novo");
    expect((ld!.offers as Record<string, unknown>).itemCondition).toBe(
      "https://schema.org/NewCondition"
    );
  });
});
