// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  normalizeUf,
  normalizeCityFilters,
  normalizeStateFilters,
  stateNameFromUf,
  isValidCitySlug,
} from "@/lib/buy/territory-variant";

/**
 * Testes parametrizados de escala nacional — confirmam que a
 * implementação territorial NÃO depende de hardcode de Atibaia/SP.
 *
 * Briefing 2026-05-20 (item 6): a arquitetura precisa funcionar para
 * mais de 5.500 cidades brasileiras. Esta suite valida o contrato em
 * múltiplas combinações de UF/cidade reais — Sul, Sudeste, Nordeste.
 */

const SAMPLE_CITIES: ReadonlyArray<{
  slug: string;
  expectedState: string;
  expectedStateName: string;
}> = [
  { slug: "atibaia-sp", expectedState: "SP", expectedStateName: "São Paulo" },
  { slug: "campinas-sp", expectedState: "SP", expectedStateName: "São Paulo" },
  {
    slug: "belo-horizonte-mg",
    expectedState: "MG",
    expectedStateName: "Minas Gerais",
  },
  { slug: "curitiba-pr", expectedState: "PR", expectedStateName: "Paraná" },
  { slug: "recife-pe", expectedState: "PE", expectedStateName: "Pernambuco" },
];

const SAMPLE_UFS: ReadonlyArray<{ uf: string; expectedName: string }> = [
  { uf: "sp", expectedName: "São Paulo" },
  { uf: "mg", expectedName: "Minas Gerais" },
  { uf: "pr", expectedName: "Paraná" },
  { uf: "pe", expectedName: "Pernambuco" },
  { uf: "rj", expectedName: "Rio de Janeiro" },
];

const INVALID_UFS = ["zz", "abc", "sao-paulo", "", "  ", "BR", "spp", "1"];

describe("Escala nacional — cidades em múltiplos estados (briefing item 6)", () => {
  it.each(SAMPLE_CITIES)(
    "$slug é slug válido (não cai em DEFAULT_PUBLIC_CITY_SLUG)",
    ({ slug }) => {
      expect(isValidCitySlug(slug)).toBe(true);
    }
  );

  it.each(SAMPLE_CITIES)(
    "$slug → normalizeCityFilters preserva slug exato (sem fallback silencioso)",
    ({ slug }) => {
      const filters = normalizeCityFilters(slug, {});
      expect(filters.city_slug).toBe(slug);
      expect(filters.city_slug).not.toBe("sao-paulo-sp");
    }
  );

  it.each(SAMPLE_CITIES)(
    "$slug → sort default 'relevance' (PR 2.5 ranking comercial)",
    ({ slug }) => {
      const filters = normalizeCityFilters(slug, {});
      expect(filters.sort).toBe("relevance");
    }
  );

  it.each(SAMPLE_CITIES)("$slug → não vaza state/city/city_id no payload", ({ slug }) => {
    const filters = normalizeCityFilters(slug, {});
    expect(filters.state).toBeUndefined();
    expect(filters.city).toBeUndefined();
    expect(filters.city_id).toBeUndefined();
  });
});

describe("Escala nacional — UFs válidas (briefing item 6)", () => {
  it.each(SAMPLE_UFS)("$uf normalizeUf retorna uppercase canônico", ({ uf }) => {
    expect(normalizeUf(uf)).toBe(uf.toUpperCase());
  });

  it.each(SAMPLE_UFS)(
    "$uf stateNameFromUf retorna nome completo do estado",
    ({ uf, expectedName }) => {
      expect(stateNameFromUf(uf.toUpperCase())).toBe(expectedName);
    }
  );

  it.each(SAMPLE_UFS)("$uf normalizeStateFilters envia state=UF e remove city_slug", ({ uf }) => {
    const filters = normalizeStateFilters(uf.toUpperCase(), {
      city_slug: "atibaia-sp",
      brand: "Toyota",
    });
    expect(filters.state).toBe(uf.toUpperCase());
    expect(filters.brand).toBe("Toyota");
    expect(filters.city_slug).toBeUndefined();
  });

  it.each(SAMPLE_UFS)("$uf normalizeStateFilters default sort='relevance'", ({ uf }) => {
    const filters = normalizeStateFilters(uf.toUpperCase(), {});
    expect(filters.sort).toBe("relevance");
  });
});

describe("Escala nacional — UFs inválidas retornam null (404 real downstream)", () => {
  it.each(INVALID_UFS.map((u) => ({ uf: u })))(
    "UF inválida '$uf' → normalizeUf retorna null",
    ({ uf }) => {
      expect(normalizeUf(uf)).toBeNull();
    }
  );
});

describe("Escala nacional — não há hardcode de Atibaia ou SP", () => {
  it("normalizeCityFilters de Curitiba não injeta São Paulo nem Atibaia", () => {
    const filters = normalizeCityFilters("curitiba-pr", {});
    expect(filters.city_slug).toBe("curitiba-pr");
    expect(String(JSON.stringify(filters))).not.toMatch(/atibaia/i);
    expect(String(JSON.stringify(filters))).not.toMatch(/sao-paulo-sp/i);
  });

  it("normalizeStateFilters de Pernambuco não injeta São Paulo", () => {
    const filters = normalizeStateFilters("PE", {});
    expect(filters.state).toBe("PE");
    expect(String(JSON.stringify(filters))).not.toMatch(/SP/);
    expect(String(JSON.stringify(filters))).not.toMatch(/atibaia/i);
  });

  it("stateNameFromUf de UF desconhecida não cai em 'São Paulo'", () => {
    // Comportamento esperado: stateNameFromUf retorna a própria UF
    // quando não acha no dicionário (defesa contra fallback silencioso).
    expect(stateNameFromUf("ZZ")).not.toBe("São Paulo");
  });
});
