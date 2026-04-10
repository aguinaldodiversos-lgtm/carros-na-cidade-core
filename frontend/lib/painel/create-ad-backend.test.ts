import { describe, it, expect } from "vitest";
import {
  parsePriceBr,
  parseMileageInt,
  parseYear,
  buildBackendCreateAdPayload,
  extractBackendErrorMessage,
  type PublishWizardInput,
  type ResolvedCityRow,
} from "./create-ad-backend";

describe("parsePriceBr", () => {
  it("parses Brazilian price format", () => {
    expect(parsePriceBr("R$ 45.000,00")).toBe(45000);
    expect(parsePriceBr("R$ 120.500,50")).toBe(120500.5);
  });

  it("parses plain numbers", () => {
    expect(parsePriceBr("30000")).toBe(30000);
  });

  it("returns 0 for empty/invalid", () => {
    expect(parsePriceBr("")).toBe(0);
    expect(parsePriceBr("abc")).toBe(0);
  });
});

describe("parseMileageInt", () => {
  it("extracts integer from formatted mileage", () => {
    expect(parseMileageInt("120.000")).toBe(120000);
    expect(parseMileageInt("50000")).toBe(50000);
  });

  it("returns 0 for empty", () => {
    expect(parseMileageInt("")).toBe(0);
  });
});

describe("parseYear", () => {
  it("parses valid year", () => {
    expect(parseYear("2023")).toBe(2023);
    expect(parseYear("2015")).toBe(2015);
  });

  it("returns current year for invalid", () => {
    const currentYear = new Date().getFullYear();
    expect(parseYear("")).toBe(currentYear);
    expect(parseYear("abc")).toBe(currentYear);
    expect(parseYear("1800")).toBe(currentYear);
  });
});

describe("buildBackendCreateAdPayload", () => {
  const baseInput: PublishWizardInput = {
    cityId: "123",
    brand: "Fiat",
    model: "Uno",
    version: "1.0 Fire",
    yearModel: "2019",
    mileage: "45.000",
    price: "R$ 35.000,00",
    fipeValue: "R$ 40.000,00",
    city: "São Paulo",
    state: "SP",
    fuel: "Flex",
    transmission: "Manual",
    bodyStyle: "Hatch",
    title: "Fiat Uno 1.0 Fire 2019",
    description: "Carro em ótimo estado",
    acceptTerms: true,
  };

  const resolvedCity: ResolvedCityRow = {
    id: 123,
    name: "São Paulo",
    state: "SP",
    slug: "sao-paulo-sp",
  };

  it("builds correct payload for CPF user", () => {
    const result = buildBackendCreateAdPayload(baseInput, resolvedCity, "CPF", [
      "https://r2.example.com/img1.jpg",
    ]);

    expect(result.title).toBe("Fiat Uno 1.0 Fire 2019");
    expect(result.price).toBe(35000);
    expect(result.city_id).toBe(123);
    expect(result.city).toBe("São Paulo");
    expect(result.state).toBe("SP");
    expect(result.brand).toBe("Fiat");
    expect(result.model).toBe("Uno");
    expect(result.year).toBe(2019);
    expect(result.mileage).toBe(45000);
    expect(result.category).toBe("particular");
    expect(result.below_fipe).toBe(true);
    expect(result.images).toEqual(["https://r2.example.com/img1.jpg"]);
  });

  it("builds correct payload for CNPJ user", () => {
    const result = buildBackendCreateAdPayload(baseInput, resolvedCity, "CNPJ", []);
    expect(result.category).toBe("lojista");
  });

  it("below_fipe is false when price >= fipe", () => {
    const input = { ...baseInput, price: "R$ 50.000,00", fipeValue: "R$ 40.000,00" };
    const result = buildBackendCreateAdPayload(input, resolvedCity, "CPF", []);
    expect(result.below_fipe).toBe(false);
  });

  it("generates title when not provided", () => {
    const input = { ...baseInput, title: "" };
    const result = buildBackendCreateAdPayload(input, resolvedCity, "CPF", []);
    expect(result.title).toContain("Fiat");
    expect(result.title).toContain("Uno");
  });

  it("limits images to 24", () => {
    const urls = Array.from({ length: 30 }, (_, i) => `https://r2.example.com/img${i}.jpg`);
    const result = buildBackendCreateAdPayload(baseInput, resolvedCity, "CPF", urls);
    expect(result.images?.length).toBe(24);
  });
});

describe("extractBackendErrorMessage", () => {
  it("extracts message from standard error", () => {
    expect(extractBackendErrorMessage({ message: "Limite atingido" }, 400)).toBe("Limite atingido");
  });

  it("extracts error field", () => {
    expect(extractBackendErrorMessage({ error: "Unauthorized" }, 401)).toBe("Unauthorized");
  });

  it("appends details code", () => {
    const parsed = {
      message: "Erro",
      details: { code: "LIMIT_EXCEEDED", constraint: "max_ads" },
    };
    expect(extractBackendErrorMessage(parsed, 400)).toBe("Erro [LIMIT_EXCEEDED · max_ads]");
  });

  it("returns fallback for null/empty", () => {
    expect(extractBackendErrorMessage(null, 500)).toBe("Falha no backend (HTTP 500).");
    expect(extractBackendErrorMessage({}, 502)).toBe("Falha no backend (HTTP 502).");
  });
});
