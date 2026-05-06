#!/usr/bin/env node
/**
 * Auditoria read-only do estado real de `subscription_plans` em produção
 * antes/depois da migration 023.
 *
 * **READ-ONLY**: zero UPDATE/DELETE/INSERT. Apenas SELECTs informativos
 * + comparação contra a oferta oficial (docs/runbooks/plans-launch-
 * alignment.md). Sair com exit code 0 se tudo bate, 1 se há divergência.
 *
 * Uso:
 *   node scripts/maintenance/audit-subscription-plans.mjs
 *   node scripts/maintenance/audit-subscription-plans.mjs --json
 *
 * Saída humana (default):
 *   - schema (colunas + tipos)
 *   - linhas atuais (id, type, price, ad_limit, is_active)
 *   - constraints
 *   - diff vs oferta oficial
 *   - count de subscriptions ativas por plano (impacto humano de alterar)
 *
 * Saída --json: para integração CI/dashboards.
 */

import { pool, closeDatabasePool } from "../../src/infrastructure/database/db.js";

const EXPECTED = Object.freeze({
  "cpf-free-essential": { price: 0.0, ad_limit: 3, is_active: true },
  "cpf-premium-highlight": { is_active: false }, // descontinuado
  "cnpj-free-store": { price: 0.0, ad_limit: 10, is_active: true },
  "cnpj-store-start": { price: 79.9, ad_limit: 20, is_active: true },
  "cnpj-store-pro": { price: 149.9, ad_limit: 1000, is_active: true },
  "cnpj-evento-premium": { is_active: false }, // dormente por flag + is_active
});

function parseArgs(argv) {
  return {
    json: argv.includes("--json"),
  };
}

function log(level, line) {
  if (level === "error") console.error(line);
  else console.log(line);
}

async function fetchSchema(pg) {
  const cols = await pg.query(
    `
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name = 'subscription_plans'
    ORDER BY ordinal_position
    `
  );
  const constraints = await pg.query(
    `
    SELECT conname, pg_get_constraintdef(oid) AS def
    FROM pg_constraint
    WHERE conrelid = 'subscription_plans'::regclass
    ORDER BY conname
    `
  );
  return { columns: cols.rows, constraints: constraints.rows };
}

async function fetchPlans(pg) {
  const r = await pg.query(
    `
    SELECT
      id, name, type, price::float8 AS price, ad_limit,
      is_featured_enabled, has_store_profile, priority_level, is_active,
      validity_days, billing_model, recommended,
      created_at, updated_at
    FROM subscription_plans
    ORDER BY type, priority_level, id
    `
  );
  return r.rows;
}

async function fetchSubscriptionImpact(pg) {
  // Quantas subscriptions ativas existem por plano? Mede o impacto humano
  // de descontinuar/alterar preço. NÃO altera nada.
  try {
    const r = await pg.query(
      `
      SELECT plan_id, COUNT(*)::int AS active_subscriptions
      FROM user_subscriptions
      WHERE status = 'active'
        AND (expires_at IS NULL OR expires_at > NOW())
      GROUP BY plan_id
      ORDER BY plan_id
      `
    );
    return r.rows;
  } catch (err) {
    if (err?.code === "42P01") return []; // tabela não existe (banco muito antigo)
    throw err;
  }
}

function diffPlan(actual, expected) {
  const out = [];
  if (expected.price !== undefined && Number(actual.price) !== expected.price) {
    out.push(`price=${actual.price} (esperado ${expected.price})`);
  }
  if (expected.ad_limit !== undefined && Number(actual.ad_limit) !== expected.ad_limit) {
    out.push(`ad_limit=${actual.ad_limit} (esperado ${expected.ad_limit})`);
  }
  if (expected.is_active !== undefined && Boolean(actual.is_active) !== expected.is_active) {
    out.push(`is_active=${actual.is_active} (esperado ${expected.is_active})`);
  }
  return out;
}

