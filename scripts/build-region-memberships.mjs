#!/usr/bin/env node
/**
 * Reconstrói `region_memberships` (vizinhança aproximada por cidade-base)
 * a partir de `cities.latitude/longitude` + UF.
 *
 * Algoritmo:
 *   - Lê todas as cidades com latitude/longitude NOT NULL.
 *   - Agrupa por UF (cidades de UFs diferentes nunca compõem a mesma região).
 *   - Para cada cidade-base, calcula Haversine para todas as outras na mesma UF.
 *   - Layer 1: distance_km <= 30, top 12 por distância ASC.
 *   - Layer 2: 30 < distance_km <= 60, top 18 por distância ASC.
 *   - DELETE memberships antigos da base (preservando a self-row, layer 0).
 *   - INSERT ON CONFLICT DO UPDATE com a nova vizinhança.
 *   - Tudo em transação por base — rerun é idempotente e seguro.
 *
 * Não roda automaticamente. Uso manual:
 *   npm run regions:build
 *
 * Pré-requisito: migration 021 aplicada e cities.latitude/longitude populados
 * (etapa separada — seed IBGE). Cidades sem lat/long são puladas em silêncio.
 *
 * Performance: O(N²) por UF. Para o Brasil (5570 municípios distribuídos em
 * 27 UFs, avg ~206 por UF), são ~42k computações por UF × 27 ≈ 1.1M ops.
 * Em JS isso roda em ~2-5s; o gargalo é o I/O do Postgres (uma transação por
 * cidade-base). Aceitável para uma execução manual ocasional.
 */
import "dotenv/config";
import { fileURLToPath } from "node:url";
import { pool, closeDatabasePool } from "../src/infrastructure/database/db.js";

const EARTH_RADIUS_KM = 6371;
const LAYER_1_MAX_KM = 30;
const LAYER_2_MAX_KM = 60;
const LAYER_1_MAX_MEMBERS = 12;
const LAYER_2_MAX_MEMBERS = 18;

function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

/**
 * Distância em km entre dois pontos lat/long pela fórmula de Haversine.
 * Para os fins desta vizinhança aproximada (raios de 30/60 km), erro
 * residual da Terra como esfera é < 0.5%, totalmente aceitável.
 */
export function haversineKm(lat1, lon1, lat2, lon2) {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

function classifyLayer(distanceKm) {
  if (distanceKm <= LAYER_1_MAX_KM) return 1;
  if (distanceKm <= LAYER_2_MAX_KM) return 2;
  return null;
}

/**
 * Para uma cidade-base, escolhe os top-K candidatos de cada layer ordenados
 * por distância ASC. Retorna array { member_city_id, distance_km, layer }.
 */
export function pickRegionMembers(baseCity, candidates) {
  const layer1 = [];
  const layer2 = [];

  for (const candidate of candidates) {
    if (candidate.id === baseCity.id) continue;
    if (candidate.state !== baseCity.state) continue;
    if (candidate.latitude == null || candidate.longitude == null) continue;

    const distance = haversineKm(
      baseCity.latitude,
      baseCity.longitude,
      candidate.latitude,
      candidate.longitude
    );
    const layer = classifyLayer(distance);
    if (!layer) continue;

    const entry = { member_city_id: candidate.id, distance_km: distance, layer };
    if (layer === 1) layer1.push(entry);
    else if (layer === 2) layer2.push(entry);
  }

  layer1.sort((a, b) => a.distance_km - b.distance_km);
  layer2.sort((a, b) => a.distance_km - b.distance_km);

  return [...layer1.slice(0, LAYER_1_MAX_MEMBERS), ...layer2.slice(0, LAYER_2_MAX_MEMBERS)];
}

async function rebuildMembershipsForBase(client, baseCity, candidatesInState) {
  const members = pickRegionMembers(baseCity, candidatesInState);

  await client.query("BEGIN");
  try {
    // Limpa apenas as memberships não-self da base (preserva self-row layer 0).
    await client.query(
      `DELETE FROM region_memberships
       WHERE base_city_id = $1 AND member_city_id != $1`,
      [baseCity.id]
    );

    for (const m of members) {
      await client.query(
        `
        INSERT INTO region_memberships (base_city_id, member_city_id, distance_km, layer)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (base_city_id, member_city_id) DO UPDATE
        SET distance_km = EXCLUDED.distance_km,
            layer = EXCLUDED.layer
        `,
        [baseCity.id, m.member_city_id, Number(m.distance_km.toFixed(2)), m.layer]
      );
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }

  return { layer1: members.filter((m) => m.layer === 1).length, layer2: members.filter((m) => m.layer === 2).length };
}

export async function buildRegionMemberships() {
  const start = Date.now();

  const { rows: cities } = await pool.query(
    `
    SELECT id, slug, name, state, latitude, longitude
    FROM cities
    WHERE latitude IS NOT NULL AND longitude IS NOT NULL
    ORDER BY state ASC, name ASC
    `
  );

  if (!cities.length) {
    console.log(
      "[regions:build] Nenhuma cidade com lat/long encontrada — rode o seed IBGE primeiro. Saindo."
    );
    return { processed: 0, byState: {} };
  }

  const byState = new Map();
  for (const city of cities) {
    const key = String(city.state || "").toUpperCase();
    if (!byState.has(key)) byState.set(key, []);
    byState.get(key).push(city);
  }

  const summary = {};
  let totalProcessed = 0;
  let totalLayer1 = 0;
  let totalLayer2 = 0;

  const client = await pool.connect();
  try {
    for (const [state, citiesInState] of byState) {
      let stateLayer1 = 0;
      let stateLayer2 = 0;

      for (const baseCity of citiesInState) {
        const stats = await rebuildMembershipsForBase(client, baseCity, citiesInState);
        stateLayer1 += stats.layer1;
        stateLayer2 += stats.layer2;
        totalProcessed += 1;
      }

      summary[state] = {
        cities: citiesInState.length,
        layer1Total: stateLayer1,
        layer2Total: stateLayer2,
      };
      totalLayer1 += stateLayer1;
      totalLayer2 += stateLayer2;

      console.log(
        `[regions:build] ${state}: ${citiesInState.length} cidades, ${stateLayer1} memberships layer 1, ${stateLayer2} layer 2`
      );
    }
  } finally {
    client.release();
  }

  const elapsedSec = ((Date.now() - start) / 1000).toFixed(1);
  console.log(
    `[regions:build] OK — ${totalProcessed} cidades-base processadas, ${totalLayer1} memberships layer 1 + ${totalLayer2} layer 2 em ${elapsedSec}s.`
  );

  return { processed: totalProcessed, byState: summary };
}

// Auto-execução quando rodado via `node scripts/build-region-memberships.mjs`.
// Em testes, o arquivo é importado por nome — `pickRegionMembers` e
// `haversineKm` são exportados para teste unitário sem tocar Postgres.
const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isDirectRun) {
  try {
    await buildRegionMemberships();
  } catch (err) {
    console.error("[regions:build] Falha:", err?.message || err);
    process.exitCode = 1;
  } finally {
    await closeDatabasePool().catch(() => {});
  }
}
