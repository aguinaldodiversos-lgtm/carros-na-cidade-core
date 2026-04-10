import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/modules/cities/cities.repository.js", () => ({
  findCitiesByStateVariants: vi.fn(),
  findCityBySlug: vi.fn(),
}));

vi.mock("../../src/modules/cities/ibge-municipios.service.js", () => ({
  isIbgeAutoSeedEnabled: () => false,
  upsertMunicipiosForUfFromIbge: vi.fn(),
}));

import * as citiesRepository from "../../src/modules/cities/cities.repository.js";
import {
  searchCitiesByUfAndPartialName,
  resolveCityByNameAndUf,
} from "../../src/modules/cities/cities.service.js";
import { normalizeSearchText } from "../../src/shared/utils/normalizeSearchText.js";
import { inferUfFromSlug } from "../../src/shared/utils/inferUfFromSlug.js";
import { slugify } from "../../src/shared/utils/slugify.js";

const SP_CITIES = [
  { id: 1, name: "Atibaia", slug: "atibaia-sp", state: "SP", ranking_priority: 0, territorial_score: 0 },
  { id: 2, name: "São Paulo", slug: "sao-paulo-sp", state: "SP", ranking_priority: 0, territorial_score: 0 },
  { id: 3, name: "Campinas", slug: "campinas-sp", state: "SP", ranking_priority: 0, territorial_score: 0 },
  { id: 4, name: "São José do Rio Preto", slug: "sao-jose-do-rio-preto-sp", state: "SP", ranking_priority: 0, territorial_score: 0 },
  { id: 5, name: "São José dos Campos", slug: "sao-jose-dos-campos-sp", state: "SP", ranking_priority: 0, territorial_score: 0 },
  { id: 6, name: "Santo André", slug: "santo-andre-sp", state: "SP", ranking_priority: 0, territorial_score: 0 },
  { id: 7, name: "Guarulhos", slug: "guarulhos-sp", state: "SP", ranking_priority: 0, territorial_score: 0 },
];

describe("normalizeSearchText – accent-insensitive + case-insensitive", () => {
  it("removes accents from São Paulo", () => {
    expect(normalizeSearchText("São Paulo")).toBe("sao paulo");
  });

  it("lowercases input", () => {
    expect(normalizeSearchText("ATIBAIA")).toBe("atibaia");
  });

  it("handles mixed case with accents", () => {
    expect(normalizeSearchText("São José do Rio Preto")).toBe("sao jose do rio preto");
  });

  it("trims whitespace", () => {
    expect(normalizeSearchText("  campinas  ")).toBe("campinas");
  });

  it("normalizes multiple spaces", () => {
    expect(normalizeSearchText("santo   andré")).toBe("santo andre");
  });

  it("handles empty / null / undefined", () => {
    expect(normalizeSearchText("")).toBe("");
    expect(normalizeSearchText(null)).toBe("");
    expect(normalizeSearchText(undefined)).toBe("");
  });
});

describe("inferUfFromSlug", () => {
  it("extracts UF from standard slug", () => {
    expect(inferUfFromSlug("atibaia-sp")).toBe("SP");
    expect(inferUfFromSlug("sao-paulo-sp")).toBe("SP");
    expect(inferUfFromSlug("curitiba-pr")).toBe("PR");
  });

  it("returns empty for invalid slug", () => {
    expect(inferUfFromSlug("")).toBe("");
    expect(inferUfFromSlug(null)).toBe("");
    expect(inferUfFromSlug("no-uf-here-123")).toBe("");
  });
});

describe("slugify", () => {
  it("generates correct slug for Brazilian city names", () => {
    expect(slugify("Atibaia")).toBe("atibaia");
    expect(slugify("São Paulo")).toBe("sao-paulo");
    expect(slugify("São José do Rio Preto")).toBe("sao-jose-do-rio-preto");
    expect(slugify("Santo André")).toBe("santo-andre");
  });
});

