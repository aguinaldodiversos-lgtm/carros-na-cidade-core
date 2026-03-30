import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/modules/cities/cities.repository.js", () => ({
  findCitiesByStateVariants: vi.fn(),
}));

import * as citiesRepository from "../../src/modules/cities/cities.repository.js";
import { searchCitiesByUfAndPartialName } from "../../src/modules/cities/cities.service.js";

/** Mesma forma de linhas que loadCityDictionary retorna do banco */
const MOCK_CITIES = [
  {
    id: 101,
    name: "Campinas",
    slug: "campinas-sp",
    state: "SP",
    ranking_priority: 0,
    territorial_score: 0,
  },
  {
    id: 102,
    name: "Atibaia",
    slug: "atibaia-sp",
    state: "SP",
    ranking_priority: 0,
    territorial_score: 0,
  },
  {
    id: 103,
    name: "São Paulo",
    slug: "sao-paulo-sp",
    state: "SP",
    ranking_priority: 0,
    territorial_score: 0,
  },
  {
    id: 201,
    name: "Curitiba",
    slug: "curitiba-pr",
    state: "PR",
    ranking_priority: 0,
    territorial_score: 0,
  },
];

describe("searchCitiesByUfAndPartialName (tabela cities por UF)", () => {
  beforeEach(() => {
    vi.mocked(citiesRepository.findCitiesByStateVariants).mockResolvedValue(MOCK_CITIES);
  });

  it("UF=SP + trecho camp → encontra Campinas", async () => {
    const r = await searchCitiesByUfAndPartialName("SP", "camp", 20);
    expect(r.length).toBe(1);
    expect(r[0].name).toBe("Campinas");
  });

  it("UF=SP + trecho atib → encontra Atibaia", async () => {
    const r = await searchCitiesByUfAndPartialName("SP", "atib", 20);
    expect(r.length).toBe(1);
    expect(r[0].name).toBe("Atibaia");
  });

  it("UF=SP + trecho sao → encontra São Paulo (acento tolerante)", async () => {
    const r = await searchCitiesByUfAndPartialName("SP", "sao", 20);
    expect(r.some((c) => c.name === "São Paulo")).toBe(true);
  });

  it("UF=PR + cur → Curitiba, não mistura SP", async () => {
    const r = await searchCitiesByUfAndPartialName("PR", "cur", 20);
    expect(r.length).toBe(1);
    expect(r[0].name).toBe("Curitiba");
  });

  it("trecho com 1 caractere retorna vazio (mínimo 2, alinhado ao painel)", async () => {
    const one = await searchCitiesByUfAndPartialName("SP", "a", 50);
    expect(one).toHaveLength(0);
  });

  it("mock tem 3 cidades em SP filtráveis com trechos distintos", async () => {
    const camp = await searchCitiesByUfAndPartialName("SP", "camp", 50);
    const atib = await searchCitiesByUfAndPartialName("SP", "atib", 50);
    const sao = await searchCitiesByUfAndPartialName("SP", "sao", 50);
    expect(camp.length + atib.length + sao.length).toBe(3);
  });
});
