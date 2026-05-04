import { describe, expect, it, vi } from "vitest";
import {
  loadDotenvIfAvailable,
  parseArgs,
  runBootstrap,
} from "../../scripts/seo/bootstrap-cluster-plans.mjs";

// ───────────────────────────────────────────────────────────────────────────
// Helpers de fixture — replicam shape de cluster-planner.service.js#buildTopCitiesClusterPlans
// ───────────────────────────────────────────────────────────────────────────

function makeCity(slug, overrides = {}) {
  return {
    city_id: 1,
    slug,
    state: "SP",
    stage: "discovery",
    ...overrides,
  };
}

function makePlan(slug, overrides = {}) {
  return {
    city: makeCity(slug),
    clusters: [
      { cluster_type: "city_home", path: `/cidade/${slug}`, money_page: false, priority: 100 },
      { cluster_type: "city_below_fipe", path: `/cidade/${slug}/abaixo-da-fipe`, money_page: true, priority: 94 },
      { cluster_type: "city_opportunities", path: `/cidade/${slug}/oportunidades`, money_page: true, priority: 95 },
      { cluster_type: "city_brand", brand: "Honda", path: `/cidade/${slug}/marca/honda`, money_page: false, priority: 65 },
      { cluster_type: "city_brand_model", brand: "Honda", model: "Civic", path: `/cidade/${slug}/marca/honda/modelo/civic`, money_page: false, priority: 58 },
    ],
    generatedAt: "2026-05-03T00:00:00.000Z",
    ...overrides,
  };
}

