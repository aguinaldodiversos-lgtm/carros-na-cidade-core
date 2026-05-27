import { describe, expect, it, vi } from "vitest";
import {
  parseArgs,
  buildFactualTitle,
  buildFactualContent,
  buildPublicationRow,
  runBootstrapPublications,
} from "../../scripts/seo/bootstrap-publications.mjs";

function makeCluster(overrides = {}) {
  return {
    id: 101,
    cluster_type: "city_home",
    path: "/carros-em/atibaia-sp",
    brand: null,
    model: null,
    money_page: true,
    priority: 100,
    status: "planned",
    stage: "seed",
    city_id: 7,
    city_name: "Atibaia",
    city_state: "SP",
    city_slug: "atibaia-sp",
    ...overrides,
  };
}

function makeSnapshot(overrides = {}) {
  return {
    live_ads_count: 42,
    below_fipe_ads_count: 7,
    advertisers_count: 9,
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

describe("parseArgs", () => {
  it("default é dry-run com limit=4", () => {
    const args = parseArgs(["node", "script"]);
    expect(args).toMatchObject({ apply: false, dryRun: true, limit: 4 });
  });

  it("--apply liga modo apply", () => {
    const args = parseArgs(["node", "script", "--apply"]);
    expect(args.apply).toBe(true);
    expect(args.dryRun).toBe(false);
  });

  it("--yes é alias de --apply (compat com bootstrap-cluster-plans)", () => {
    const args = parseArgs(["node", "script", "--yes"]);
    expect(args.apply).toBe(true);
  });

  it("--limit=N respeita o teto MAX_LIMIT=50", () => {
    const args = parseArgs(["node", "script", "--limit=9999"]);
    expect(args.limit).toBe(50);
  });

  it("--limit inválido cai no default", () => {
    expect(parseArgs(["node", "script", "--limit=abc"]).limit).toBe(4);
  });

  it("--dry-run explícito é coerente com sem --apply", () => {
    const args = parseArgs(["node", "script", "--dry-run", "--limit=2"]);
    expect(args.dryRun).toBe(true);
    expect(args.limit).toBe(2);
  });
});

describe("buildFactualTitle — sem IA", () => {
  it("city_home gera título de cidade", () => {
    expect(buildFactualTitle(makeCluster({ cluster_type: "city_home" }))).toMatch(/Atibaia.*SP/);
  });

  it("city_below_fipe menciona FIPE", () => {
    const title = buildFactualTitle(makeCluster({ cluster_type: "city_below_fipe" }));
    expect(title).toMatch(/FIPE/);
    expect(title).toMatch(/Atibaia/);
  });

  it("city_brand insere brand", () => {
    expect(
      buildFactualTitle(makeCluster({ cluster_type: "city_brand", brand: "Honda" }))
    ).toMatch(/Honda/);
  });

  it("cluster_type desconhecido cai em fallback genérico", () => {
    expect(buildFactualTitle(makeCluster({ cluster_type: "X_outro" }))).toMatch(/Veículos/);
  });
});

describe("buildFactualContent — derivado de DB, não AI", () => {
  it("inclui contagens reais do snapshot", () => {
    const content = buildFactualContent({
      cluster: makeCluster({ cluster_type: "city_home" }),
      citySnapshot: makeSnapshot(),
    });
    expect(content).toMatch(/42/);
    expect(content).toMatch(/9 anunciantes/);
  });

  it("city_below_fipe destaca contagem de abaixo da FIPE", () => {
    const content = buildFactualContent({
      cluster: makeCluster({ cluster_type: "city_below_fipe" }),
      citySnapshot: makeSnapshot({ below_fipe_ads_count: 3 }),
    });
    expect(content).toMatch(/3 ve[íi]culos? est[ãa]o classificados como abaixo da FIPE/i);
  });

  it("snapshot vazio ainda produz conteúdo (texto evergreen)", () => {
    const content = buildFactualContent({
      cluster: makeCluster(),
      citySnapshot: { live_ads_count: 0, below_fipe_ads_count: 0, advertisers_count: 0 },
    });
    expect(content.length).toBeGreaterThan(0);
    expect(content).toMatch(/atualizados diariamente/i);
  });
});

describe("buildPublicationRow — schema defensivo", () => {
  const FULL_SCHEMA = new Set([
    "cluster_plan_id",
    "path",
    "title",
    "content",
    "excerpt",
    "city_id",
    "brand",
    "model",
    "publication_type",
    "content_provider",
    "content_stage",
    "is_money_page",
    "is_indexable",
    "health_status",
    "status",
  ]);

  const MINIMAL_SCHEMA = new Set(["path", "title", "status", "is_indexable", "updated_at"]);

  it("emite todas as colunas quando schema completo", () => {
    const built = buildPublicationRow({
      cluster: makeCluster(),
      citySnapshot: makeSnapshot(),
      detectedColumns: FULL_SCHEMA,
    });
    expect(Object.keys(built.row).sort()).toEqual([...FULL_SCHEMA].sort());
    expect(built.omitted).toEqual([]);
  });

  it("omite colunas ausentes em schema reduzido", () => {
    const built = buildPublicationRow({
      cluster: makeCluster(),
      citySnapshot: makeSnapshot(),
      detectedColumns: MINIMAL_SCHEMA,
    });
    expect(Object.keys(built.row).sort()).toEqual(
      ["path", "title", "status", "is_indexable"].sort()
    );
    expect(built.omitted).toContain("content");
    expect(built.omitted).toContain("health_status");
    expect(built.omitted).toContain("publication_type");
  });

  it("status sempre é 'published' para SCP elegibilidade", () => {
    const built = buildPublicationRow({
      cluster: makeCluster(),
      citySnapshot: makeSnapshot(),
      detectedColumns: FULL_SCHEMA,
    });
    expect(built.row.status).toBe("published");
  });

  it("is_indexable=false quando content fica abaixo do mínimo de palavras", () => {
    const built = buildPublicationRow({
      cluster: makeCluster({ cluster_type: "X_outro" }), // fallback genérico, texto curto
      citySnapshot: { live_ads_count: 0, below_fipe_ads_count: 0, advertisers_count: 0 },
      detectedColumns: FULL_SCHEMA,
    });
    if (!built.meetsMinContent) {
      expect(built.row.is_indexable).toBe(false);
      expect(built.row.health_status).toBe("needs_review");
    }
  });

  it("aceita Array como detectedColumns (não só Set)", () => {
    const built = buildPublicationRow({
      cluster: makeCluster(),
      citySnapshot: makeSnapshot(),
      detectedColumns: ["path", "title", "status"],
    });
    expect(Object.keys(built.row).sort()).toEqual(["path", "status", "title"]);
  });
});

describe("runBootstrapPublications — orquestração com mocks", () => {
  const FULL_SCHEMA = ["cluster_plan_id", "path", "title", "content", "city_id", "is_indexable", "status"];

  function buildDeps(overrides = {}) {
    return {
      detectColumns: vi.fn(async () => new Set(FULL_SCHEMA)),
      listEligibleClusters: vi.fn(async () => [makeCluster({ id: 1 }), makeCluster({ id: 2, path: "/carros-em/jundiai-sp", city_slug: "jundiai-sp", city_name: "Jundiaí" })]),
      getCitySnapshot: vi.fn(async () => makeSnapshot()),
      insertPublication: vi.fn(async (row) => ({ id: Math.floor(Math.random() * 10000), path: row.path })),
      markClusterPublished: vi.fn(async () => undefined),
      ...overrides,
    };
  }

  it("dry-run retorna previews sem chamar insert/markPublished", async () => {
    const logger = makeLogger();
    const deps = buildDeps();
    const result = await runBootstrapPublications({
      limit: 4,
      dryRun: true,
      log: logger.log,
      ...deps,
    });
    expect(result.ok).toBe(true);
    expect(result.dryRun).toBe(true);
    expect(result.totals.created).toBe(0);
    expect(result.previews.length).toBe(2);
    expect(deps.insertPublication).not.toHaveBeenCalled();
    expect(deps.markClusterPublished).not.toHaveBeenCalled();
  });

  it("apply persiste e promove cluster status", async () => {
    const deps = buildDeps();
    const result = await runBootstrapPublications({
      limit: 4,
      dryRun: false,
      ...deps,
    });
    expect(result.ok).toBe(true);
    expect(result.totals.created).toBe(2);
    expect(deps.insertPublication).toHaveBeenCalledTimes(2);
    expect(deps.markClusterPublished).toHaveBeenCalledTimes(2);
    expect(deps.markClusterPublished).toHaveBeenCalledWith(1);
    expect(deps.markClusterPublished).toHaveBeenCalledWith(2);
  });

  it("aborta sem persistir se colunas essenciais ausentes", async () => {
    const deps = buildDeps({
      detectColumns: vi.fn(async () => new Set(["id", "updated_at"])), // sem path/title/status
    });
    const result = await runBootstrapPublications({
      limit: 4,
      dryRun: false,
      ...deps,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("missing_essential_columns");
    expect(result.missing).toEqual(expect.arrayContaining(["path", "title", "status"]));
    expect(deps.insertPublication).not.toHaveBeenCalled();
  });

  it("apply continua processando mesmo se um cluster falha (não aborta lote)", async () => {
    let calls = 0;
    const deps = buildDeps({
      insertPublication: vi.fn(async (row) => {
        calls += 1;
        if (calls === 1) throw new Error("unique violation simulada");
        return { id: 99, path: row.path };
      }),
    });
    const result = await runBootstrapPublications({
      limit: 4,
      dryRun: false,
      ...deps,
    });
    expect(result.ok).toBe(false);
    expect(result.totals.created).toBe(1);
    expect(result.totals.failures).toBe(1);
    expect(result.failures[0].error).toMatch(/unique violation/);
  });

  it("respeita limit propagando para listEligibleClusters", async () => {
    const deps = buildDeps();
    await runBootstrapPublications({ limit: 3, dryRun: true, ...deps });
    expect(deps.listEligibleClusters).toHaveBeenCalledWith(3);
  });

  it("pula cluster sem path ou city_id", async () => {
    const deps = buildDeps({
      listEligibleClusters: vi.fn(async () => [
        makeCluster({ id: 1 }),
        makeCluster({ id: 2, path: null }),
        makeCluster({ id: 3, city_id: null }),
      ]),
    });
    const result = await runBootstrapPublications({
      limit: 10,
      dryRun: false,
      ...deps,
    });
    expect(result.totals.created).toBe(1);
    expect(result.totals.skipped).toBe(2);
  });
});