function buildReport({ schema, plans, subImpact }) {
  const planById = new Map(plans.map((p) => [p.id, p]));
  const impactById = new Map(subImpact.map((r) => [r.plan_id, r.active_subscriptions]));
  const diffs = [];

  for (const [id, expected] of Object.entries(EXPECTED)) {
    const actual = planById.get(id);
    if (!actual) {
      diffs.push({ id, status: "MISSING", reasons: ["linha não existe"] });
      continue;
    }
    const reasons = diffPlan(actual, expected);
    diffs.push({
      id,
      status: reasons.length === 0 ? "OK" : "DIVERGENT",
      reasons,
      active_subscriptions: impactById.get(id) ?? 0,
    });
  }

  // Planos extras que NÃO estão na oferta oficial — apenas informativo
  const extraIds = plans
    .map((p) => p.id)
    .filter((id) => !(id in EXPECTED));

  return {
    schema_columns: schema.columns,
    schema_constraints: schema.constraints,
    plans,
    subscriptions_impact: subImpact,
    diffs,
    extra_plans_in_db: extraIds,
    aligned: diffs.every((d) => d.status === "OK"),
  };
}

function printHuman(report) {
  log("info", "═══ subscription_plans schema ═══");
  for (const c of report.schema_columns) {
    log(
      "info",
      `  ${c.column_name.padEnd(28)} ${c.data_type.padEnd(20)} nullable=${c.is_nullable} default=${c.column_default ?? "—"}`
    );
  }
  log("info", "");
  log("info", "═══ constraints ═══");
  for (const c of report.schema_constraints) {
    log("info", `  ${c.conname}: ${c.def}`);
  }
  log("info", "");
  log("info", "═══ planos atuais (todas as linhas) ═══");
  for (const p of report.plans) {
    const impact =
      report.subscriptions_impact.find((s) => s.plan_id === p.id)?.active_subscriptions ?? 0;
    log(
      "info",
      `  ${p.id.padEnd(28)} ${String(p.type).padEnd(5)} R$${String(p.price).padEnd(8)} ads=${String(p.ad_limit).padEnd(5)} active=${p.is_active} prio=${p.priority_level} subs_ativas=${impact}`
    );
  }
  log("info", "");
  log("info", "═══ diff vs oferta oficial ═══");
  for (const d of report.diffs) {
    if (d.status === "OK") {
      log("info", `  ✓ ${d.id} OK (${d.active_subscriptions ?? 0} subs ativas)`);
    } else if (d.status === "MISSING") {
      log("error", `  ✗ ${d.id} MISSING`);
    } else {
      log(
        "error",
        `  ✗ ${d.id} DIVERGENT (${d.active_subscriptions ?? 0} subs ativas):`
      );
      for (const r of d.reasons) log("error", `      - ${r}`);
    }
  }
  if (report.extra_plans_in_db.length > 0) {
    log("info", "");
    log(
      "info",
      `═══ planos extras no banco (não estão na oferta oficial) ═══`
    );
    for (const id of report.extra_plans_in_db) log("info", `  - ${id}`);
  }
  log("info", "");
  log("info", report.aligned ? "✓ ALINHADO com oferta oficial" : "✗ DIVERGENTE — rodar migration 023");
}

async function main() {
  const args = parseArgs(process.argv);
  try {
    const [schema, plans, subImpact] = await Promise.all([
      fetchSchema(pool),
      fetchPlans(pool),
      fetchSubscriptionImpact(pool),
    ]);

    const report = buildReport({ schema, plans, subImpact });

    if (args.json) {
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(report, null, 2));
    } else {
      printHuman(report);
    }

    process.exitCode = report.aligned ? 0 : 1;
  } catch (err) {
    log("error", `FATAL: ${err?.message || err}`);
    process.exitCode = 2;
  } finally {
    await closeDatabasePool().catch(() => {});
  }
}

const isMainModule =
  import.meta.url === `file://${process.argv[1]}` ||
  import.meta.url.endsWith(process.argv[1]?.replace(/\\/g, "/") || "__nope__");

if (isMainModule) {
  await main();
}

export { EXPECTED, buildReport, diffPlan };