function makeLogger() {
  const calls = [];
  return {
    log: (level, msg, meta) => calls.push({ level, msg, meta }),
    calls,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// loadDotenvIfAvailable — dotenv é opcional (Render já tem env populada)
// ───────────────────────────────────────────────────────────────────────────

describe("loadDotenvIfAvailable — dotenv opcional", () => {
  it("retorna {loaded:true} quando dotenv está presente (importer real)", async () => {
    // No ambiente de teste local, dotenv está instalado — happy path real.
    const result = await loadDotenvIfAvailable();
    expect(result.loaded).toBe(true);
  });

  it("retorna {loaded:false, reason:'module-not-found'} quando dotenv falta (Render-like)", async () => {
    const importer = vi.fn(() => {
      const err = new Error("Cannot find package 'dotenv'");
      err.code = "ERR_MODULE_NOT_FOUND";
      throw err;
    });
    const result = await loadDotenvIfAvailable({ importer });
    expect(result).toEqual({ loaded: false, reason: "module-not-found" });
    expect(importer).toHaveBeenCalledWith("dotenv");
  });

  it("propaga erros que NÃO sejam ERR_MODULE_NOT_FOUND (não mascara bug)", async () => {
    const importer = vi.fn(() => {
      throw new Error("kaboom — .env corrompido");
    });
    await expect(loadDotenvIfAvailable({ importer })).rejects.toThrow(/kaboom/);
  });

  it("usa dotenv.config quando o módulo o expõe na raiz", async () => {
    const config = vi.fn();
    const importer = vi.fn(async () => ({ config }));
    const result = await loadDotenvIfAvailable({ importer });
    expect(config).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ loaded: true });
  });

  it("usa dotenv.default.config quando o módulo só expõe via default", async () => {
    const config = vi.fn();
    const importer = vi.fn(async () => ({ default: { config } }));
    const result = await loadDotenvIfAvailable({ importer });
    expect(config).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ loaded: true });
  });

  it("retorna {loaded:false, reason:'no-config-fn'} se dotenv vier sem .config", async () => {
    const importer = vi.fn(async () => ({}));
    const result = await loadDotenvIfAvailable({ importer });
    expect(result).toEqual({ loaded: false, reason: "no-config-fn" });
  });

  it("não persiste no banco — função é puramente side-effect em process.env", async () => {
    // Sanity: confirmar que loadDotenvIfAvailable não importa nada de DB.
    // O importer mockado nunca é chamado com 'pg' / db.js / etc.
    const importer = vi.fn(async () => ({ config: () => {} }));
    await loadDotenvIfAvailable({ importer });
    for (const call of importer.mock.calls) {
      expect(call[0]).toBe("dotenv");
      expect(call[0]).not.toMatch(/db\.js|pg|repository|service/);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// parseArgs
// ───────────────────────────────────────────────────────────────────────────

describe("parseArgs — defaults safe", () => {
  it("sem args → dryRun=true, yes=false, limit=5", () => {
    const args = parseArgs(["node", "script.mjs"]);
    expect(args.dryRun).toBe(true);
    expect(args.yes).toBe(false);
    expect(args.limit).toBe(5);
  });

  it("--dry-run sozinho → dryRun=true (default já era true; flag explícita confirma)", () => {
    const args = parseArgs(["node", "script.mjs", "--dry-run"]);
    expect(args.dryRun).toBe(true);
    expect(args.yes).toBe(false);
  });

  it("--yes → dryRun=false (yes força persistência)", () => {
    const args = parseArgs(["node", "script.mjs", "--yes"]);
    expect(args.yes).toBe(true);
    expect(args.dryRun).toBe(false);
  });

  it("--yes + --dry-run → --yes vence (persistência), porque dry-run é apenas o default", () => {
    const args = parseArgs(["node", "script.mjs", "--yes", "--dry-run"]);
    expect(args.yes).toBe(true);
    expect(args.dryRun).toBe(false);
  });

  it("--limit=10 → 10", () => {
    const args = parseArgs(["node", "script.mjs", "--limit=10"]);
    expect(args.limit).toBe(10);
  });

  it("--limit inválido (NaN, negativo, zero) → mantém default 5", () => {
    expect(parseArgs(["node", "script.mjs", "--limit=abc"]).limit).toBe(5);
    expect(parseArgs(["node", "script.mjs", "--limit=-3"]).limit).toBe(5);
    expect(parseArgs(["node", "script.mjs", "--limit=0"]).limit).toBe(5);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// runBootstrap — dry-run NUNCA escreve
// ───────────────────────────────────────────────────────────────────────────

describe("runBootstrap — dry-run não chama persist", () => {
  it("dryRun=true: persist NUNCA é chamado, totalPersisted=0", async () => {
    const persist = vi.fn();
    const build = vi.fn(async () => [makePlan("atibaia-sp")]);
    const logger = makeLogger();

    const result = await runBootstrap({
      limit: 1,
      dryRun: true,
      build,
      persist,
      log: logger.log,
    });

    expect(persist).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
    expect(result.dryRun).toBe(true);
    expect(result.totals.totalPersisted).toBe(0);
    expect(result.totals.totalToPersist).toBeGreaterThan(0); // contou os que SERIAM persistidos
  });

  it("logger registra que está em dry-run", async () => {
    const logger = makeLogger();
    await runBootstrap({
      limit: 1,
      dryRun: true,
      build: async () => [makePlan("atibaia-sp")],
      persist: vi.fn(),
      log: logger.log,
    });
    const dryRunLogs = logger.calls.filter((c) => /DRY-RUN/i.test(c.msg));
    expect(dryRunLogs.length).toBeGreaterThan(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// runBootstrap — --yes chama persist com paths transformados
// ───────────────────────────────────────────────────────────────────────────

describe("runBootstrap — modo persistência (--yes)", () => {
  it("dryRun=false: persist é chamado com path TRANSFORMADO (canônica Fase 1), não o original", async () => {
    const persist = vi.fn();
    const build = vi.fn(async () => [makePlan("atibaia-sp")]);
    const logger = makeLogger();

    const result = await runBootstrap({
      limit: 1,
      dryRun: false,
      build,
      persist,
      log: logger.log,
    });

    expect(result.ok).toBe(true);
    expect(result.dryRun).toBe(false);

    // city_home transformado para /carros-em/atibaia-sp
    const cityHomeCall = persist.mock.calls.find(
      ([args]) => args.clusterType === "city_home"
    );
    expect(cityHomeCall).toBeDefined();
    expect(cityHomeCall[0].path).toBe("/carros-em/atibaia-sp");
    // NÃO chamou com o path antigo
    const oldPathCall = persist.mock.calls.find(
      ([args]) => args.path === "/cidade/atibaia-sp"
    );
    expect(oldPathCall).toBeUndefined();

    // city_below_fipe transformado para /carros-baratos-em/atibaia-sp
    const belowFipeCall = persist.mock.calls.find(
      ([args]) => args.clusterType === "city_below_fipe"
    );
    expect(belowFipeCall[0].path).toBe("/carros-baratos-em/atibaia-sp");
  });

  it("city_opportunities é skipped (não chama persist)", async () => {
    const persist = vi.fn();
    await runBootstrap({
      limit: 1,
      dryRun: false,
      build: async () => [makePlan("atibaia-sp")],
      persist,
      log: () => {},
    });
    const opportunitiesCall = persist.mock.calls.find(
      ([args]) => args.clusterType === "city_opportunities"
    );
    expect(opportunitiesCall).toBeUndefined();
  });

  it("city_brand é skipped no bootstrap inicial (Opção A; não chama persist)", async () => {
    const persist = vi.fn();
    await runBootstrap({
      limit: 1,
      dryRun: false,
      build: async () => [makePlan("atibaia-sp")],
      persist,
      log: () => {},
    });
    const brandCall = persist.mock.calls.find(
      ([args]) => args.clusterType === "city_brand"
    );
    expect(brandCall).toBeUndefined();
  });

  it("city_brand_model é skipped no bootstrap inicial (Opção A; não chama persist)", async () => {
    const persist = vi.fn();
    await runBootstrap({
      limit: 1,
      dryRun: false,
      build: async () => [makePlan("atibaia-sp")],
      persist,
      log: () => {},
    });
    const brandModelCall = persist.mock.calls.find(
      ([args]) => args.clusterType === "city_brand_model"
    );
    expect(brandModelCall).toBeUndefined();
  });

  it("apenas city_home e city_below_fipe são persistidos (bootstrap Opção A)", async () => {
    const persist = vi.fn();
    await runBootstrap({
      limit: 1,
      dryRun: false,
      build: async () => [makePlan("atibaia-sp")],
      persist,
      log: () => {},
    });
    const persistedTypes = persist.mock.calls.map(([args]) => args.clusterType).sort();
    expect(persistedTypes).toEqual(["city_below_fipe", "city_home"]);
  });

  it("totals.totalSkipped reflete city_opportunities + city_brand + city_brand_model ignorados (Opção A)", async () => {
    const result = await runBootstrap({
      limit: 1,
      dryRun: false,
      build: async () => [makePlan("atibaia-sp")],
      persist: vi.fn(),
      log: () => {},
    });
    // 1 city × 5 clusters; 3 skipped (opportunities + brand + brand_model); 2 persistidos
    expect(result.totals.totalGenerated).toBe(5);
    expect(result.totals.totalSkipped).toBe(3);
    expect(result.totals.totalTransformed).toBe(2);
    expect(result.totals.totalPersisted).toBe(2);
  });

  it("status='planned' e stage de city.stage propagados ao persist", async () => {
    const persist = vi.fn();
    const plan = makePlan("atibaia-sp");
    plan.city.stage = "expansion";
    await runBootstrap({
      limit: 1,
      dryRun: false,
      build: async () => [plan],
      persist,
      log: () => {},
    });
    for (const [args] of persist.mock.calls) {
      expect(args.status).toBe("planned");
      expect(args.stage).toBe("expansion");
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// runBootstrap — --limit propagado ao build
// ───────────────────────────────────────────────────────────────────────────

describe("runBootstrap — --limit", () => {
  it("limit é passado pro build", async () => {
    const build = vi.fn(async () => []);
    await runBootstrap({
      limit: 7,
      dryRun: true,
      build,
      persist: vi.fn(),
      log: () => {},
    });
    expect(build).toHaveBeenCalledWith(7);
  });

  it("limit limita o número de cidades processadas (build retorna N cidades = limit)", async () => {
    const build = vi.fn(async (n) =>
      Array.from({ length: n }, (_, i) => makePlan(`cidade-${i}-tt`))
    );
    const persist = vi.fn();
    const result = await runBootstrap({
      limit: 3,
      dryRun: false,
      build,
      persist,
      log: () => {},
    });
    expect(result.totals.totalCities).toBe(3);
    // Bootstrap Opção A: 3 cidades × 5 clusters = 15 generated;
    // 9 skipped (opportunities + brand + brand_model por cidade); 6 persistidos
    // (city_home + city_below_fipe por cidade).
    expect(result.totals.totalGenerated).toBe(15);
    expect(result.totals.totalSkipped).toBe(9);
    expect(result.totals.totalPersisted).toBe(6);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// runBootstrap — fluxo bootstrap inicial (city_scores vazia → fallback)
// ───────────────────────────────────────────────────────────────────────────

describe("runBootstrap — bootstrap inicial via fallback (stage=seed)", () => {
  it("dry-run: 3 cidades vindas do fallback (stage='seed') → 15/9/6/0", async () => {
    // Simula a saída de buildTopCitiesClusterPlans quando o fallback ads+cities
    // alimenta o planner (city_scores vazia em produção bootstrap).
    const fallbackPlans = [
      makePlan("atibaia-sp", {
        city: makeCity("atibaia-sp", { city_id: 4761, stage: "seed" }),
      }),
      makePlan("braganca-paulista-sp", {
        city: makeCity("braganca-paulista-sp", { city_id: 4762, stage: "seed" }),
      }),
      makePlan("mairipora-sp", {
        city: makeCity("mairipora-sp", { city_id: 4763, stage: "seed" }),
      }),
    ];

    const result = await runBootstrap({
      limit: 3,
      dryRun: true,
      build: async () => fallbackPlans,
      persist: vi.fn(),
      log: () => {},
    });

    expect(result.ok).toBe(true);
    expect(result.dryRun).toBe(true);
    expect(result.totals.totalCities).toBe(3);
    expect(result.totals.totalGenerated).toBe(15);
    expect(result.totals.totalSkipped).toBe(9);
    expect(result.totals.totalToPersist).toBe(6);
    expect(result.totals.totalTransformed).toBe(6);
    expect(result.totals.totalPersisted).toBe(0); // dry-run nunca persiste
  });
});

// ───────────────────────────────────────────────────────────────────────────
// runBootstrap — fail-fast em erro de transformação
// ───────────────────────────────────────────────────────────────────────────

describe("runBootstrap — erro de transformação aborta antes de persistir", () => {
  it("transform que lança em UM cluster aborta TUDO (lote parcial NÃO é persistido)", async () => {
    const persist = vi.fn();
    const transform = vi.fn((cluster, city) => {
      if (cluster.cluster_type === "city_brand") {
        throw new Error("teste: brand inválido");
      }
      return `/test/${city.slug}/${cluster.cluster_type}`;
    });

    const result = await runBootstrap({
      limit: 1,
      dryRun: false,
      build: async () => [makePlan("atibaia-sp")],
      persist,
      log: () => {},
      transform,
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("transform_errors");
    expect(persist).not.toHaveBeenCalled();
    expect(result.transformErrors.length).toBeGreaterThan(0);
  });

  it("erro de transformação registra contexto (cluster_type + city)", async () => {
    const transform = vi.fn(() => {
      throw new Error("kaboom");
    });
    const result = await runBootstrap({
      limit: 1,
      dryRun: false,
      build: async () => [makePlan("atibaia-sp")],
      persist: vi.fn(),
      log: () => {},
      transform,
    });
    expect(result.transformErrors[0]).toMatchObject({
      cluster_type: expect.any(String),
      city: "atibaia-sp",
      error: expect.stringContaining("kaboom"),
    });
  });
});

// ───────────────────────────────────────────────────────────────────────────
// runBootstrap — logs incluem contagens principais
// ───────────────────────────────────────────────────────────────────────────

describe("runBootstrap — observabilidade", () => {
  it("logs incluem contagens principais (totalCities, totalGenerated, totalTransformed, totalSkipped, totalToPersist)", async () => {
    const logger = makeLogger();
    await runBootstrap({
      limit: 1,
      dryRun: true,
      build: async () => [makePlan("atibaia-sp")],
      persist: vi.fn(),
      log: logger.log,
    });

    const meta = logger.calls.flatMap((c) => (c.meta ? Object.keys(c.meta) : []));
    expect(meta).toContain("totalCities");
    expect(meta).toContain("totalGenerated");
    expect(meta).toContain("totalTransformed");
    expect(meta).toContain("totalSkipped");
    expect(meta).toContain("totalToPersist");
  });

  it("logs incluem amostra de paths transformados (sample com originalPath → transformedPath)", async () => {
    const logger = makeLogger();
    await runBootstrap({
      limit: 1,
      dryRun: true,
      build: async () => [makePlan("atibaia-sp")],
      persist: vi.fn(),
      log: logger.log,
    });
    const sampleLogs = logger.calls.filter((c) => /sample:/i.test(c.msg));
    expect(sampleLogs.length).toBeGreaterThan(0);
    expect(sampleLogs.some((c) => /→/.test(c.msg))).toBe(true);
  });
});
