#!/usr/bin/env node
/**
 * Bootstrap manual de `seo_cluster_plans`.
 *
 * **PADRÃO É DRY-RUN.** Para persistir, é obrigatório passar `--yes` na
 * linha de comando. Se nem `--yes` nem `--dry-run` forem passados, o
 * script ainda assim NÃO escreve no banco — registra que está em dry-run
 * e segue.
 *
 * Por que existe?
 * - Diagnóstico em docs/runbooks/cluster-planner-bootstrap.md §1:
 *   `runClusterPlannerEngine` chama `buildTopCitiesClusterPlans` (em memória)
 *   mas `persistTopCityClusterPlans` está órfão. `seo_cluster_plans` nunca
 *   é populada → todos os sitemaps territoriais retornam vazio em prod.
 * - Opção 2 do runbook (recomendada): script standalone que constrói +
 *   transforma paths conforme Fase 1 dos canonicals + persiste manualmente,
 *   sob controle do operador. Permite dry-run, --limit, e auditoria por
 *   path antes de cada batch.
 *
 * Uso:
 *
 *   # Dry-run (default; nenhuma escrita):
 *   node scripts/seo/bootstrap-cluster-plans.mjs --dry-run --limit=3
 *   node scripts/seo/bootstrap-cluster-plans.mjs                 # ainda dry-run
 *
 *   # Persistência (exige --yes EXPLICITAMENTE):
 *   node scripts/seo/bootstrap-cluster-plans.mjs --yes --limit=3
 *
 * Comportamento de erro:
 * - Pré-valida TODOS os clusters via transformer ANTES de persistir.
 * - Se algum cluster lança erro de transformação, o script aborta SEM
 *   persistir lote parcial (fail-fast).
 * - `upsertClusterPlan` é UPSERT por `path` — re-rodar com --yes é
 *   idempotente, sem duplicar.
 */

import "dotenv/config";

import { buildTopCitiesClusterPlans } from "../../src/modules/seo/planner/cluster-planner.service.js";
import { upsertClusterPlan } from "../../src/modules/seo/planner/cluster-plan.repository.js";
import { transformClusterPlanToCanonicalPath } from "../../src/modules/seo/planner/cluster-plan-canonical-transform.js";
import { closeDatabasePool } from "../../src/infrastructure/database/db.js";

const DEFAULT_LIMIT = 5;
const SAMPLE_LOG_MAX = 10;

export function parseArgs(argv) {
  const args = {
    limit: DEFAULT_LIMIT,
    yes: false,
    dryRunFlagSeen: false,
  };

  for (const raw of argv.slice(2)) {
    if (raw === "--yes") {
      args.yes = true;
    } else if (raw === "--dry-run") {
      args.dryRunFlagSeen = true;
    } else if (raw.startsWith("--limit=")) {
      const n = Number(raw.slice("--limit=".length));
      if (Number.isFinite(n) && n > 0) {
        args.limit = Math.floor(n);
      }
    }
    // Outros flags são ignorados silenciosamente.
  }

  // Persistência requer --yes EXPLÍCITO. Sem --yes (mesmo sem --dry-run),
  // assumimos dry-run para falhar fechado por default.
  args.dryRun = !args.yes;

  return args;
}

function defaultLog(level, message, meta) {
  const prefix = "[bootstrap-cluster-plans]";
  const line = meta !== undefined ? `${prefix} ${message} ${JSON.stringify(meta)}` : `${prefix} ${message}`;
  if (level === "error") {
    // eslint-disable-next-line no-console
    console.error(line);
  } else {
    // eslint-disable-next-line no-console
    console.log(line);
  }
}

/**
 * Lógica core extraída para testes — recebe deps via injeção.
 *
 * @param {object} opts
 * @param {number} opts.limit
 * @param {boolean} opts.dryRun
 * @param {(limit: number) => Promise<Array>} opts.build
 * @param {(args: object) => Promise<unknown>} opts.persist
 * @param {(level: string, message: string, meta?: unknown) => void} [opts.log]
 * @param {(cluster: object, city: object) => string|null} [opts.transform]
 */