describe("searchCitiesByUfAndPartialName – comprehensive city search", () => {
  beforeEach(() => {
    vi.mocked(citiesRepository.findCitiesByStateVariants).mockResolvedValue(SP_CITIES);
  });

  it("SP + 'ati' → Atibaia", async () => {
    const r = await searchCitiesByUfAndPartialName("SP", "ati", 20);
    expect(r.length).toBe(1);
    expect(r[0].name).toBe("Atibaia");
  });

  it("SP + 'atibaia' → Atibaia (full name)", async () => {
    const r = await searchCitiesByUfAndPartialName("SP", "atibaia", 20);
    expect(r.length).toBe(1);
    expect(r[0].name).toBe("Atibaia");
    expect(r[0].id).toBe(1);
  });

  it("SP + 'sao' → São Paulo + São José do Rio Preto + São José dos Campos", async () => {
    const r = await searchCitiesByUfAndPartialName("SP", "sao", 20);
    expect(r.length).toBeGreaterThanOrEqual(3);
    const names = r.map((c) => c.name);
    expect(names).toContain("São Paulo");
    expect(names).toContain("São José do Rio Preto");
    expect(names).toContain("São José dos Campos");
  });

  it("SP + 'camp' → Campinas (prefix) + São José dos Campos (substring)", async () => {
    const r = await searchCitiesByUfAndPartialName("SP", "camp", 20);
    expect(r.length).toBe(2);
    expect(r[0].name).toBe("Campinas");
    expect(r.some((c) => c.name === "São José dos Campos")).toBe(true);
  });

  it("SP + 'rio preto' → São José do Rio Preto", async () => {
    const r = await searchCitiesByUfAndPartialName("SP", "rio preto", 20);
    expect(r.length).toBe(1);
    expect(r[0].name).toBe("São José do Rio Preto");
  });

  it("accent-insensitive: SP + 'sao jose' matches São José variants", async () => {
    const r = await searchCitiesByUfAndPartialName("SP", "sao jose", 20);
    expect(r.length).toBe(2);
    const names = r.map((c) => c.name);
    expect(names).toContain("São José do Rio Preto");
    expect(names).toContain("São José dos Campos");
  });

  it("case-insensitive: SP + 'CAMPINAS' → Campinas", async () => {
    const r = await searchCitiesByUfAndPartialName("SP", "CAMPINAS", 20);
    expect(r.length).toBe(1);
    expect(r[0].name).toBe("Campinas");
  });

  it("returns empty for nonexistent city", async () => {
    const r = await searchCitiesByUfAndPartialName("SP", "xyznotacity", 20);
    expect(r).toHaveLength(0);
  });

  it("returns empty when query is only 1 character", async () => {
    const r = await searchCitiesByUfAndPartialName("SP", "a", 20);
    expect(r).toHaveLength(0);
  });

  it("returns empty for invalid UF", async () => {
    const r = await searchCitiesByUfAndPartialName("", "camp", 20);
    expect(r).toHaveLength(0);
  });

  it("respects limit parameter", async () => {
    const r = await searchCitiesByUfAndPartialName("SP", "sao", 1);
    expect(r.length).toBe(1);
  });

  it("prefix matches rank higher than substring matches", async () => {
    const r = await searchCitiesByUfAndPartialName("SP", "santo", 20);
    expect(r[0].name).toBe("Santo André");
  });

  it("handles SQL wildcard characters in query safely", async () => {
    const r = await searchCitiesByUfAndPartialName("SP", "camp%", 20);
    expect(r.length).toBe(2);
    expect(r[0].name).toBe("Campinas");
  });
});

describe("resolveCityByNameAndUf", () => {
  beforeEach(() => {
    vi.mocked(citiesRepository.findCitiesByStateVariants).mockResolvedValue(SP_CITIES);
    vi.mocked(citiesRepository.findCityBySlug).mockImplementation(async (slug) => {
      return SP_CITIES.find((c) => c.slug === slug) ?? null;
    });
  });

  it("resolves Atibaia/SP by slug", async () => {
    const r = await resolveCityByNameAndUf("Atibaia", "SP");
    expect(r).not.toBeNull();
    expect(r.name).toBe("Atibaia");
    expect(r.slug).toBe("atibaia-sp");
  });

  it("resolves São Paulo/SP by slug", async () => {
    const r = await resolveCityByNameAndUf("São Paulo", "SP");
    expect(r).not.toBeNull();
    expect(r.name).toBe("São Paulo");
  });

  it("returns null for invalid UF", async () => {
    const r = await resolveCityByNameAndUf("Atibaia", "");
    expect(r).toBeNull();
  });

  it("returns null for empty name", async () => {
    const r = await resolveCityByNameAndUf("", "SP");
    expect(r).toBeNull();
  });
});
