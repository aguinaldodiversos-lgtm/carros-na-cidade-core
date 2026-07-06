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
    vehicleOptionGroups: [],
    trustBadges: [],
    sellerNotes: "",
    seller: { type: "private", name: "João" },
    ...overrides,
  };
}

const URL = "https://www.carrosnacidade.com/veiculo/onix-2024-atibaia";

describe("buildVehicleJsonLd", () => {
  const findType = (nodes: Record<string, unknown>[], type: string) =>
    nodes.find((n) => n["@type"] === type);

  it("emite Product (tipo único) com Offer UsedCondition dentro", () => {
    const nodes = buildVehicleJsonLd(vehicle(), { url: URL });
    const product = findType(nodes, "Product");
    expect(product).toBeTruthy();
    expect(product!["@type"]).toBe("Product"); // string, não array
    expect(product!.name).toBe("Chevrolet Onix Hatch 1.0 Flex");
    expect((product!.brand as Record<string, unknown>).name).toBe("Chevrolet");
    expect(product!.category).toBe("Veículo usado");
    expect(product!.itemCondition).toBe("https://schema.org/UsedCondition");
    expect(product!.sku).toBe("10");

    const offer = product!.offers as Record<string, unknown>;
    expect(offer["@type"]).toBe("Offer");
    expect(offer.priceCurrency).toBe("BRL");
    expect(offer.price).toBe("88900");
    expect(offer.itemCondition).toBe("https://schema.org/UsedCondition");
    expect(offer.availability).toBe("https://schema.org/InStock");
    expect(offer.url).toBe(URL);
  });

  it("emite Car (tipo único) com specs do veículo", () => {
    const nodes = buildVehicleJsonLd(vehicle(), { url: URL });
    const car = findType(nodes, "Car");
    expect(car).toBeTruthy();
    expect(car!["@type"]).toBe("Car");
    expect(car!.vehicleModelDate).toBe("2024");
    expect(car!.fuelType).toBe("Flex");
    expect(car!.vehicleTransmission).toBe("Manual");
    expect(car!.color).toBe("Prata");
    expect((car!.mileageFromOdometer as Record<string, unknown>).value).toBe(25000);
  });

  it("o veículo NUNCA sai apenas como Thing", () => {
    const nodes = buildVehicleJsonLd(vehicle(), { url: URL });
    const types = nodes.map((n) => n["@type"]);
    expect(types).toContain("Product");
    expect(types).toContain("Car");
    expect(types).not.toContain("Thing");
  });

  it("imagem principal do Product vira ImageObject com caption (alt)", () => {
    const nodes = buildVehicleJsonLd(vehicle(), { url: URL });
    const product = findType(nodes, "Product")!;
    const image = product.image as unknown[];
    const first = image[0] as Record<string, unknown>;
    expect(first["@type"]).toBe("ImageObject");
    expect(first.url).toBe("https://cdn.test/a.webp");
    expect(first.caption).toBe("Chevrolet Onix Hatch 2024 usado em Atibaia - SP");
    expect(image[1]).toBe("https://cdn.test/b.webp");
  });

  it("seller loja vira AutoDealer com url da loja", () => {
    const nodes = buildVehicleJsonLd(
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
    const offer = findType(nodes, "Product")!.offers as Record<string, unknown>;
    const seller = offer.seller as Record<string, unknown>;
    expect(seller["@type"]).toBe("AutoDealer");
    expect(seller.name).toBe("Loja Exemplo");
    expect(seller.telephone).toBe("1133334444");
    expect(seller.url).toContain("/lojas/loja-exemplo");
  });

  it("seller particular vira Person", () => {
    const nodes = buildVehicleJsonLd(vehicle(), { url: URL });
    const offer = findType(nodes, "Product")!.offers as Record<string, unknown>;
    const seller = offer.seller as Record<string, unknown>;
    expect(seller["@type"]).toBe("Person");
    expect(seller.name).toBe("João");
  });

  it("sem preço: Offer sem campo price (não inventa)", () => {
    const nodes = buildVehicleJsonLd(vehicle({ price: "", priceNumeric: null }), { url: URL });
    const offer = findType(nodes, "Product")!.offers as Record<string, unknown>;
    expect(offer.price).toBeUndefined();
  });

  it("sem fullName → [] (não emite JSON-LD inválido)", () => {
    expect(buildVehicleJsonLd(vehicle({ fullName: "" }), { url: URL })).toEqual([]);
  });

  it("novo usa NewCondition e categoria 'Veículo novo'", () => {
    const nodes = buildVehicleJsonLd(vehicle({ condition: "Novo" }), { url: URL });
    const product = findType(nodes, "Product")!;
    expect(product.category).toBe("Veículo novo");
    expect((product.offers as Record<string, unknown>).itemCondition).toBe(
      "https://schema.org/NewCondition"
    );
  });
});
