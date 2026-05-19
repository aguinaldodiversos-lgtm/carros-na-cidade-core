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

/**
 * Limites de cidades por região, configuráveis via env vars.
 *
 * Defaults (12 + 18 = 30 vizinhos) calibrados para Brasil típico em
 * raios de 30/60 km. Override no Render (ou .env local) sem precisar
 * mexer no código:
 *
 *   REGIONAL_LAYER1_MAX_MEMBERS=20    # vizinhos ≤30 km
 *   REGIONAL_LAYER2_MAX_MEMBERS=30    # vizinhos 30-60 km
 *
 * Quando admin tiver UI no portal para isso, mover para `platform_settings`
 * (mesmo padrão de `regional.radius_km`).
 */
function parsePositiveInt(raw, fallback) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.floor(parsed);
}
const LAYER_1_MAX_MEMBERS = parsePositiveInt(process.env.REGIONAL_LAYER1_MAX_MEMBERS, 12);
const LAYER_2_MAX_MEMBERS = parsePositiveInt(process.env.REGIONAL_LAYER2_MAX_MEMBERS, 18);

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

/**
 * Filtro de UFs por arg `--uf=SP,MG` ou env `BUILD_UF=SP,MG`.
 * Retorna `Set<string>` de UFs upper-case, ou `null` se "todas".
 *
 * Por que existe?
 *   Render Postgres free-tier corta conexões longas no meio do build. Para
 *   recuperação, é prático rodar em batches de 3-5 UFs com conexão fresca
 *   a cada vez. Idempotência preservada (ON CONFLICT DO UPDATE no INSERT).
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

const CONNECTION_DROP_HINTS = [
  "connection terminated",
  "econnreset",
  "client has encountered a connection error",
  "terminating connection",
  "server closed the connection unexpectedly",
  "read econnreset",
  "socket hang up",
];

function isConnectionDrop(err) {
  const msg = String(err?.message || err || "").toLowerCase();
  return CONNECTION_DROP_HINTS.some((p) => msg.includes(p));
}

/**
 * Processa uma UF inteira numa conexão dedicada, com retry em connection drop.
 *
 * Por que conexão por UF?
 *   Antes, o script segurava um único `client` durante todo o loop de UFs.
 *   Em ambientes com idle reaper agressivo (Render free-tier Postgres) ou
 *   latência transcontinental, qualquer drop derrubava o build inteiro
 *   sem chance de retomar. Conexão fresca por UF reduz a janela de
 *   exposição e isola a falha — UFs já gravadas ficam (idempotência), e
 *   a UF que caiu é retentada até MAX_ATTEMPTS.
 *
 * Handler `client.on('error', ...)`:
 *   pg emite `error` async quando o socket cai entre queries. Sem handler,
 *   Node derruba o processo com Unhandled 'error' event. Aqui nós só
 *   logamos — o erro real vai bubble pela próxima `client.query()` e
 *   cair no catch do retry-loop.
 */
