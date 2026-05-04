import { describe, expect, it } from "vitest";
import { transformClusterPlanToCanonicalPath } from "./cluster-plan-canonical-transform.js";

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
