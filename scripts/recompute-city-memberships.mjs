#!/usr/bin/env node
/**
 * Recomputa `region_memberships` de UMA cidade (F1 §3.1) — mesmo caminho do
 * worker `cities.geo-changed`, para uso manual e testes.
 *
 * Uso:
 *   node scripts/recompute-city-memberships.mjs <cityId|slug> [--queue]
 *
 * Sem `--queue`, executa inline (não depende de Redis). Com `--queue`, passa
 * pelo producer (enfileira se houver Redis; senão, inline).
 */
import "dotenv/config";
import { pool, closeDatabasePool } from "../src/infrastructure/database/db.js";
import { recomputeCityMemberships } from "../src/modules/regions/region-memberships.builder.js";
import {
  enqueueCityGeoChanged,
  closeCityGeoChangedQueue,
} from "../src/queues/city-geo-changed.queue.js";

const arg = process.argv.slice(2).find((a) => !a.startsWith("--"));
const useQueue = process.argv.includes("--queue");

try {
  if (!arg) throw new Error("informe cityId ou slug");
  let cityId = Number(arg);
  if (!Number.isFinite(cityId)) {
    const { rows } = await pool.query(`SELECT id FROM cities WHERE slug = $1`, [arg]);
    if (!rows.length) throw new Error(`cidade não encontrada: ${arg}`);
    cityId = Number(rows[0].id);
  }
  const result = useQueue
    ? await enqueueCityGeoChanged(cityId)
    : await recomputeCityMemberships(pool, cityId);
  console.log(`[regions:recompute] ${JSON.stringify(result)}`);
} catch (err) {
  console.error("[regions:recompute] Falha:", err?.message || err);
  process.exitCode = 1;
} finally {
  await closeCityGeoChangedQueue().catch(() => {});
  await closeDatabasePool().catch(() => {});
}
