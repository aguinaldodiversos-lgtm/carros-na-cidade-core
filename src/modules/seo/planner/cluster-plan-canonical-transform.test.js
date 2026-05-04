import { describe, expect, it } from "vitest";
import {
  transformClusterPlanToCanonicalPath,
  VALID_SLUG_REGEX,
} from "./cluster-plan-canonical-transform.js";

const ATIBAIA = Object.freeze({
  city_id: 4761,
  slug: "atibaia-sp",
  state: "SP",
  stage: "discovery",
});

function makeCluster(clusterType, overrides = {}) {
  // Shape replicada de cluster-planner.tasks.js#buildStageClusters.
  return {
    cluster_type: clusterType,
    path: `/cidade/${ATIBAIA.slug}`, // valor original do builder; transformer ignora
    money_page: false,
    priority: 50,
    ...overrides,
  };
}

describe("transformClusterPlanToCanonicalPath — Fase 1 reescrita", () => {
  it("city_home → /carros-em/[slug] (canônica intermediária da intenção 'comprar carros na cidade')", () => {
    const result = transformClusterPlanToCanonicalPath(makeCluster("city_home"), ATIBAIA);
    expect(result).toBe("/carros-em/atibaia-sp");
  });

  it("city_below_fipe → /carros-baratos-em/[slug] (canônica intermediária 'barato/abaixo-da-fipe')", () => {
    const result = transformClusterPlanToCanonicalPath(makeCluster("city_below_fipe"), ATIBAIA);
    expect(result).toBe("/carros-baratos-em/atibaia-sp");
  });

  it("city_home NUNCA retorna /cidade/[slug] (antiga, noindex pós-Fase 1)", () => {
    const result = transformClusterPlanToCanonicalPath(makeCluster("city_home"), ATIBAIA);
    expect(result).not.toBe("/cidade/atibaia-sp");
    expect(result).not.toContain("/cidade/");
  });

  it("city_below_fipe NUNCA retorna /cidade/[slug]/abaixo-da-fipe (antiga, noindex pós-Fase 1)", () => {
    const result = transformClusterPlanToCanonicalPath(makeCluster("city_below_fipe"), ATIBAIA);
    expect(result).not.toBe("/cidade/atibaia-sp/abaixo-da-fipe");
    expect(result).not.toContain("/abaixo-da-fipe");
  });

  it("transformer NUNCA retorna /comprar/cidade/[slug] (canônica antiga pré-Fase 1)", () => {
    for (const ct of ["city_home", "city_below_fipe", "city_brand", "city_brand_model"]) {
      const cluster = makeCluster(ct, { brand: "Honda", model: "Civic" });
      const result = transformClusterPlanToCanonicalPath(cluster, ATIBAIA);
      if (result !== null) {
        expect(result).not.toContain("/comprar/cidade/");
      }
    }
  });
});

describe("transformClusterPlanToCanonicalPath — skip explícito (bootstrap Opção A)", () => {
  it("city_opportunities → null (skip; canonicaliza para a mesma URL que below_fipe transforma)", () => {
    const result = transformClusterPlanToCanonicalPath(makeCluster("city_opportunities"), ATIBAIA);
    expect(result).toBeNull();
  });

  it("city_brand → null (skip; página está noindex,follow em produção)", () => {
    const cluster = makeCluster("city_brand", { brand: "Honda" });
    const result = transformClusterPlanToCanonicalPath(cluster, ATIBAIA);
    expect(result).toBeNull();
  });

  it("city_brand → null mesmo sem brand definida (skip vence validação)", () => {
    // Como o tipo é skipado, brand vazio NÃO deve gerar throw — o skip
    // acontece antes de qualquer requisito de brand. Caller pula.
    const cluster = makeCluster("city_brand", { brand: "" });
    const result = transformClusterPlanToCanonicalPath(cluster, ATIBAIA);
    expect(result).toBeNull();
  });

  it("city_brand_model → null (skip; página está noindex,follow em produção)", () => {
    const cluster = makeCluster("city_brand_model", { brand: "Honda", model: "Civic" });
    const result = transformClusterPlanToCanonicalPath(cluster, ATIBAIA);
    expect(result).toBeNull();
  });

  it("city_brand_model → null mesmo sem brand/model definidos (skip vence validação)", () => {
    const cluster = makeCluster("city_brand_model", { brand: "", model: "" });
    const result = transformClusterPlanToCanonicalPath(cluster, ATIBAIA);
    expect(result).toBeNull();
  });
});

describe("transformClusterPlanToCanonicalPath — validação fail-fast", () => {
  it("cluster null → throw", () => {
    expect(() => transformClusterPlanToCanonicalPath(null, ATIBAIA)).toThrow(/cluster.*obrigatório/);
  });

  it("city null → throw", () => {
    expect(() => transformClusterPlanToCanonicalPath(makeCluster("city_home"), null)).toThrow(
      /city.*obrigatório/
    );
  });

  it("city.slug vazio → throw", () => {
    const noSlug = { ...ATIBAIA, slug: "" };
    expect(() => transformClusterPlanToCanonicalPath(makeCluster("city_home"), noSlug)).toThrow(
      /city\.slug.*obrigatório/
    );
  });

  it("city.slug whitespace → throw", () => {
    const noSlug = { ...ATIBAIA, slug: "   " };
    expect(() => transformClusterPlanToCanonicalPath(makeCluster("city_home"), noSlug)).toThrow(
      /city\.slug/
    );
  });

  it("cluster_type desconhecido → throw com listagem dos válidos", () => {
    const cluster = makeCluster("city_super_estranho");
    expect(() => transformClusterPlanToCanonicalPath(cluster, ATIBAIA)).toThrow(
      /cluster_type desconhecido.*city_super_estranho/
    );
  });
});

