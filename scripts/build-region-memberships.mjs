#!/usr/bin/env node
/**
 * Reconstrói `region_memberships` — Search Policy Engine v2.1, Fase F1 (§3.1).
 *
 * O que muda em relação ao build antigo (até 65bc2e95):
 *   - SEM filtro de UF: Bragança Paulista-SP ↔ Extrema-MG (25,4 km) passa a existir.
 *   - Alcance 150 km (era 100), sem tetos de vizinhas por camada.
 *   - `layer` 1–3 continua EXATAMENTE pela regra antiga (mesma UF, 30/60/100 km,
 *     top 12/18/40) para a página regional (`layer <= 2`) não mudar; toda linha
 *     nova recebe `layer = 4`. Ver src/modules/regions/region-memberships.builder.js.
 *   - Self-row (layer 0, 0 km) gerada para TODA cidade, com ou sem coordenadas.
 *   - Execução: conjunto novo em tabela TEMPORÁRIA → backup da tabela atual em
 *     tabela real → DELETE + INSERT numa única transação. A tabela nunca fica
 *     vazia para leitores. Superconjunto das linhas atuais garantido por
 *     construção (linhas antigas ausentes são reinseridas; contagem menor aborta).
 *
 * Uso:
 *   node scripts/build-region-memberships.mjs --dry-run     # só contagens, não grava
 *   node scripts/build-region-memberships.mjs               # grava (com backup)
 *   node scripts/build-region-memberships.mjs --backup-table=region_memberships_backup_prod_f1
 *
 * Rollback: o script imprime o SQL exato (DELETE + INSERT ... FROM <backup>).
 *
 * Banco alvo: DATABASE_URL (via src/infrastructure/database/db.js). Em F1–F5 a
 * execução local é contra o snapshot (porta 5434); em produção, pelo pipeline
 * de deploy após aprovação.
 *
 * Exports mantidos para os testes históricos (tests/regions/region-builder-unit.test.js):
 * `haversineKm`, `pickRegionMembers` (visão legada: mesma UF, camadas 1–3),
 * `parseUfFilter` (aceito e ignorado: o build agora é sempre nacional — a
 * vizinhança cruza UF por definição).
 */
import "dotenv/config";
import { fileURLToPath } from "node:url";
import { pool, closeDatabasePool } from "../src/infrastructure/database/db.js";
import {
  applyMemberships,
  buildAllMemberships,
  defaultBackupTableName,
  findMissingFromSuperset,
  haversineKm,
  loadCities,
  loadExistingMembershipKeys,
  MAX_DISTANCE_KM,
  pickLegacyRegionMembers,
  rollbackSql,
  summarizeMemberships,
} from "../src/modules/regions/region-memberships.builder.js";

export { haversineKm };

/** Contrato legado (mesma UF, camadas 1–3 com tetos). */
export function pickRegionMembers(baseCity, candidates) {
  return pickLegacyRegionMembers(baseCity, candidates);
}

/**
 * Mantido por compatibilidade de CLI (`--uf=SP,MG` / `BUILD_UF`). O valor é
 * parseado e IGNORADO com aviso: o build nacional é obrigatório para que as
 * linhas cross-UF existam dos dois lados da fronteira.
 */
export function parseUfFilter(argv = process.argv, env = process.env) {
  const argRaw = argv.find((a) => typeof a === "string" && a.startsWith("--uf="));
  const raw = argRaw ? argRaw.slice("--uf=".length) : env.BUILD_UF || "";
  const trimmed = String(raw || "").trim();
  if (!trimmed || trimmed.toUpperCase() === "ALL") return null;
  const set = new Set(
    trimmed
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter((s) => /^[A-Z]{2}$/.test(s))
  );
  return set.size ? set : null;
}

function parseArgs(argv) {
  const flags = new Set(argv.filter((a) => a.startsWith("--") && !a.includes("=")));
  const kv = Object.fromEntries(
    argv.filter((a) => a.startsWith("--") && a.includes("=")).map((a) => a.slice(2).split("="))
  );
  return {
    dryRun: flags.has("--dry-run"),
    backupTable: kv["backup-table"] || null,
  };
}

