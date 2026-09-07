#!/usr/bin/env node
/**
 * Backfill de `ads.commercial_model` — Search Policy Engine v2.1, Fase F1 (§3.2).
 *
 * Para TODO anúncio (qualquer status) deriva o modelo comercial de
 * `ads.model` + `ads.brand` via deriveCommercialModel e grava o rótulo
 * ("Onix", "Omoda 5", "Corolla Cross"). Não derivável → NULL.
 *
 * Idempotente: só atualiza linhas cujo valor calculado difere do gravado
 * (`IS DISTINCT FROM`). Segunda execução = 0 updates. `ads.model` nunca é tocado.
 *
 * search_vector: o UPDATE dispara os triggers de search_vector (migration 064
 * acrescentou `commercial_model` à lista OF do trigger versionado; os triggers
 * legados já cobrem qualquer UPDATE) — o vetor é recalculado com o modelo
 * comercial em peso A. O script confere ao final que todo anúncio com
 * commercial_model responde a `search_vector @@ plainto_tsquery(commercial_model)`.
 *
 * Uso:
 *   node scripts/backfill-ads-commercial-model.mjs --dry-run   # contagens + lista de NULL, não grava
 *   node scripts/backfill-ads-commercial-model.mjs             # grava
 *
 * Banco alvo: DATABASE_URL (F1–F5: snapshot local; produção só pelo pipeline).
 */
import "dotenv/config";
import { fileURLToPath } from "node:url";
import { pool, closeDatabasePool } from "../src/infrastructure/database/db.js";
import { deriveCommercialModel } from "../src/shared/vehicle/commercial-model.js";

const NULL_RATE_ALERT = 0.2; // §13: acima de 20 % de NULL, parar e perguntar.
const UPDATE_BATCH = 500;

export function deriveLabel(model, brand) {
  try {
    return deriveCommercialModel(model, { brand })?.label ?? null;
  } catch {
    return null;
  }
}

/** Classifica cada anúncio: fill (NULL→valor), change (valor→outro), keep, null. */
export function planBackfill(ads) {
  const plan = { fill: [], change: [], keep: [], nulls: [], bySource: {} };
  for (const ad of ads) {
    const derived = (() => {
      try {
        return deriveCommercialModel(ad.model, { brand: ad.brand });
      } catch {
        return null;
      }
    })();
    const next = derived?.label ?? null;
    if (derived) plan.bySource[derived.source] = (plan.bySource[derived.source] || 0) + 1;
    if (next == null) {
      plan.nulls.push(ad);
      if (ad.commercial_model != null) plan.change.push({ ...ad, next });
      continue;
    }
    if (ad.commercial_model == null) plan.fill.push({ ...ad, next });
    else if (ad.commercial_model !== next) plan.change.push({ ...ad, next });
    else plan.keep.push(ad);
  }
  return plan;
}

async function ensureColumn() {
  const { rows } = await pool.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = current_schema() AND table_name = 'ads' AND column_name = 'commercial_model'`
  );
  if (!rows.length) {
    throw new Error(
      "coluna ads.commercial_model não existe — aplique a migration 064 antes (npm run db:migrate)."
    );
  }
}

async function applyUpdates(updates) {
  if (!updates.length) return 0;
  const client = await pool.connect();
  let total = 0;
  try {
    await client.query("BEGIN");
    for (let i = 0; i < updates.length; i += UPDATE_BATCH) {
      const slice = updates.slice(i, i + UPDATE_BATCH);
      const params = [];
      const tuples = slice.map((u, idx) => {
        params.push(u.id, u.next);
        return `($${idx * 2 + 1}::int, $${idx * 2 + 2}::text)`;
      });
      const res = await client.query(
        `UPDATE ads a SET commercial_model = v.cm
         FROM (VALUES ${tuples.join(",")}) AS v(id, cm)
         WHERE a.id = v.id AND a.commercial_model IS DISTINCT FROM v.cm`,
        params
      );
      total += res.rowCount || 0;
    }
    await client.query("COMMIT");
    return total;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

function pct(n, d) {
  return d ? `${((n / d) * 100).toFixed(1)} %` : "0 %";
}

export async function backfillCommercialModel({ dryRun = false } = {}) {
  const started = Date.now();
  await ensureColumn();

  const { rows: ads } = await pool.query(
    `SELECT id, status, brand, model, commercial_model FROM ads ORDER BY id ASC`
  );
  const plan = planBackfill(ads);
  const derivable = ads.length - plan.nulls.length;

  console.log(`[ads:commercial-model] anúncios: ${ads.length} (todos os status)`);
  console.log(
    `  deriváveis: ${derivable} (${pct(derivable, ads.length)})  por origem: ${JSON.stringify(plan.bySource)}`
  );
  console.log(
    `  NULL (não derivável): ${plan.nulls.length} (${pct(plan.nulls.length, ads.length)})`
  );
  console.log(
    `  a preencher: ${plan.fill.length}  a alterar: ${plan.change.length}  já corretos: ${plan.keep.length}`
  );
  if (plan.nulls.length) {
    console.log(`  lista de NULL (id | status | brand | model):`);
    for (const ad of plan.nulls)
      console.log(`    ${ad.id} | ${ad.status} | ${ad.brand} | ${ad.model}`);
  }
  if (ads.length && plan.nulls.length / ads.length > NULL_RATE_ALERT) {
    console.warn(
      `[ads:commercial-model] ATENÇÃO: ${pct(plan.nulls.length, ads.length)} de NULL > 20 % — condição de PARAR E PERGUNTAR (§13).`
    );
  }

  const updates = [...plan.fill, ...plan.change];
  if (dryRun) {
    console.log(
      `[ads:commercial-model] --dry-run: ${updates.length} updates seriam gravados. Nada gravado.`
    );
    return {
      total: ads.length,
      derivable,
      nulls: plan.nulls.length,
      updates: updates.length,
      dryRun: true,
    };
  }

  const written = await applyUpdates(updates);

  const { rows: check } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM ads
     WHERE commercial_model IS NOT NULL
       AND NOT (search_vector @@ plainto_tsquery('portuguese', commercial_model))`
  );
  console.log(
    `[ads:commercial-model] OK — ${written} linhas atualizadas em ${Date.now() - started} ms; search_vector sem o modelo comercial: ${check[0].n} (esperado 0).`
  );
  return {
    total: ads.length,
    derivable,
    nulls: plan.nulls.length,
    updates: written,
    vectorMismatch: check[0].n,
  };
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirectRun) {
  try {
    await backfillCommercialModel({ dryRun: process.argv.includes("--dry-run") });
  } catch (err) {
    console.error("[ads:commercial-model] Falha:", err?.message || err);
    process.exitCode = 1;
  } finally {
    await closeDatabasePool().catch(() => {});
  }
}