export async function runBootstrap({
  limit,
  dryRun,
  build,
  persist,
  log = defaultLog,
  transform = transformClusterPlanToCanonicalPath,
}) {
  log("info", "iniciando", { limit, dryRun });

  if (dryRun) {
    log("info", "DRY-RUN: nenhuma escrita ao banco. Use --yes para persistir.");
  } else {
    log("info", "MODO PERSISTÊNCIA: --yes presente. Vai escrever em seo_cluster_plans.");
  }

  const plans = await build(limit);
  const totalCities = Array.isArray(plans) ? plans.length : 0;
  log("info", "plans construídos em memória", { totalCities });

  let totalGenerated = 0;
  let totalTransformed = 0;
  let totalSkipped = 0;
  let totalToPersist = 0;
  let totalPersisted = 0;
  const samplePaths = [];
  const transformErrors = [];
  const ready = [];

  // Fase 1: pré-validar TUDO (fail-fast antes de qualquer escrita).
  for (const plan of plans || []) {
    const city = plan?.city;
    const clusters = Array.isArray(plan?.clusters) ? plan.clusters : [];
    for (const cluster of clusters) {
      totalGenerated += 1;
      try {
        const transformedPath = transform(cluster, city);
        if (transformedPath === null) {
          totalSkipped += 1;
          continue;
        }
        totalTransformed += 1;
        if (samplePaths.length < SAMPLE_LOG_MAX) {
          samplePaths.push({
            cluster_type: cluster.cluster_type,
            originalPath: cluster.path,
            transformedPath,
            citySlug: city?.slug,
          });
        }
        ready.push({ city, cluster, transformedPath });
        totalToPersist += 1;
      } catch (err) {
        transformErrors.push({
          cluster_type: cluster?.cluster_type,
          city: city?.slug,
          error: err?.message || String(err),
        });
      }
    }
  }

  log("info", "transformação concluída", {
    totalGenerated,
    totalTransformed,
    totalSkipped,
    totalToPersist,
    totalErrors: transformErrors.length,
  });

  for (const sp of samplePaths) {
    log("info", `sample: ${sp.cluster_type} ${sp.originalPath} → ${sp.transformedPath}`);
  }

  if (transformErrors.length > 0) {
    log("error", `transform errors: ${transformErrors.length}`);
    for (const e of transformErrors.slice(0, SAMPLE_LOG_MAX)) {
      log("error", `  [${e.cluster_type}/${e.city}] ${e.error}`);
    }
    log(
      "error",
      "fail-fast: ABORTANDO antes de qualquer escrita. Lote parcial NÃO persistido."
    );
    return {
      ok: false,
      reason: "transform_errors",
      totals: {
        totalCities,
        totalGenerated,
        totalTransformed,
        totalSkipped,
        totalToPersist,
        totalPersisted,
      },
      transformErrors,
    };
  }

  if (dryRun) {
    log(
      "info",
      `DRY-RUN concluído. ${totalToPersist} plans seriam persistidos. Re-rodar com --yes para persistir.`
    );
    return {
      ok: true,
      dryRun: true,
      totals: {
        totalCities,
        totalGenerated,
        totalTransformed,
        totalSkipped,
        totalToPersist,
        totalPersisted: 0,
      },
    };
  }

  log("info", `persistindo ${ready.length} plans em seo_cluster_plans`);
  for (const { city, cluster, transformedPath } of ready) {
    await persist({
      cityId: city.city_id,
      clusterType: cluster.cluster_type,
      path: transformedPath,
      brand: cluster.brand || null,
      model: cluster.model || null,
      moneyPage: cluster.money_page || false,
      priority: cluster.priority || 0,
      status: "planned",
      stage: city.stage || "discovery",
      payload: cluster,
    });
    totalPersisted += 1;
  }

  log("info", "persistência concluída", { totalPersisted });

  return {
    ok: true,
    dryRun: false,
    totals: {
      totalCities,
      totalGenerated,
      totalTransformed,
      totalSkipped,
      totalToPersist,
      totalPersisted,
    },
  };
}

// Entry-point CLI — só roda quando o arquivo é invocado diretamente, não
// quando importado por testes (vitest importa pra exportar runBootstrap).
const isMainModule = import.meta.url === `file://${process.argv[1]}` ||
  import.meta.url.endsWith(process.argv[1]?.replace(/\\/g, "/") || "__nope__");

if (isMainModule) {
  const args = parseArgs(process.argv);
  try {
    const result = await runBootstrap({
      limit: args.limit,
      dryRun: args.dryRun,
      build: buildTopCitiesClusterPlans,
      persist: upsertClusterPlan,
    });
    process.exitCode = result.ok ? 0 : 1;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[bootstrap-cluster-plans] FATAL:", err?.message || err);
    process.exitCode = 1;
  } finally {
    await closeDatabasePool().catch(() => {});
  }
}
