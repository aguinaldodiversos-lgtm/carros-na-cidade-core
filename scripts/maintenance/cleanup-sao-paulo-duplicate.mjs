#!/usr/bin/env node
/**
 * Cleanup controlado da duplicidade de São Paulo (cities.id=1 quebrado
 * vs cities.id=5278 canônico).
 *
 * **PADRÃO É DRY-RUN.** Persistência exige `--scenario=<X>` E `--yes`
 * EXPLICITAMENTE. Sem `--scenario`, aborta com usage. Sem `--yes`,
 * imprime os SQLs que SERIAM executados.
 *
 * Cenários suportados (ordem de chegada):
 *
 *   --scenario=archive-test-data
 *     Arquiva ads de teste (id IN (9, 80)) que ainda estão `active` e
 *     com `city_id=1` e batem com classificação `parece_teste`. NÃO mexe
 *     em cities, NÃO mexe em events paid, NÃO mexe em region_memberships.
 *     Aborta com `--yes` se houver evento paid ou region_memberships
 *     referenciando city_id=1 — mesmo neste cenário "leve", referências
 *     fortes exigem decisão manual (classificação D do audit).
 *
 *   (Cenários adicionais como `merge-to-canonical`, `inactivate-broken-city`
 *    serão acrescentados em PRs próprios após audit confirmar segurança.)
 *
 * Uso:
 *
 *   # Dry-run obrigatório (default):
 *   node scripts/maintenance/cleanup-sao-paulo-duplicate.mjs --scenario=archive-test-data
 *
 *   # Execução real (após auditoria + revisão):
 *   node scripts/maintenance/cleanup-sao-paulo-duplicate.mjs --scenario=archive-test-data --yes
 *
 * Travas:
 *   - Não faz DELETE físico em nenhuma tabela.
 *   - Não altera cities.id=5278.
 *   - Não tenta UPDATE slug='sao-paulo-sp' WHERE id=1 (quebra UNIQUE).
 *   - Re-valida invariantes (slug atual de id=1, ids dos ads esperados,
 *     ausência de events paid, ausência de region_memberships) ANTES
 *     de qualquer UPDATE em transação.
 *   - Em erro dentro da transação, ROLLBACK automático.
 */

import { pool, closeDatabasePool } from "../../src/infrastructure/database/db.js";

const BROKEN_ID = 1;
const CANONICAL_ID = 5278;
const EXPECTED_TEST_AD_IDS = [9, 80];
const SUPPORTED_SCENARIOS = new Set(["archive-test-data"]);

export function parseArgs(argv) {
  const args = { scenario: null, yes: false };
  for (const raw of argv.slice(2)) {
    if (raw === "--yes") args.yes = true;
    else if (raw === "--dry-run") {
      // explicit dry-run flag is just informational; default já é dry-run
    } else if (raw.startsWith("--scenario=")) {
      args.scenario = raw.slice("--scenario=".length).trim();
    }
  }
  args.dryRun = !args.yes;
  return args;
}

function defaultLog(level, message, meta) {
  const prefix = "[cleanup-sao-paulo]";
  const line = meta !== undefined ? `${prefix} ${message} ${JSON.stringify(meta)}` : `${prefix} ${message}`;
  if (level === "error") {
    // eslint-disable-next-line no-console
    console.error(line);
  } else {
    // eslint-disable-next-line no-console
    console.log(line);
  }
}

function usage() {
  return [
    "Uso:",
    "  node scripts/maintenance/cleanup-sao-paulo-duplicate.mjs --scenario=<X> [--yes]",
    "",
    "Cenários suportados:",
    `  ${[...SUPPORTED_SCENARIOS].join(", ")}`,
    "",
    "Sem --yes, executa em dry-run (padrão seguro).",
  ].join("\n");
}

/**
 * Re-valida invariantes ANTES de tocar no banco. Retorna `{ ok, reasons }`.
 * Mesmo em --yes, se uma invariante falhar, abortamos.
 */
