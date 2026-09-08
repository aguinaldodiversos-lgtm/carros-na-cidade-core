// src/modules/ads/search-policy/scope-resolver.js
//
// ScopeResolver (§4.4 + D5 + D7 + E1 + E3).
//
// Entrada: origem (ou não), pedido de geo (raio=/escopo=), perfil e o
// productScope. Saída: modo, raio efetivo, cidades, anéis e contagens.
//
// A query de liquidez (§2.2 do gate, forma D7 — subconsulta agregada por
// city_id, porque o guard de anúncio sujo cita `adv`) roda em TODOS os modos
// com origem, com $2 = max_auto_radius do perfil (E1). Dela saem:
//   cities[].count, rings[].count (acumulado) e local_result_count (linha da
//   origem). A segunda query de count com o slug da origem foi removida (E1).
//
// Cache: sp:liq:{origin}:{profile}:{sha1(productScope)}, TTL
// liquidity_cache_ttl_seconds, guardando só {slug, distance_km, count} por
// cidade (E4). Nome/UF das cidades emitidas vêm de uma consulta pequena.
//
// Fail-safe (§4.4): origem sem lat/lng, memberships vazias ou erro de query →
// EXACT_CITY, reason GEO_FALLBACK, log.error. NUNCA NATIONAL por falha.

import crypto from "node:crypto";
import { pool } from "../../../infrastructure/database/db.js";
import { logger } from "../../../shared/logger.js";
import { baseClauses, buildProductClauses, createParamBag } from "./candidate-scope.js";
import { POLICY_CACHE_PREFIX, policyCacheGet, policyCacheSet } from "./policy-cache.js";

export const GEO_MODE = Object.freeze({
  EXACT_CITY: "EXACT_CITY",
  AUTO_RADIUS: "AUTO_RADIUS",
  MANUAL_RADIUS: "MANUAL_RADIUS",
  STATE: "STATE",
  NATIONAL: "NATIONAL",
});

export const REASON = Object.freeze({
  LOCAL_LIQUIDITY_OK: "LOCAL_LIQUIDITY_OK",
  LOW_LOCAL_LIQUIDITY: "LOW_LOCAL_LIQUIDITY",
  AUTO_RADIUS_CAP_REACHED: "AUTO_RADIUS_CAP_REACHED",
  MANUAL: "MANUAL",
  GEO_FALLBACK: "GEO_FALLBACK",
  STATE: "STATE",
  NATIONAL: "NATIONAL",
});

/** Modo pedido pela URL: raio= / escopo=. Puro.
 *  Sem origem, o `state=` legado (widgets da home: "recentes em SP", "abaixo
 *  da FIPE em SP") vale como escopo=uf — o legado aplica a.state no WHERE e o
 *  motor não pode filtrar menos do que ele. */
export function resolveGeoRequest(query = {}, policy, hasOrigin, { uf = null } = {}) {
  const escopo = String(query.escopo || "")
    .trim()
    .toLowerCase();
  if (escopo === "brasil") return { mode: GEO_MODE.NATIONAL, requested_radius_km: null };
  if (escopo === "uf") return { mode: GEO_MODE.STATE, requested_radius_km: null };
  if (!hasOrigin)
    return { mode: uf ? GEO_MODE.STATE : GEO_MODE.NATIONAL, requested_radius_km: null };

  if (query.raio !== undefined && query.raio !== null && String(query.raio).trim() !== "") {
    const raio = Number(query.raio);
    const manual = Array.isArray(policy?.rings_manual) ? policy.rings_manual : [];
    // DEFAULT §12: raio fora de rings_manual é ignorado (volta ao automático).
    if (Number.isFinite(raio) && manual.includes(raio)) {
      return raio === 0
        ? { mode: GEO_MODE.EXACT_CITY, requested_radius_km: 0 }
        : { mode: GEO_MODE.MANUAL_RADIUS, requested_radius_km: raio };
    }
  }
  return { mode: GEO_MODE.AUTO_RADIUS, requested_radius_km: null };
}

/**
 * Núcleo do AUTO_RADIUS (§4.4), puro. `rows` ordenadas por distance_km ASC,
 * cada uma { distance_km, count }.
 */
export function resolveAutoRadius(rows, { target, max_auto_radius, rings_auto }) {
  let acc = 0;
  let required = null;
  for (const row of rows) {
    acc += Number(row.count || 0);
    if (acc >= target) {
      required = Number(row.distance_km);
      break;
    }
  }
  if (required === null) {
    return {
      required_distance_km: null,
      effective_radius_km: max_auto_radius,
      expanded: true,
      reason: REASON.AUTO_RADIUS_CAP_REACHED,
    };
  }
  const candidates = (rings_auto || []).filter((r) => r >= required && r <= max_auto_radius);
  const effective = candidates.length ? Math.min(...candidates) : max_auto_radius;
  return {
    required_distance_km: required,
    effective_radius_km: effective,
    expanded: effective > 0,
    reason: effective > 0 ? REASON.LOW_LOCAL_LIQUIDITY : REASON.LOCAL_LIQUIDITY_OK,
  };
}

