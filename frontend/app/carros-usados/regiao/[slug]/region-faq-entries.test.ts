import { describe, expect, it } from "vitest";

import type { RegionMember } from "@/lib/regions/fetch-region";

import { buildRegionFaqEntries } from "./region-faq-entries";

function buildMember(slug: string, name: string, distance = 25): RegionMember {
  return {
    city_id: Math.abs(slug.length * 7),
    slug,
    name,
    state: "SP",
    layer: 1,
    distance_km: distance,
  };
}

describe("buildRegionFaqEntries — contrato das 4 perguntas-chave", () => {
  it("retorna exatamente 4 entradas, nesta ordem", () => {
    const entries = buildRegionFaqEntries({
      cityName: "Atibaia",
      citySlug: "atibaia-sp",
      stateUF: "SP",
      members: [buildMember("itatiba-sp", "Itatiba")],
      radiusKm: 80,
    });

    expect(entries).toHaveLength(4);
    expect(entries.map((e) => e.id)).toEqual([
      "vale-a-pena",
      "cidades-incluidas",
      "so-cidade",
      "anunciar",
    ]);
  });

  it("cada entrada tem question + answer não vazios", () => {
    const entries = buildRegionFaqEntries({
      cityName: "Atibaia",
      citySlug: "atibaia-sp",
      stateUF: "SP",
      members: [buildMember("itatiba-sp", "Itatiba")],
      radiusKm: 80,
    });

    for (const entry of entries) {
      expect(entry.question.length).toBeGreaterThan(10);
      expect(entry.answer.length).toBeGreaterThan(20);
    }
  });

  it("personaliza com o nome da cidade na pergunta de 'vale a pena'", () => {
    const entries = buildRegionFaqEntries({
      cityName: "Bragança Paulista",
      citySlug: "braganca-paulista-sp",
      stateUF: "SP",
      members: [],
      radiusKm: 80,
    });

    const valeAPena = entries.find((e) => e.id === "vale-a-pena")!;
    expect(valeAPena.question).toContain("Bragança Paulista");
    expect(valeAPena.answer).toContain("Bragança Paulista");
  });

  it("cidades incluídas: lista os 4 primeiros members + 'e mais N'", () => {
    const members = [
      buildMember("braganca-paulista-sp", "Bragança Paulista"),
      buildMember("itatiba-sp", "Itatiba"),
      buildMember("jarinu-sp", "Jarinu"),
      buildMember("bom-jesus-dos-perdoes-sp", "Bom Jesus dos Perdões"),
      buildMember("piracaia-sp", "Piracaia"),
      buildMember("nazare-paulista-sp", "Nazaré Paulista"),
    ];

    const entries = buildRegionFaqEntries({
      cityName: "Atibaia",
      citySlug: "atibaia-sp",
      stateUF: "SP",
      members,
      radiusKm: 80,
    });

    const cidades = entries.find((e) => e.id === "cidades-incluidas")!;
    expect(cidades.answer).toContain("Bragança Paulista");
    expect(cidades.answer).toContain("Itatiba");
    expect(cidades.answer).toContain("Jarinu");
    expect(cidades.answer).toContain("Bom Jesus dos Perdões");
    expect(cidades.answer).toContain("mais 2 cidade");
    // Não vaza a 5a cidade (Piracaia) por nome no preview.
    expect(cidades.answer).not.toContain("Piracaia");
    // Cita o raio.
    expect(cidades.answer).toContain("80 km");
  });

  it("cidades incluídas: cidade isolada (members vazio) tem texto específico", () => {
    const entries = buildRegionFaqEntries({
      cityName: "Atibaia",
      citySlug: "atibaia-sp",
      stateUF: "SP",
      members: [],
      radiusKm: 80,
    });

    const cidades = entries.find((e) => e.id === "cidades-incluidas")!;
    expect(cidades.answer).toMatch(/limitada à própria cidade-base|próprio município|cidade-base/i);
    expect(cidades.answer).toContain("80 km");
  });

  it("FAQ 'só cidade' aponta para o catálogo de cidade (/comprar/cidade/[slug])", () => {
    const entries = buildRegionFaqEntries({
      cityName: "Atibaia",
      citySlug: "atibaia-sp",
      stateUF: "SP",
      members: [],
      radiusKm: 80,
    });

    const soCidade = entries.find((e) => e.id === "so-cidade")!;
    expect(soCidade.answer).toContain("/comprar/cidade/atibaia-sp");
  });

  it("FAQ 'anunciar' menciona inclusão automática na região + catálogo estadual", () => {
    const entries = buildRegionFaqEntries({
      cityName: "Atibaia",
      citySlug: "atibaia-sp",
      stateUF: "SP",
      members: [buildMember("itatiba-sp", "Itatiba")],
      radiusKm: 80,
    });

    const anunciar = entries.find((e) => e.id === "anunciar")!;
    expect(anunciar.answer).toContain("Região de Atibaia");
    expect(anunciar.answer).toContain("SP");
    expect(anunciar.answer).toMatch(/sem custo|não há custo/i);
  });
});
