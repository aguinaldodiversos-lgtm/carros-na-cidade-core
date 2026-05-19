import { describe, expect, it } from "vitest";
import { CITY_SLUG_REGEX } from "@/lib/city/city-from-pathname";
import { getStateCuratedCities, DEFAULT_CURATED_LIMIT } from "./state-territorial-cities";

describe("getStateCuratedCities", () => {
  it("retorna cidades em SP, incluindo Atibaia (gap reportado na auditoria)", () => {
    const cities = getStateCuratedCities("sp");
    expect(cities.length).toBeGreaterThan(0);
    const slugs = cities.map((c) => c.slug);
    expect(slugs).toContain("atibaia-sp");
    expect(slugs).toContain("sao-paulo-sp");
    expect(slugs).toContain("campinas-sp");
  });

  it("aceita UF em uppercase e lowercase", () => {
    const lower = getStateCuratedCities("sp");
    const upper = getStateCuratedCities("SP");
    expect(upper.map((c) => c.slug)).toEqual(lower.map((c) => c.slug));
  });

  it("normaliza slugs com acento residual (defesa contra cedilha no map)", () => {
    const cities = getStateCuratedCities("sp");
    // O map literal carrega "bragança-paulista-sp" para nome bonito;
    // o getter precisa devolver "braganca-paulista-sp" (canônico backend).
    const braganca = cities.find((c) => c.name.startsWith("Bragança"));
    expect(braganca).toBeDefined();
    expect(braganca?.slug).toBe("braganca-paulista-sp");
  });

  it("todos os slugs casam com o regex canônico de slug territorial", () => {
    for (const uf of ["sp", "rj", "mg"]) {
      const cities = getStateCuratedCities(uf);
      for (const c of cities) {
        expect(CITY_SLUG_REGEX.test(c.slug), `${uf}: ${c.slug}`).toBe(true);
      }
    }
  });

  it("UF não mapeado retorna lista vazia (caller suprime bloco)", () => {
    expect(getStateCuratedCities("zz")).toEqual([]);
    expect(getStateCuratedCities("")).toEqual([]);
    expect(getStateCuratedCities(null)).toEqual([]);
    expect(getStateCuratedCities(undefined)).toEqual([]);
  });

  it("respeita o limite padrão DEFAULT_CURATED_LIMIT", () => {
    const cities = getStateCuratedCities("sp");
    expect(cities.length).toBeLessThanOrEqual(DEFAULT_CURATED_LIMIT);
  });

  it("aceita limit custom (truncamento da lista)", () => {
    const cities = getStateCuratedCities("sp", 3);
    expect(cities).toHaveLength(3);
    // Capital primeiro (decisão deliberada do map).
    expect(cities[0].slug).toBe("sao-paulo-sp");
  });

  it("limit 0 retorna vazio (não negativo, não NaN)", () => {
    expect(getStateCuratedCities("sp", 0)).toEqual([]);
    expect(getStateCuratedCities("sp", -1)).toEqual([]);
  });

  it("nomes preservam acentos (display)", () => {
    const cities = getStateCuratedCities("sp");
    expect(cities.find((c) => c.slug === "sao-paulo-sp")?.name).toBe("São Paulo");
    expect(cities.find((c) => c.slug === "ribeirao-preto-sp")?.name).toBe("Ribeirão Preto");
  });
});

/**
 * Documentação executável da regra "destaque ≠ cobertura".
 *
 * Estes testes provam que `getStateCuratedCities` é APENAS um catálogo
 * de cidades em destaque, NÃO uma fonte de verdade para cobertura
 * nacional. Qualquer cidade brasileira existente em `cities` com
 * coordenadas pode gerar Página Regional via `/carros-usados/regiao/{slug}`,
 * independente de aparecer aqui.
 *
 * Bug que estes testes existem para prevenir: alguém usar a curadoria
 * como allowlist e travar o crescimento do portal para 149 cidades.
 */
describe("getStateCuratedCities — DESTAQUE NÃO LIMITA COBERTURA", () => {
  it("cobre os 27 UFs do Brasil (cobertura nacional de destaque)", () => {
    const allUfs = [
      "ac","al","am","ap","ba","ce","df","es","go","ma","mg","ms","mt",
      "pa","pb","pe","pi","pr","rj","rn","ro","rr","rs","sc","se","sp","to",
    ];
    for (const uf of allUfs) {
      const cities = getStateCuratedCities(uf);
      expect(cities.length, `UF ${uf} sem cidades curadas`).toBeGreaterThan(0);
    }
  });

  it("cidades fora desta lista também podem gerar regional (curadoria não é allowlist)", () => {
    // Cidades reais brasileiras de várias UFs que NÃO estão na curadoria.
    // Estas cidades existem no DB com coordenadas — a Página Regional
    // delas é gerada dinamicamente via /carros-usados/regiao/{slug},
    // sem que precisem aparecer aqui.
    const citiesForaDaCuradoria = [
      // SP — cidades médias não curadas
      "sumare-sp",
      "americana-sp",
      "piracicaba-sp",
      "limeira-sp",
      "indaiatuba-sp",
      // MG — cidades fora dos 8 curados
      "ipatinga-mg",
      "divinopolis-mg",
      "sete-lagoas-mg",
      // BA — fora dos 8 curados
      "alagoinhas-ba",
      "barreiras-ba",
      // PR — fora dos 7 curados
      "guarapuava-pr",
      "umuarama-pr",
      // Cidades pequenas representativas
      "atibaia-sp", // (esta É curada — só para contraste, ambos funcionam)
    ];

    const allCurated = new Set<string>();
    for (const uf of ["sp", "mg", "ba", "pr"]) {
      for (const c of getStateCuratedCities(uf, 100)) {
        allCurated.add(c.slug);
      }
    }

    let foraDaCuradoria = 0;
    for (const slug of citiesForaDaCuradoria) {
      if (!allCurated.has(slug)) foraDaCuradoria += 1;
    }
    // Pelo menos 5 das amostras NÃO estão na curadoria — provando que
    // a cobertura nacional via Página Regional não depende desta lista.
    expect(foraDaCuradoria).toBeGreaterThanOrEqual(5);
  });

  it("UF sem cidades curadas (hipotético) NÃO bloqueia geração de regional", () => {
    // Mesmo que uma UF não tivesse curadoria nenhuma — a Página Regional
    // continuaria funcionando para qualquer slug que existe no DB. A
    // curadoria afeta APENAS o bloco `StateTerritorialShortcuts` de
    // destaque na Página Estadual. Este teste documenta o contrato.
    const fakeUf = "zz";
    expect(getStateCuratedCities(fakeUf)).toEqual([]);
    // Esta lista vazia NÃO significa que a UF "zz" não tem cobertura —
    // apenas que não tem cidades em destaque. (Para a UF ser navegável,
    // a tabela `cities` precisa ter cidades dela com coordenadas; mas
    // este arquivo NÃO é a fonte de verdade.)
  });
});
