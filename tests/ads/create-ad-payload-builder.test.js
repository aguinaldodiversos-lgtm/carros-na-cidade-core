import { describe, it, expect } from "vitest";
import {
  buildBackendCreateAdPayload,
  parsePriceBr,
  parseMileageInt,
  parseYear,
} from "../../frontend/lib/painel/create-ad-backend.ts";

describe("parsePriceBr", () => {
  it("parses BRL formatted price", () => {
    expect(parsePriceBr("R$ 45.000,00")).toBe(45000);
    expect(parsePriceBr("R$ 120.500,50")).toBe(120500.5);
  });

  it("parses plain number string", () => {
    expect(parsePriceBr("50000")).toBe(50000);
  });

  it("returns 0 for empty/invalid", () => {
    expect(parsePriceBr("")).toBe(0);
    expect(parsePriceBr("abc")).toBe(0);
  });
});

describe("parseMileageInt", () => {
  it("extracts digits from formatted mileage", () => {
    expect(parseMileageInt("32.500")).toBe(32500);
    expect(parseMileageInt("150000")).toBe(150000);
  });

  it("returns 0 for empty", () => {
    expect(parseMileageInt("")).toBe(0);
  });
});

describe("parseYear", () => {
  it("parses valid year string", () => {
    expect(parseYear("2021")).toBe(2021);
    expect(parseYear("2024")).toBe(2024);
  });

  it("returns current year for invalid input", () => {
    const current = new Date().getFullYear();
    expect(parseYear("")).toBe(current);
    expect(parseYear("abc")).toBe(current);
  });
});

describe("buildBackendCreateAdPayload", () => {
  const wizardInput = {
    cityId: "42",
    brand: "VW",
    model: "Gol",
    version: "1.0 MPI",
    yearModel: "2021",
    mileage: "32.500",
    price: "R$ 45.000,00",
    fipeValue: "R$ 50.000,00",
    city: "Atibaia",
    state: "SP",
    fuel: "Flex",
    transmission: "Automático",
    bodyStyle: "Hatch",
    title: "2021 VW Gol 1.0 MPI",
    description: "Carro em ótimo estado.",
    acceptTerms: true,
  };

  const resolvedCity = {
    id: 42,
    name: "Atibaia",
    state: "SP",
    slug: "atibaia-sp",
  };

  it("builds correct payload for CPF account with photo URLs", () => {
    const urls = [
      "https://r2.example.com/photo-1.jpg",
      "https://r2.example.com/photo-2.jpg",
    ];
    const payload = buildBackendCreateAdPayload(wizardInput, resolvedCity, "CPF", urls);

    expect(payload.title).toBe("2021 VW Gol 1.0 MPI");
    expect(payload.price).toBe(45000);
    expect(payload.city_id).toBe(42);
    expect(payload.city).toBe("Atibaia");
    expect(payload.state).toBe("SP");
    expect(payload.brand).toBe("VW");
    expect(payload.model).toBe("Gol");
    expect(payload.year).toBe(2021);
    expect(payload.mileage).toBe(32500);
    expect(payload.category).toBe("particular");
    expect(payload.below_fipe).toBe(true);
    expect(payload.images).toEqual(urls);
    expect(payload.description).toBe("Carro em ótimo estado.");
  });

  it("builds correct payload for CNPJ account", () => {
    const payload = buildBackendCreateAdPayload(wizardInput, resolvedCity, "CNPJ", []);

    expect(payload.category).toBe("lojista");
  });

  it("uses resolved city data (not form input) for city/state", () => {
    const differentCity = {
      id: 99,
      name: "São Paulo",
      state: "SP",
    };
    const payload = buildBackendCreateAdPayload(wizardInput, differentCity, "CPF", []);

    expect(payload.city_id).toBe(99);
    expect(payload.city).toBe("São Paulo");
  });

  it("sets below_fipe correctly", () => {
    const above = buildBackendCreateAdPayload(
      { ...wizardInput, price: "R$ 60.000,00" },
      resolvedCity,
      "CPF",
      []
    );
    expect(above.below_fipe).toBe(false);

    const below = buildBackendCreateAdPayload(
      { ...wizardInput, price: "R$ 40.000,00" },
      resolvedCity,
      "CPF",
      []
    );
    expect(below.below_fipe).toBe(true);
  });

  it("limits images to 24", () => {
    const manyUrls = Array.from({ length: 30 }, (_, i) => `https://r2.example.com/${i}.jpg`);
    const payload = buildBackendCreateAdPayload(wizardInput, resolvedCity, "CPF", manyUrls);

    expect(payload.images).toHaveLength(24);
  });

  it("filters empty URLs from images", () => {
    const urls = ["https://r2.example.com/photo-1.jpg", "", "  ", "https://r2.example.com/photo-2.jpg"];
    const payload = buildBackendCreateAdPayload(wizardInput, resolvedCity, "CPF", urls);

    expect(payload.images).toEqual([
      "https://r2.example.com/photo-1.jpg",
      "https://r2.example.com/photo-2.jpg",
    ]);
  });

  it("omits images key when no valid URLs", () => {
    const payload = buildBackendCreateAdPayload(wizardInput, resolvedCity, "CPF", []);
    expect(payload).not.toHaveProperty("images");
  });
});