export async function validatePreconditions({ pg, scenario, log = defaultLog }) {
  const reasons = [];

  // 1. id=1 ainda tem slug='sæo-paulo'
  const broken = await pg.query(
    `SELECT id, name, slug, state, is_active FROM cities WHERE id = $1`,
    [BROKEN_ID]
  );
  if (broken.rows.length === 0) {
    reasons.push(`cities.id=${BROKEN_ID} não existe — nada a fazer`);
  } else if (broken.rows[0].slug !== "sæo-paulo") {
    reasons.push(
      `cities.id=${BROKEN_ID} já não tem slug='sæo-paulo' (atual=${JSON.stringify(broken.rows[0].slug)})`
    );
  }

  // 2. id=5278 ainda tem slug='sao-paulo-sp'
  const canonical = await pg.query(
    `SELECT id, name, slug, state FROM cities WHERE id = $1`,
    [CANONICAL_ID]
  );
  if (canonical.rows.length === 0) {
    reasons.push(`cities.id=${CANONICAL_ID} (canônico) não existe`);
  } else if (canonical.rows[0].slug !== "sao-paulo-sp") {
    reasons.push(
      `cities.id=${CANONICAL_ID} não tem slug='sao-paulo-sp' (atual=${JSON.stringify(canonical.rows[0].slug)})`
    );
  }

  // 3. archive-test-data: confirmar que os ads esperados existem,
  //    ainda estão active e com city_id=1.
  if (scenario === "archive-test-data") {
    const ads = await pg.query(
      `
      SELECT id, title, status, city_id
      FROM ads
      WHERE id = ANY($1::int[])
      ORDER BY id
      `,
      [EXPECTED_TEST_AD_IDS]
    );
    const found = new Set(ads.rows.map((r) => r.id));
    for (const expected of EXPECTED_TEST_AD_IDS) {
      if (!found.has(expected)) {
        reasons.push(`ad esperado id=${expected} não encontrado`);
        continue;
      }
      const row = ads.rows.find((r) => r.id === expected);
      if (row.status !== "active") {
        reasons.push(`ad id=${expected} não está active (status=${row.status}) — pode já ter sido arquivado`);
      }
      if (row.city_id !== BROKEN_ID) {
        reasons.push(`ad id=${expected} não está em city_id=${BROKEN_ID} (atual=${row.city_id})`);
      }
    }

    // 4. Bloqueio de segurança: não permitir --yes se houver evento sensível
    //    ou region_memberships apontando para id=1. (Mesmo no cenário "leve",
    //    refs fortes são sinal de classificação D — exigem decisão manual.)
    const events = await safeSelect(
      pg,
      `
      SELECT COUNT(*)::int AS n
      FROM events
      WHERE city_id = $1
        AND (
          LOWER(COALESCE(status, '')) = 'paid'
          OR LOWER(COALESCE(payment_status, '')) = 'paid'
          OR COALESCE(price, 0) > 0
        )
      `,
      [BROKEN_ID]
    );
    if (events.ok && events.rows[0]?.n > 0) {
      reasons.push(
        `events sensíveis em city_id=${BROKEN_ID}: ${events.rows[0].n} — exige decisão manual (cenário D)`
      );
    }

    const rms = await safeSelect(
      pg,
      `
      SELECT COUNT(*)::int AS n
      FROM region_memberships
      WHERE base_city_id = $1 OR member_city_id = $1
      `,
      [BROKEN_ID]
    );
    if (rms.ok && rms.rows[0]?.n > 0) {
      reasons.push(
        `region_memberships referenciando city_id=${BROKEN_ID}: ${rms.rows[0].n} — exige cenário próprio`
      );
    }
  }

  return { ok: reasons.length === 0, reasons };
}

async function safeSelect(pg, sql, params) {
  try {
    const result = await pg.query(sql, params);
    return { ok: true, rows: result.rows };
  } catch (error) {
    if (error?.code === "42P01" || error?.code === "42703") {
      return { ok: false, missing: true };
    }
    throw error;
  }
}

/**
 * Constrói os SQLs do cenário escolhido. Retorna lista de
 * `{ description, sql, params }` que o caller exibe (dry-run) ou
 * executa em transação (--yes).
 */
