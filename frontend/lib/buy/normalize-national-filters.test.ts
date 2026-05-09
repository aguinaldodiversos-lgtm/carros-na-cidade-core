import { describe, expect, it } from "vitest";

import { normalizeNationalFilters } from "@/lib/buy/territory-variant";

/**
 * Contrato do catálogo NACIONAL (`/comprar` sem território explícito).
 *
 * Regra absoluta da rodada de credibilidade: NUNCA injetar
 * DEFAULT_PUBLIC_CITY_SLUG (sao-paulo-sp) silenciosamente. /comprar sem
 * parâmetros tem que devolver Brasil-todo, não SP.
 */

describe("normalizeNationalFilters — catálogo amplo sem território", () => {
  it("não injeta state nem city_slug quando searchParams está vazio", () => {
    const out = normalizeNationalFilters({});
    expect(out.state).toBeUndefined();
    expect(out.city_slug).toBeUndefined();
    expect(out.city).toBeUndefined();
    expect(out.city_id).toBeUndefined();
  });

  it("apaga state mesmo quando o caller passou via query (defesa em profundidade)", () => {
    // Cenário: /comprar?state=SP — em produção este caso é interceptado
    // por page.tsx com um redirect para /comprar/estado/sp. Mas se algum
    // caller chamar diretamente este normalizador com state na query,
    // ele NÃO deve aplicar o filtro estadual silenciosamente.
    const out = normalizeNationalFilters({ state: "SP" });
    expect(out.state).toBeUndefined();
  });

  it("apaga city_slug mesmo quando passado por query", () => {
    const out = normalizeNationalFilters({ city_slug: "sao-paulo-sp" });
    expect(out.city_slug).toBeUndefined();
  });

  it("preserva filtros não-territoriais do usuário", () => {
    const out = normalizeNationalFilters({
      brand: "Honda",
      model: "Civic",
      min_price: "20000",
      max_price: "80000",
      year_min: "2018",
    });
    expect(out.brand).toBe("Honda");
    expect(out.model).toBe("Civic");
    expect(out.min_price).toBe(20000);
    expect(out.max_price).toBe(80000);
    expect(out.year_min).toBe(2018);
  });

  it("aplica sort='recent' como default quando não há sort explícito", () => {
    const out = normalizeNationalFilters({});
    expect(out.sort).toBe("recent");
  });

  it("respeita sort explícito do usuário", () => {
    const out = normalizeNationalFilters({ sort: "price_asc" });
    expect(out.sort).toBe("price_asc");
  });

  it("aplica page=1 e limit padrão quando não vêm na query", () => {
    const out = normalizeNationalFilters({});
    expect(out.page).toBe(1);
    expect(out.limit).toBeGreaterThan(0);
  });

  it("respeita page passado pelo usuário", () => {
    const out = normalizeNationalFilters({ page: "3" });
    expect(out.page).toBe(3);
  });

  it("apaga filtros territoriais mesmo passando q + brand juntos", () => {
    // Mistura realista: usuário com utm/legacy link que carrega state E
    // filtros não-territoriais. Resultado: state some, demais ficam.
    const out = normalizeNationalFilters({
      state: "SP",
      city_slug: "sao-paulo-sp",
      brand: "Toyota",
      q: "corolla",
    });
    expect(out.state).toBeUndefined();
    expect(out.city_slug).toBeUndefined();
    expect(out.brand).toBe("Toyota");
    expect(out.q).toBe("corolla");
  });
});