describe("transformClusterPlanToCanonicalPath — validação de slug canônico", () => {
  it("slug com não-ASCII (sæo-paulo) → throw fail-fast", () => {
    const badCity = { ...ATIBAIA, slug: "sæo-paulo" };
    expect(() => transformClusterPlanToCanonicalPath(makeCluster("city_home"), badCity)).toThrow(
      /slug fora do padrão canônico/
    );
  });

  it("slug sem UF (sao-paulo) → throw", () => {
    const badCity = { ...ATIBAIA, slug: "sao-paulo" };
    expect(() => transformClusterPlanToCanonicalPath(makeCluster("city_home"), badCity)).toThrow(
      /slug fora do padrão canônico/
    );
  });

  it("slug com acento (são-paulo-sp) → throw", () => {
    const badCity = { ...ATIBAIA, slug: "são-paulo-sp" };
    expect(() => transformClusterPlanToCanonicalPath(makeCluster("city_home"), badCity)).toThrow(
      /slug fora do padrão canônico/
    );
  });

  it("slug uppercase (Atibaia-SP) → throw", () => {
    const badCity = { ...ATIBAIA, slug: "Atibaia-SP" };
    expect(() => transformClusterPlanToCanonicalPath(makeCluster("city_home"), badCity)).toThrow(
      /slug fora do padrão canônico/
    );
  });

  it("slug sem nada antes do UF (-sp) → throw", () => {
    const badCity = { ...ATIBAIA, slug: "-sp" };
    expect(() => transformClusterPlanToCanonicalPath(makeCluster("city_home"), badCity)).toThrow(
      /slug fora do padrão canônico/
    );
  });

  it("slug válido (atibaia-sp) → não throw, retorna /carros-em/atibaia-sp", () => {
    const result = transformClusterPlanToCanonicalPath(makeCluster("city_home"), ATIBAIA);
    expect(result).toBe("/carros-em/atibaia-sp");
  });

  it("slug válido com múltiplos hífens (braganca-paulista-sp) → não throw", () => {
    const ok = { ...ATIBAIA, slug: "braganca-paulista-sp" };
    const result = transformClusterPlanToCanonicalPath(makeCluster("city_home"), ok);
    expect(result).toBe("/carros-em/braganca-paulista-sp");
  });

  it("validação de slug aplica MESMO para tipos skipados (fail-fast antes do switch)", () => {
    // Slug inválido em city_brand/city_brand_model/city_opportunities
    // (que retornariam null) ainda assim throwa — sinal de dado upstream
    // defeituoso vale para qualquer tipo.
    const badCity = { ...ATIBAIA, slug: "sæo-paulo" };
    for (const ct of ["city_opportunities", "city_brand", "city_brand_model"]) {
      const cluster = makeCluster(ct, { brand: "Honda", model: "Civic" });
      expect(() => transformClusterPlanToCanonicalPath(cluster, badCity)).toThrow(
        /slug fora do padrão canônico/
      );
    }
  });

  it("erro inclui o slug ofensivo e o cluster_type para diagnóstico", () => {
    const badCity = { ...ATIBAIA, slug: "sæo-paulo" };
    try {
      transformClusterPlanToCanonicalPath(makeCluster("city_home"), badCity);
      throw new Error("deveria ter throwado");
    } catch (err) {
      expect(err.message).toContain("sæo-paulo");
      expect(err.message).toContain("city_home");
      expect(err.message).toContain(VALID_SLUG_REGEX.source);
    }
  });
});

describe("transformClusterPlanToCanonicalPath — invariantes globais", () => {
  it("nenhum tipo persistível retorna path com query string", () => {
    const cases = [
      { type: "city_home" },
      { type: "city_below_fipe" },
      { type: "city_brand", brand: "Honda" },
      { type: "city_brand_model", brand: "Honda", model: "Civic" },
    ];
    for (const { type, brand, model } of cases) {
      const cluster = makeCluster(type, { brand, model });
      const result = transformClusterPlanToCanonicalPath(cluster, ATIBAIA);
      if (result !== null) {
        expect(result).not.toContain("?");
      }
    }
  });

  it("nenhum tipo persistível retorna path vazio", () => {
    const cases = [
      { type: "city_home" },
      { type: "city_below_fipe" },
      { type: "city_brand", brand: "Honda" },
      { type: "city_brand_model", brand: "Honda", model: "Civic" },
    ];
    for (const { type, brand, model } of cases) {
      const cluster = makeCluster(type, { brand, model });
      const result = transformClusterPlanToCanonicalPath(cluster, ATIBAIA);
      if (result !== null) {
        expect(result.length).toBeGreaterThan(0);
        expect(result.startsWith("/")).toBe(true);
      }
    }
  });

  it("bootstrap Opção A: APENAS city_home e city_below_fipe são persistíveis; demais retornam null", () => {
    const persistible = new Set(["city_home", "city_below_fipe"]);
    const allTypes = [
      "city_home",
      "city_below_fipe",
      "city_opportunities",
      "city_brand",
      "city_brand_model",
    ];
    for (const ct of allTypes) {
      const cluster = makeCluster(ct, { brand: "Honda", model: "Civic" });
      const result = transformClusterPlanToCanonicalPath(cluster, ATIBAIA);
      if (persistible.has(ct)) {
        expect(result).not.toBeNull();
        expect(typeof result).toBe("string");
      } else {
        expect(result).toBeNull();
      }
    }
  });
});