async function processStateWithRetry(state, citiesInState, { maxAttempts = 3 } = {}) {
  let attempt = 0;
  let lastErr = null;

  while (attempt < maxAttempts) {
    attempt += 1;
    const client = await pool.connect();
    client.on("error", (err) => {
      console.warn(`[regions:build] [${state}] client error silenciado: ${err?.message || err}`);
    });

    let stateLayer1 = 0;
    let stateLayer2 = 0;
    let released = false;

    try {
      for (const baseCity of citiesInState) {
        const stats = await rebuildMembershipsForBase(client, baseCity, citiesInState);
        stateLayer1 += stats.layer1;
        stateLayer2 += stats.layer2;
      }
      client.release();
      released = true;
      return { stateLayer1, stateLayer2, attempts: attempt };
    } catch (err) {
      lastErr = err;
      // Em connection drop, devolver o client com erro para o pool descartá-lo.
      // `release(err)` sinaliza ao pool que esta conexão está corrompida.
      if (!released) {
        try {
          client.release(err);
          released = true;
        } catch {}
      }

      if (!isConnectionDrop(err)) throw err;
      if (attempt >= maxAttempts) break;

      const waitMs = Math.min(8000, 1000 * 3 ** (attempt - 1));
      console.warn(
        `[regions:build] [${state}] connection drop na tentativa ${attempt}/${maxAttempts}: ${err?.message}. Retentando em ${waitMs}ms…`
      );
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }

  throw lastErr || new Error(`[regions:build] [${state}] esgotou ${maxAttempts} tentativas`);
}

export async function buildRegionMemberships({ ufFilter } = {}) {
  const start = Date.now();
  const filter = ufFilter === undefined ? parseUfFilter() : ufFilter;

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

  const plannedStates = [...byState.keys()].filter((s) => !filter || filter.has(s));
  if (filter) {
    console.log(`[regions:build] filtro UF ativo: ${plannedStates.join(", ")}`);
  } else {
    console.log(`[regions:build] processando todas as ${plannedStates.length} UFs`);
  }

  const summary = {};
  let totalProcessed = 0;
  let totalLayer1 = 0;
  let totalLayer2 = 0;
  const failedStates = [];

  for (const state of plannedStates) {
    const citiesInState = byState.get(state);
    try {
      const { stateLayer1, stateLayer2, attempts } = await processStateWithRetry(
        state,
        citiesInState
      );
      summary[state] = {
        cities: citiesInState.length,
        layer1Total: stateLayer1,
        layer2Total: stateLayer2,
        attempts,
      };
      totalLayer1 += stateLayer1;
      totalLayer2 += stateLayer2;
      totalProcessed += citiesInState.length;
      const retryNote = attempts > 1 ? ` (recuperado em ${attempts} tentativas)` : "";
      console.log(
        `[regions:build] ${state}: ${citiesInState.length} cidades, ${stateLayer1} memberships layer 1, ${stateLayer2} layer 2${retryNote}`
      );
    } catch (err) {
      failedStates.push(state);
      summary[state] = {
        cities: citiesInState.length,
        error: err?.message || String(err),
      };
      console.error(
        `[regions:build] ${state}: FALHA após retries — ${err?.message || err}. Pulando para próxima UF.`
      );
    }
  }

  const elapsedSec = ((Date.now() - start) / 1000).toFixed(1);
  console.log(
    `[regions:build] OK — ${totalProcessed} cidades-base processadas, ${totalLayer1} memberships layer 1 + ${totalLayer2} layer 2 em ${elapsedSec}s.`
  );
  if (failedStates.length) {
    console.warn(
      `[regions:build] UFs que falharam após retries: ${failedStates.join(", ")} — rode novamente com --uf=${failedStates.join(",")} para retomar.`
    );
  }

  // ── Relatório nacional de cobertura ─────────────────────────────────
  //
  // Mostra, ao fim do build, números agregados para auditoria:
  //   - Total de cidades cadastradas vs com coordenadas.
  //   - Cidades sem coordenadas (gap geográfico do dataset IBGE).
  //   - Cidades com vizinhança gravada (layer > 0) vs sem.
  //   - Cobertura por UF (proporção entre cidades base com membros).
  //
  // Em UFs com cidades isoladas (interior do Norte, Centro-Oeste), é
  // esperado que algumas cidades fiquem sem vizinhança (geografia real,
  // não regressão). O relatório torna isso explícito.
  try {
    const { rows: nacional } = await pool.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(latitude)::int AS com_coords,
         COUNT(*) FILTER (WHERE latitude IS NULL)::int AS sem_coords
       FROM cities`
    );
    const { rows: coberturaPorUf } = await pool.query(
      `SELECT c.state,
              COUNT(DISTINCT c.id)::int AS total_cities,
              COUNT(DISTINCT c.id) FILTER (
                WHERE EXISTS (
                  SELECT 1 FROM region_memberships rm
                  WHERE rm.base_city_id = c.id AND rm.layer > 0
                )
              )::int AS com_vizinhanca
       FROM cities c
       WHERE c.latitude IS NOT NULL
       GROUP BY c.state
       ORDER BY c.state`
    );

    console.log("");
    console.log("[regions:build] ── COBERTURA NACIONAL ─────────────────");
    console.log(
      `[regions:build] ${nacional[0].total} cidades cadastradas, ${nacional[0].com_coords} com coords (${nacional[0].sem_coords} sem).`
    );
    console.log("[regions:build] UF | base_cities | com_vizinhança | % cobertura");
    let totalComViz = 0;
    let totalBase = 0;
    for (const row of coberturaPorUf) {
      const pct =
        row.total_cities > 0
          ? ((row.com_vizinhanca / row.total_cities) * 100).toFixed(0)
          : "0";
      console.log(
        `[regions:build] ${row.state}  | ${String(row.total_cities).padStart(5)} | ${String(row.com_vizinhanca).padStart(5)}          | ${pct.padStart(3)}%`
      );
      totalComViz += row.com_vizinhanca;
      totalBase += row.total_cities;
    }
    const pctNacional = totalBase > 0 ? ((totalComViz / totalBase) * 100).toFixed(1) : "0";
    console.log(
      `[regions:build] TOTAL: ${totalComViz}/${totalBase} cidades com vizinhança gravada (${pctNacional}%).`
    );
    console.log(
      `[regions:build] Cidades sem vizinhança são, em geral, isoladas geograficamente (sem vizinhos no raio de ${LAYER_2_MAX_KM} km na mesma UF). Não é regressão.`
    );
  } catch (err) {
    console.warn(
      `[regions:build] Falha ao gerar relatório de cobertura — ${err?.message || err}. (Build em si concluiu OK.)`
    );
  }

  return { processed: totalProcessed, byState: summary, failedStates };
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
