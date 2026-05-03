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

describe("transformClusterPlanToCanonicalPath — skip explícito", () => {
  it("city_opportunities → null (skip; canonicaliza para a mesma URL que below_fipe transforma)", () => {
    const result = transformClusterPlanToCanonicalPath(makeCluster("city_opportunities"), ATIBAIA);
    expect(result).toBeNull();
  });
});

describe("transformClusterPlanToCanonicalPath — preserva tipos não tocados pela Fase 1", () => {
  it("city_brand preserva /cidade/[slug]/marca/[brand_slug]", () => {
    const cluster = makeCluster("city_brand", { brand: "Honda" });
    const result = transformClusterPlanToCanonicalPath(cluster, ATIBAIA);
    expect(result).toBe("/cidade/atibaia-sp/marca/honda");
  });

  it("city_brand normaliza brand para lowercase + trim (mesmo comportamento do builder original)", () => {
    const cluster = makeCluster("city_brand", { brand: "  Honda  " });
    const result = transformClusterPlanToCanonicalPath(cluster, ATIBAIA);
    expect(result).toBe("/cidade/atibaia-sp/marca/honda");
  });

  it("city_brand_model preserva /cidade/[slug]/marca/[brand_slug]/modelo/[model_slug]", () => {
    const cluster = makeCluster("city_brand_model", { brand: "Honda", model: "Civic" });
    const result = transformClusterPlanToCanonicalPath(cluster, ATIBAIA);
    expect(result).toBe("/cidade/atibaia-sp/marca/honda/modelo/civic");
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

  it("city_brand sem brand → throw", () => {
    const cluster = makeCluster("city_brand", { brand: "" });
    expect(() => transformClusterPlanToCanonicalPath(cluster, ATIBAIA)).toThrow(
      /city_brand.*brand/
    );
  });

  it("city_brand com brand whitespace → throw", () => {
    const cluster = makeCluster("city_brand", { brand: "   " });
    expect(() => transformClusterPlanToCanonicalPath(cluster, ATIBAIA)).toThrow(
      /city_brand.*brand/
    );
  });

  it("city_brand_model sem brand → throw", () => {
    const cluster = makeCluster("city_brand_model", { brand: "", model: "Civic" });
    expect(() => transformClusterPlanToCanonicalPath(cluster, ATIBAIA)).toThrow(
      /city_brand_model.*brand/
    );
  });

  it("city_brand_model sem model → throw", () => {
    const cluster = makeCluster("city_brand_model", { brand: "Honda", model: "" });
    expect(() => transformClusterPlanToCanonicalPath(cluster, ATIBAIA)).toThrow(
      /city_brand_model.*model/
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
  it("nenhum tipo retorna path com query string", () => {
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

  it("nenhum tipo retorna path vazio", () => {
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
});