/** Contagem acumulada de candidatos até cada raio. Puro. */
export function cumulativeCountAt(rows, radiusKm) {
  let n = 0;
  for (const row of rows) if (Number(row.distance_km) <= radiusKm) n += Number(row.count || 0);
  return n;
}

/**
 * Anéis (D5): rings_manual sempre; 150 só quando effective = 150, com
 * auto:true e sem url_params. Puro.
 */
export function buildRings(rows, { rings_manual, effective_radius_km, origin, geoMode }) {
  const rings = (rings_manual || []).map((r) => {
    const ring = {
      radius_km: r,
      label: r === 0 ? `Apenas ${origin?.name || "a cidade"}` : `${r} km`,
      count: cumulativeCountAt(rows, r),
      url_params: { raio: r },
    };
    if (geoMode === GEO_MODE.AUTO_RADIUS && r === effective_radius_km) ring.auto = true;
    return ring;
  });
  if (effective_radius_km === 150 && !rings.some((r) => r.radius_km === 150)) {
    rings.push({
      radius_km: 150,
      label: "150 km",
      count: cumulativeCountAt(rows, 150),
      auto: geoMode === GEO_MODE.AUTO_RADIUS ? true : undefined,
    });
    if (rings[rings.length - 1].auto === undefined) delete rings[rings.length - 1].auto;
  }
  return rings;
}

function sha1(value) {
  return crypto.createHash("sha1").update(String(value)).digest("hex");
}

/**
 * Query de liquidez (§2.2 do gate, D7). Devolve linhas { city_id, slug, distance_km, count }
 * para TODAS as cidades até `radiusKm` da origem, ordenadas por distância.
 */
export async function runLiquidityQuery(db, { originId, radiusKm, filters }) {
  const bag = createParamBag();
  const originP = bag.p(Number(originId));
  const radiusP = bag.p(Number(radiusKm));
  const clauses = baseClauses();
  const product = buildProductClauses(filters, bag);
  clauses.push(...product.clauses);
  const sql = `
    SELECT c.id AS city_id, c.slug, rm.distance_km::float AS distance_km,
           COALESCE(cnt.n, 0)::int AS count
    FROM region_memberships rm
    JOIN cities c ON c.id = rm.member_city_id
    LEFT JOIN (
      SELECT a.city_id, COUNT(*)::int AS n
      FROM ads a
      LEFT JOIN cities c2             ON c2.id = a.city_id
      LEFT JOIN advertisers adv       ON adv.id = a.advertiser_id
      LEFT JOIN users u               ON u.id  = adv.user_id
      LEFT JOIN subscription_plans sp ON sp.id = u.plan_id
      WHERE ${clauses.join("\n        AND ")}
        AND a.city_id IN (
          SELECT member_city_id FROM region_memberships
          WHERE base_city_id = ${originP} AND distance_km <= ${radiusP}
        )
      GROUP BY a.city_id
    ) cnt ON cnt.city_id = c.id
    WHERE rm.base_city_id = ${originP} AND rm.distance_km <= ${radiusP}
    ORDER BY rm.distance_km ASC, c.slug ASC`;
  const { rows } = await db.query(sql, bag.params);
  return { rows, sql, params: bag.params };
}

function liquidityCacheKey(originId, profile, filters) {
  const bag = createParamBag();
  const product = buildProductClauses(filters, bag);
  const fingerprint = sha1(JSON.stringify([product.clauses, bag.params]));
  return `${POLICY_CACHE_PREFIX.LIQUIDITY}:${originId}:${profile}:${fingerprint}`;
}

/**
 * Resolve o escopo completo.
 *
 * @param {object} ctx { origin, filters, intent:{profile,target,max_auto_radius}, geoRequest:{mode,requested_radius_km}, uf }
 * @param {object} policy
 * @param {{ db?, cache?: boolean }} deps
 */