function fmt(n) {
  return Number(n).toLocaleString("pt-BR");
}

function printSummary(label, summary) {
  console.log(`[regions:build] ${label}:`);
  console.log(
    `  total: ${fmt(summary.total)} (self: ${fmt(summary.self)}, cross-UF: ${fmt(summary.crossUf)})`
  );
  console.log(
    `  por layer: ${Object.entries(summary.byLayer)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([l, n]) => `${l}=${fmt(n)}`)
      .join("  ")}`
  );
  console.log(
    `  por faixa (km): ${Object.entries(summary.byBand)
      .map(([b, n]) => `${b}=${fmt(n)}`)
      .join("  ")}`
  );
}

export async function buildRegionMemberships({ dryRun = false, backupTable = null } = {}) {
  const started = Date.now();
  if (parseUfFilter()) {
    console.warn(
      "[regions:build] --uf/BUILD_UF ignorado: o build é nacional (pares cruzam UF por definição)."
    );
  }

  const cities = await loadCities(pool);
  if (!cities.length) {
    console.log("[regions:build] Nenhuma cidade cadastrada. Saindo.");
    return { processed: 0 };
  }

  const existingKeys = await loadExistingMembershipKeys(pool);
  const { rows, stats } = buildAllMemberships(cities);
  const computeMs = Date.now() - started;

  const currentSummary = await summarizeCurrent(cities);
  const nextSummary = summarizeMemberships(rows, cities);
  const missing = findMissingFromSuperset(existingKeys, rows);

  console.log(
    `[regions:build] ${fmt(stats.cities)} cidades (${fmt(stats.basesWithCoords)} com coords, ${fmt(stats.basesWithoutCoords)} sem) → ${fmt(rows.length)} linhas calculadas em ${computeMs} ms (alcance ${MAX_DISTANCE_KM} km).`
  );
  printSummary("ATUAL (tabela)", currentSummary);
  printSummary("NOVO (calculado)", nextSummary);
  console.log(
    `[regions:build] superconjunto: ${fmt(existingKeys.size)} linhas atuais, ${fmt(missing.length)} ausentes no novo conjunto${
      missing.length ? ` (serão preservadas do backup; ex.: ${missing.slice(0, 5).join(", ")})` : ""
    }.`
  );

  if (dryRun) {
    console.log("[regions:build] --dry-run: nada gravado.");
    return { processed: stats.cities, rows: rows.length, dryRun: true, missing: missing.length };
  }

  const backup = backupTable || defaultBackupTableName();
  const result = await applyMemberships(pool, rows, { backupTable: backup });
  console.log(
    `[regions:build] OK — ${fmt(result.before)} → ${fmt(result.after)} linhas (${fmt(result.reinsertedFromBackup)} reinseridas do backup) em ${result.elapsedMs} ms; total ${Date.now() - started} ms.`
  );
  console.log(`[regions:build] backup: ${result.backupTable}`);
  console.log(`[regions:build] rollback:\n${rollbackSql(result.backupTable)}`);
  return { processed: stats.cities, ...result };
}

async function summarizeCurrent(cities) {
  const { rows } = await pool.query(
    `SELECT base_city_id, member_city_id, distance_km, layer FROM region_memberships`
  );
  return summarizeMemberships(
    rows.map((r) => ({
      base_city_id: Number(r.base_city_id),
      member_city_id: Number(r.member_city_id),
      distance_km: Number(r.distance_km ?? 0),
      layer: Number(r.layer),
    })),
    cities
  );
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isDirectRun) {
  try {
    await buildRegionMemberships(parseArgs(process.argv.slice(2)));
  } catch (err) {
    console.error("[regions:build] Falha:", err?.message || err);
    process.exitCode = 1;
  } finally {
    await closeDatabasePool().catch(() => {});
  }
}
