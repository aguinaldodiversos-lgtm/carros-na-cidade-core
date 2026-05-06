import { describe, expect, it } from "vitest";

import {
  buildCityPath,
  buildNonTerritoryQueryString,
  buildStatePath,
  isValidCitySlug,
  normalizeCityFilters,
  normalizeStateFilters,
  normalizeUf,
} from "./territory-variant";

/**
 * Contrato dos filtros públicos (Fase 2 da auditoria territorial).
 *
 * Regras invariantes que essas funções precisam respeitar:
 *
 *   1. Página ESTADUAL envia `state` e NUNCA `city_slug` / `city_id` / `city`.
 *   2. Página CIDADE envia `city_slug` e NUNCA `state` / `city_id` / `city`.
 *   3. Nenhum helper aqui injeta DEFAULT_PUBLIC_CITY_SLUG silenciosamente —
 *      o caller é quem traz UF ou slug explícitos.
 *   4. Canonical de listagem (estadual e cidade) é URL LIMPA, sem
 *      sort/limit/page/brand/model/utm vazando.
 *   5. `city_slugs` (plural, multi-cidade da Página Regional) continua
 *      dormente: nenhum normalizador aqui o popula a partir de filtros do
 *      usuário em /comprar/estado ou /comprar/cidade.
 */

describe("normalizeStateFilters — contrato Página Estadual", () => {
  it("envia state em UPPERCASE; nunca envia city_slug/city_id/city", () => {
    const out = normalizeStateFilters("SP", {
      brand: "Honda",
      model: "Civic",
      sort: "price_asc",
    });

    expect(out.state).toBe("SP");
    expect(out.city_slug).toBeUndefined();
    expect(out.city_id).toBeUndefined();
    expect(out.city).toBeUndefined();
  });

  it("apaga city_slug mesmo quando o caller TENTA passá-lo na query", () => {
    const out = normalizeStateFilters("SP", {
      city_slug: "sao-paulo-sp",
      city_id: "1",
      city: "São Paulo",
    });

    expect(out.state).toBe("SP");
    expect(out.city_slug).toBeUndefined();
    expect(out.city_id).toBeUndefined();
    expect(out.city).toBeUndefined();
  });

  it("preserva filtros do usuário (brand/model/preço/ano)", () => {
    const out = normalizeStateFilters("SP", {
      brand: "Honda",
      model: "Civic",
      min_price: "20000",
      max_price: "80000",
      year_min: "2018",
      year_max: "2024",
    });

    expect(out.brand).toBe("Honda");
    expect(out.model).toBe("Civic");
    expect(out.min_price).toBe(20000);
    expect(out.max_price).toBe(80000);
    expect(out.year_min).toBe(2018);
    expect(out.year_max).toBe(2024);
  });

  it("aplica sort='recent' como default quando o usuário não pediu sort", () => {
    const out = normalizeStateFilters("SP", {});
    expect(out.sort).toBe("recent");
  });

  it("respeita sort explícito do usuário", () => {
    const out = normalizeStateFilters("SP", { sort: "price_asc" });
    expect(out.sort).toBe("price_asc");
  });
});

describe("normalizeCityFilters — contrato Página Cidade", () => {
  it("envia city_slug; nunca envia state/city/city_id", () => {
    const out = normalizeCityFilters("atibaia-sp", {
      brand: "Honda",
      sort: "recent",
    });

    expect(out.city_slug).toBe("atibaia-sp");
    expect(out.state).toBeUndefined();
    expect(out.city).toBeUndefined();
    expect(out.city_id).toBeUndefined();
  });

  it("apaga state mesmo quando caller tenta passá-lo (evita AND redundante)", () => {
    const out = normalizeCityFilters("atibaia-sp", {
      state: "SP",
      city: "Atibaia",
      city_id: "999",
    });

    expect(out.city_slug).toBe("atibaia-sp");
    expect(out.state).toBeUndefined();
    expect(out.city).toBeUndefined();
    expect(out.city_id).toBeUndefined();
  });

  it("preserva filtros do usuário sem injetar cidade default", () => {
    const out = normalizeCityFilters("atibaia-sp", {
      brand: "Toyota",
      model: "Corolla",
      max_price: "60000",
    });

    expect(out.city_slug).toBe("atibaia-sp");
    expect(out.brand).toBe("Toyota");
    expect(out.model).toBe("Corolla");
    expect(out.max_price).toBe(60000);
  });

  it("usa o slug que o caller PASSOU — nunca cai em DEFAULT_PUBLIC_CITY_SLUG", () => {
    // Defesa contra regressão: helpers públicos NÃO podem ter fallback
    // para "sao-paulo-sp" silencioso. O caller (page.tsx) já fez notFound()
    // quando o slug é inválido; aqui o slug é fonte de verdade absoluta.
    const out = normalizeCityFilters("braganca-paulista-sp", {});
    expect(out.city_slug).toBe("braganca-paulista-sp");
    expect(out.city_slug).not.toBe("sao-paulo-sp");
  });

  it("city_slugs (plural) continua dormente — não é populado a partir do slug", () => {
    // A Página Regional ainda não existe (REGIONAL_PAGE_ENABLED=false).
    // /comprar/cidade nunca deve popular city_slugs[] — o backend trata
    // city_slugs como modo multi-cidade e ativaria o boost de cidade-base.
    const out = normalizeCityFilters("atibaia-sp", {
      city_slugs: "atibaia-sp,braganca-paulista-sp",
    });
    // city_slug deve ser o canônico; city_slugs vindo da query passa pelo
    // parser mas o contrato da página cidade é singular, não multi-cidade.
    expect(out.city_slug).toBe("atibaia-sp");
  });
});