export async function resolveScope(ctx, policy, deps = {}) {
  const db = deps.db || pool;
  const useCache = deps.cache !== false;
  const { origin, intent, geoRequest } = ctx;
  const mode = geoRequest.mode;

  const base = {
    geo_mode: mode,
    requested_radius_km: geoRequest.requested_radius_km ?? null,
    required_distance_km: null,
    effective_radius_km: null,
    expanded: false,
    reason: null,
    cities: [],
    territory_city_count: 0,
    rings: [],
    local_result_count: null,
    liquidityRows: [],
    territory: { mode, originId: origin?.id ?? null, radiusKm: null, uf: ctx.uf ?? null },
    cache: { backend: null, hit: false },
  };

  if (mode === GEO_MODE.NATIONAL) return { ...base, reason: REASON.NATIONAL };
  if (mode === GEO_MODE.STATE) {
    const out = { ...base, reason: REASON.STATE };
    if (origin)
      out.local_result_count = await localCountViaLiquidity(ctx, policy, db, useCache, out);
    return out;
  }

  // Modos com origem: liquidez sempre (E1).
  if (!origin || origin.latitude == null || origin.longitude == null) {
    logger.error(
      { origin: origin?.slug || null, mode },
      "[search-policy] origem sem coordenadas — GEO_FALLBACK para EXACT_CITY"
    );
    return geoFallback(base, origin);
  }

  let rows;
  try {
    rows = await loadLiquidity(ctx, policy, db, useCache, base);
  } catch (err) {
    logger.error(
      { err: err?.message || String(err), origin: origin.slug, mode },
      "[search-policy] liquidez falhou — GEO_FALLBACK para EXACT_CITY"
    );
    return geoFallback(base, origin);
  }
  if (!rows.length) {
    logger.error(
      { origin: origin.slug, mode },
      "[search-policy] origem sem region_memberships — GEO_FALLBACK para EXACT_CITY"
    );
    return geoFallback(base, origin);
  }

  const originRow = rows.find((r) => Number(r.distance_km) === 0) || null;
  const local = originRow ? Number(originRow.count) : 0;

  let effective;
  let required = null;
  let expanded;
  let reason;
  if (mode === GEO_MODE.AUTO_RADIUS) {
    const auto = resolveAutoRadius(rows, {
      target: intent.target,
      max_auto_radius: intent.max_auto_radius,
      rings_auto: policy.rings_auto,
    });
    effective = auto.effective_radius_km;
    required = auto.required_distance_km;
    expanded = auto.expanded;
    reason = auto.reason;
  } else if (mode === GEO_MODE.MANUAL_RADIUS) {
    effective = Number(geoRequest.requested_radius_km);
    expanded = effective > 0;
    reason = REASON.MANUAL;
  } else {
    effective = 0;
    expanded = false;
    reason = REASON.MANUAL;
  }

  const inTerritory = rows.filter((r) => Number(r.distance_km) <= effective);
  const emitted = inTerritory.filter((r) => Number(r.count) > 0 || Number(r.distance_km) === 0);
  const cities = await decorateCities(db, emitted, origin);

  return {
    ...base,
    required_distance_km: required,
    effective_radius_km: effective,
    expanded,
    reason,
    cities,
    territory_city_count: inTerritory.length,
    rings: buildRings(rows, {
      rings_manual: policy.rings_manual,
      effective_radius_km: effective,
      origin,
      geoMode: mode,
    }),
    local_result_count: local,
    liquidityRows: rows,
    territory: { mode, originId: origin.id, radiusKm: effective, uf: origin.state },
  };
}

function geoFallback(base, origin) {
  return {
    ...base,
    geo_mode: GEO_MODE.EXACT_CITY,
    effective_radius_km: 0,
    expanded: false,
    reason: REASON.GEO_FALLBACK,
    cities: origin
      ? [{ slug: origin.slug, name: origin.name, state: origin.state, distance_km: 0, count: null }]
      : [],
    territory_city_count: origin ? 1 : 0,
    rings: [],
    local_result_count: null,
    territory: {
      mode: GEO_MODE.EXACT_CITY,
      originId: origin?.id ?? null,
      radiusKm: 0,
      uf: origin?.state ?? null,
    },
  };
}

async function loadLiquidity(ctx, policy, db, useCache, base) {
  const { origin, filters, intent } = ctx;
  const key = liquidityCacheKey(origin.id, intent.profile, filters);
  if (useCache) {
    const hit = await policyCacheGet(key);
    if (Array.isArray(hit)) {
      base.cache = { backend: "policy-cache", hit: true, key };
      return hit;
    }
  }
  const { rows } = await runLiquidityQuery(db, {
    originId: origin.id,
    radiusKm: intent.max_auto_radius,
    filters,
  });
  const compact = rows.map((r) => ({
    city_id: Number(r.city_id),
    slug: r.slug,
    distance_km: Number(r.distance_km),
    count: Number(r.count),
  }));
  if (useCache) {
    await policyCacheSet(key, compact, Number(policy.liquidity_cache_ttl_seconds) || 900);
    base.cache = { backend: "policy-cache", hit: false, key };
  }
  return compact;
}

async function localCountViaLiquidity(ctx, policy, db, useCache, out) {
  try {
    const rows = await loadLiquidity(ctx, policy, db, useCache, out);
    const originRow = rows.find((r) => Number(r.distance_km) === 0);
    out.liquidityRows = rows;
    return originRow ? Number(originRow.count) : 0;
  } catch (err) {
    logger.warn(
      { err: err?.message },
      "[search-policy] liquidez em STATE falhou; local_result_count nulo"
    );
    return null;
  }
}

/** Nome/UF só das cidades emitidas (E3/E4). */
async function decorateCities(db, rows, origin) {
  if (!rows.length) return [];
  const ids = rows.map((r) => Number(r.city_id));
  const { rows: meta } = await db.query(
    `SELECT id, slug, name, state FROM cities WHERE id = ANY($1::bigint[])`,
    [ids]
  );
  const byId = new Map(meta.map((m) => [Number(m.id), m]));
  return rows.map((r) => {
    const m = byId.get(Number(r.city_id)) || {};
    return {
      slug: r.slug,
      name: m.name || (r.city_id === origin?.id ? origin.name : r.slug),
      state: m.state || null,
      distance_km: Number(r.distance_km),
      count: Number(r.count),
    };
  });
}