export function planScenario(scenario) {
  if (scenario === "archive-test-data") {
    return [
      {
        description: `arquivar ads de teste id IN (${EXPECTED_TEST_AD_IDS.join(", ")}) (atualmente active, city_id=${BROKEN_ID})`,
        sql: `
          UPDATE ads
          SET status = 'archived',
              updated_at = NOW()
          WHERE id = ANY($1::int[])
            AND city_id = $2
            AND status = 'active'
        `,
        params: [EXPECTED_TEST_AD_IDS, BROKEN_ID],
      },
    ];
  }
  throw new Error(`cenário não suportado: ${JSON.stringify(scenario)}`);
}

/**
 * Lógica core — recebe deps via injeção pra ser testável sem banco real.
 *
 * @param {object} opts
 * @param {string} opts.scenario
 * @param {boolean} opts.dryRun
 * @param {object} [opts.pg] — pool ou client; default usa o pool do db.js
 * @param {(level: string, message: string, meta?: unknown) => void} [opts.log]
 */
export async function runCleanup({ scenario, dryRun, pg = pool, log = defaultLog }) {
  log("info", "iniciando cleanup", { scenario, dryRun });

  if (!scenario) {
    log("error", "--scenario é obrigatório. Abortando.");
    log("error", usage());
    return { ok: false, reason: "missing_scenario" };
  }

  if (!SUPPORTED_SCENARIOS.has(scenario)) {
    log("error", `cenário desconhecido: ${JSON.stringify(scenario)}`);
    log("error", usage());
    return { ok: false, reason: "unknown_scenario", scenario };
  }

  if (dryRun) {
    log("info", "DRY-RUN: nenhuma escrita ao banco. Use --yes para executar.");
  } else {
    log("info", "MODO PERSISTÊNCIA: --yes presente. Vai aplicar mudanças.");
  }

  // Pré-condições — sempre, mesmo em dry-run, pra dar feedback útil
  // antes de imprimir SQL que de qualquer jeito seria abortado.
  const pre = await validatePreconditions({ pg, scenario, log });
  if (!pre.ok) {
    log("error", "pré-condições FALHARAM — ABORTANDO. Motivos:");
    for (const r of pre.reasons) log("error", `  - ${r}`);
    return { ok: false, reason: "preconditions_failed", reasons: pre.reasons, dryRun };
  }
  log("info", "pré-condições OK");

  const steps = planScenario(scenario);
  for (const step of steps) {
    log("info", `step: ${step.description}`);
    log("info", `  SQL:\n    ${step.sql.trim().replace(/\n\s*/g, "\n    ")}`);
    log("info", `  params: ${JSON.stringify(step.params)}`);
  }

  if (dryRun) {
    log("info", "DRY-RUN concluído. Nenhuma alteração aplicada.");
    return { ok: true, dryRun: true, scenario, steps: steps.length };
  }

  // Persistência: BEGIN, executar todos os steps, COMMIT. Em erro,
  // ROLLBACK e retornar.
  const client = await pg.connect();
  try {
    await client.query("BEGIN");
    log("info", "BEGIN");

    let totalAffected = 0;
    for (const step of steps) {
      const result = await client.query(step.sql, step.params);
      log("info", `  affected rows: ${result.rowCount}`, { description: step.description });
      totalAffected += result.rowCount || 0;
    }

    await client.query("COMMIT");
    log("info", `COMMIT — total de linhas afetadas: ${totalAffected}`);

    return { ok: true, dryRun: false, scenario, totalAffected };
  } catch (err) {
    log("error", `erro durante a transação: ${err?.message || err}`);
    try {
      await client.query("ROLLBACK");
      log("info", "ROLLBACK aplicado");
    } catch (rbErr) {
      log("error", `ROLLBACK também falhou: ${rbErr?.message || rbErr}`);
    }
    return { ok: false, reason: "transaction_error", error: err?.message || String(err) };
  } finally {
    client.release();
  }
}

const isMainModule =
  import.meta.url === `file://${process.argv[1]}` ||
  import.meta.url.endsWith(process.argv[1]?.replace(/\\/g, "/") || "__nope__");

if (isMainModule) {
  const args = parseArgs(process.argv);
  try {
    const result = await runCleanup({ scenario: args.scenario, dryRun: args.dryRun });
    process.exitCode = result.ok ? 0 : 1;
  } catch (err) {
    defaultLog("error", `FATAL: ${err?.message || err}`);
    process.exitCode = 1;
  } finally {
    await closeDatabasePool().catch(() => {});
  }
}