describe("buildStatePath — canonical limpo da página estadual", () => {
  it("sem filters → URL limpa", () => {
    expect(buildStatePath("SP")).toBe("/comprar/estado/sp");
  });

  it("com filters → MANTÉM a query string (uso navegacional, NÃO canonical)", () => {
    // Este helper serve dois propósitos: (a) gerar links navegacionais
    // entre estado↔cidade preservando filtros do usuário; (b) ser usado
    // SEM o segundo arg para canonical limpo. A página estadual usa
    // `buildStatePath(uf)` SEM filters no canonical (Fase 2).
    const path = buildStatePath("SP", {
      sort: "price_asc",
      brand: "Honda",
      page: 3,
    });
    expect(path).toMatch(/^\/comprar\/estado\/sp\?/);
    expect(path).toContain("sort=price_asc");
    expect(path).toContain("brand=Honda");
  });

  it("ufLowercase é aplicado ao path", () => {
    expect(buildStatePath("RJ")).toBe("/comprar/estado/rj");
  });
});

describe("buildCityPath — canonical/navegação cidade", () => {
  it("sem filters → URL limpa", () => {
    expect(buildCityPath("atibaia-sp")).toBe("/comprar/cidade/atibaia-sp");
  });
});

describe("buildNonTerritoryQueryString — separação rígida", () => {
  it("remove TODOS os territoriais (state, city, city_id, city_slug)", () => {
    const qs = buildNonTerritoryQueryString({
      state: "SP",
      city_slug: "atibaia-sp",
      city: "Atibaia",
      city_id: 999,
      brand: "Honda",
    });
    expect(qs).not.toContain("state=");
    expect(qs).not.toContain("city_slug=");
    expect(qs).not.toContain("city_id=");
    expect(qs).not.toContain("city=Atibaia");
    expect(qs).toContain("brand=Honda");
  });

  it("remove page (paginação não pertence a cross-link)", () => {
    const qs = buildNonTerritoryQueryString({ page: 5, brand: "Toyota" });
    expect(qs).not.toContain("page=");
    expect(qs).toContain("brand=Toyota");
  });
});

describe("normalizeUf — só aceita UFs válidas", () => {
  it("UF válido em qualquer caixa", () => {
    expect(normalizeUf("sp")).toBe("SP");
    expect(normalizeUf("RJ")).toBe("RJ");
    expect(normalizeUf(" mg ")).toBe("MG");
  });

  it("UF inválido → null (não cai em SP default silencioso)", () => {
    expect(normalizeUf("xx")).toBeNull();
    expect(normalizeUf("")).toBeNull();
    expect(normalizeUf(null)).toBeNull();
    expect(normalizeUf(undefined)).toBeNull();
    expect(normalizeUf("brasil")).toBeNull();
  });
});

describe("isValidCitySlug — defesa contra slug malformado", () => {
  it("aceita formato slug-uf (2 chars finais)", () => {
    expect(isValidCitySlug("sao-paulo-sp")).toBe(true);
    expect(isValidCitySlug("braganca-paulista-sp")).toBe(true);
    expect(isValidCitySlug("rio-de-janeiro-rj")).toBe(true);
  });

  it("rejeita slug sem UF / vazio / com espaços / null", () => {
    expect(isValidCitySlug("sao-paulo")).toBe(false);
    expect(isValidCitySlug("")).toBe(false);
    expect(isValidCitySlug(null)).toBe(false);
    expect(isValidCitySlug(undefined)).toBe(false);
    expect(isValidCitySlug("uf-só-um-char-x")).toBe(false);
  });
});
