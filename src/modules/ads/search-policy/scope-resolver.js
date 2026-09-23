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
//
// F2.2-A1 (v3 certificada): o AUTO_RADIUS passou a obedecer DEC-11, DEC-18 e
// DEC-23. Teto automático de 75 km em qualquer perfil; o território sai do
// BASELINE de descoberta (política BROWSE_CITY, liquidez sem filtro de
// produto), nunca do perfil de produto; e, quando nenhum anel atinge o alvo, o
// raio efetivo é o último anel que acrescentou candidatos — não o teto.

import crypto from "node:crypto";
import { pool } from "../../../infrastructure/database/db.js";
import { logger } from "../../../shared/logger.js";
import { baseClauses, buildProductClauses, createParamBag } from "./candidate-scope.js";
import { POLICY_CACHE_PREFIX, policyCacheGet, policyCacheSet } from "./policy-cache.js";
import { MANUAL_RADIUS_MAX_KM, isValidExplicitRadius } from "./policy-config.js";

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
  // `user_geo_explicit` marca SOMENTE o eixo de raio (v3 §4 e §26): houve um
  // raio explícito válido na URL. `escopo=` e a ausência de origem não são
  // escolha de raio, então permanecem false — não é papel desta fase estender a
  // marca a outros eixos geográficos.
  if (escopo === "brasil")
    return { mode: GEO_MODE.NATIONAL, requested_radius_km: null, user_geo_explicit: false };
  if (escopo === "uf")
    return { mode: GEO_MODE.STATE, requested_radius_km: null, user_geo_explicit: false };
  if (!hasOrigin)
    return {
      mode: uf ? GEO_MODE.STATE : GEO_MODE.NATIONAL,
      requested_radius_km: null,
      user_geo_explicit: false,
    };

  // F2.2-A2 (v3 §4, DEC-19/DEC-24; INV-006/075/076/057). A validação é pela
  // FAIXA [0,150], não pela lista de presets.
  //
  // O que havia aqui — `rings_manual.includes(raio)` — tratava os degraus de UX
  // como se fossem o conjunto dos valores aceitos. Com rings_manual =
  // [0,25,50,75], `raio=40` caía no `return` de baixo e virava AUTO_RADIUS:
  // descarte silencioso de uma intenção manual explícita, exatamente o que
  // INV-057 proíbe. A v3 é explícita: "os degraus são presets de UX, não o
  // conjunto dos valores válidos".
  if (isValidExplicitRadius(query.raio)) {
    const raio = Number(String(query.raio).trim());
    // DEC-24: o 0 explícito é escolha geográfica, não raio — EXACT_CITY, nunca
    // MANUAL_RADIUS, com o automático bloqueado.
    return raio === 0
      ? { mode: GEO_MODE.EXACT_CITY, requested_radius_km: 0, user_geo_explicit: true }
      : { mode: GEO_MODE.MANUAL_RADIUS, requested_radius_km: raio, user_geo_explicit: true };
  }
  // Raio inválido (negativo, > 150, fracionário, não numérico, múltiplo) NÃO é
  // raio manual: cai no automático, como já caía antes desta fase. INV-077 é
  // satisfeito — nada é aproximado para um valor aceito —, mas a EXPERIÊNCIA do
  // valor inválido (erro 400? aviso? ignorar?) segue `pendente` na v3 §4 e não é
  // decidida aqui.
  return { mode: GEO_MODE.AUTO_RADIUS, requested_radius_km: null, user_geo_explicit: false };
}

/**
 * Núcleo do AUTO_RADIUS (§4.4), puro. `rows` ordenadas por distance_km ASC,
 * cada uma { distance_km, count }.
 *
 * F2.2-A1 (DEC-23). Dois caminhos:
 *
 *   alvo atingido  →  `required_distance_km` é a distância exata em que o
 *                     acumulado cruza o alvo; `effective_radius_km` é o menor
 *                     anel automático permitido que a contém.
 *
 *   alvo NÃO atingido →  `required_distance_km` é nulo e o raio efetivo é o
 *                     ÚLTIMO anel cuja inclusão acrescentou candidatos. Anel
 *                     com delta zero não amplia o território; se nenhum anel
 *                     externo acrescenta nada, o efetivo é 0.
 *
 * O teto avaliado nunca é, por si, o território efetivo — era o que a versão
 * anterior fazia (`effective = max_auto_radius`) e o que DEC-23 substituiu.
 * `AUTO_RADIUS_CAP_REACHED` passa a significar só "o teto automático foi
 * varrido sem atingir o alvo".
 */
export function resolveAutoRadius(rows, { target, max_auto_radius, rings_auto }) {
  const allowed = (rings_auto || [])
    .map(Number)
    .filter((r) => Number.isFinite(r) && r <= Number(max_auto_radius))
    .sort((a, b) => a - b);

  let acc = 0;
  let required = null;
  for (const row of rows) {
    acc += Number(row.count || 0);
    if (acc >= target) {
      required = Number(row.distance_km);
      break;
    }
  }

  if (required !== null) {
    const candidates = allowed.filter((r) => r >= required);
    const effective = candidates.length
      ? Math.min(...candidates)
      : allowed.length
        ? Math.max(...allowed)
        : 0;
    return {
      required_distance_km: required,
      effective_radius_km: effective,
      expanded: effective > 0,
      reason: effective > 0 ? REASON.LOW_LOCAL_LIQUIDITY : REASON.LOCAL_LIQUIDITY_OK,
    };
  }

  // Alvo não atingido: último anel contributivo (DEC-23).
  let effective = 0;
  let previous = allowed.length ? cumulativeCountAt(rows, allowed[0]) : 0;
  for (const ring of allowed.slice(1)) {
    const cumulative = cumulativeCountAt(rows, ring);
    if (cumulative > previous) effective = ring;
    previous = cumulative;
  }
  return {
    required_distance_km: null,
    effective_radius_km: effective,
    expanded: effective > 0,
    reason: REASON.AUTO_RADIUS_CAP_REACHED,
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

/**
 * F2.2-A2: `radiusKm` entra na chave.
 *
 * Até a A2 o raio da liquidez era constante (o teto automático do perfil), e
 * omiti-lo era inofensivo. Agora que um raio manual pode ampliá-lo, duas
 * requisições com mesma origem, perfil e filtros podem pedir alcances
 * diferentes — sem o raio na chave, a primeira a gravar serviria a outra:
 * `raio=150` receberia as linhas de 75 km (cidades faltando) ou `raio=25`
 * receberia as de 150 (contagens de anel infladas). É a chave da liquidez da
 * política (`sp:liq:`), não a cache key da busca de anúncios.
 */
function liquidityCacheKey(originId, profile, filters, radiusKm) {
  const bag = createParamBag();
  const product = buildProductClauses(filters, bag);
  const fingerprint = sha1(JSON.stringify([product.clauses, bag.params]));
  return `${POLICY_CACHE_PREFIX.LIQUIDITY}:${originId}:${profile}:${Number(radiusKm)}:${fingerprint}`;
}

/**
 * Resolve o escopo completo.
 *
 * @param {object} ctx { origin, filters, intent:{profile,target,max_auto_radius}, geoRequest:{mode,requested_radius_km}, uf }
 * @param {object} policy
 * @param {{ db?, cache?: boolean, includeDetails?: boolean, timings?: object }} deps
 */
export async function resolveScope(ctx, policy, deps = {}) {
  const db = deps.db || pool;
  const useCache = deps.cache !== false;
  const includeDetails = deps.includeDetails !== false;
  const timings = deps.timings || null;
  const { origin, intent, geoRequest } = ctx;
  const mode = geoRequest.mode;

  const base = {
    geo_mode: mode,
    requested_radius_km: geoRequest.requested_radius_km ?? null,
    user_geo_explicit: geoRequest.user_geo_explicit === true,
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
    rows = await loadLiquidity(ctx, policy, db, useCache, base, timings);
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
    // F2.2-A1 / DEC-18: o território automático sai do BASELINE de descoberta
    // (política BROWSE_CITY, liquidez SEM filtros de produto), nunca do perfil
    // de produto. É isso que impede que marca/modelo/ano/versão ampliem o
    // território sozinhos. Com liquidez sem filtro, baseline === rows.
    const baselineStarted = Date.now();
    const baselineRows = await loadBaselineLiquidity(ctx, policy, db, useCache, rows, timings);
    if (timings) timings.scope_baseline_ms = Date.now() - baselineStarted;

    const finalizeStarted = Date.now();
    const auto = resolveAutoRadius(baselineRows, {
      target: baselineTarget(policy),
      max_auto_radius: baselineMaxAutoRadius(policy),
      rings_auto: policy.rings_auto,
    });
    effective = auto.effective_radius_km;
    required = auto.required_distance_km;
    expanded = auto.expanded;
    reason = auto.reason;
    if (timings) timings.scope_finalize_ms = Date.now() - finalizeStarted;
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
  const cities = includeDetails ? await decorateCities(db, emitted, origin) : [];

  return {
    ...base,
    required_distance_km: required,
    effective_radius_km: effective,
    expanded,
    reason,
    cities,
    territory_city_count: inTerritory.length,
    rings: includeDetails
      ? buildRings(rows, {
          rings_manual: policy.rings_manual,
          effective_radius_km: effective,
          origin,
          geoMode: mode,
        })
      : [],
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

/** Carrega e cacheia uma liquidez qualquer (produto ou baseline). */
async function loadLiquidityRows({
  db,
  origin,
  filters,
  profile,
  radiusKm,
  policy,
  useCache,
  bookkeeping,
  timings = null,
  timingPrefix = "scope_primary",
}) {
  const key = liquidityCacheKey(origin.id, profile, filters, radiusKm);
  if (useCache) {
    const cacheStarted = Date.now();
    const hit = await policyCacheGet(key);
    if (timings) timings[`${timingPrefix}_cache_get_ms`] = Date.now() - cacheStarted;
    if (Array.isArray(hit)) {
      bookkeeping.cache = { backend: "policy-cache", hit: true, key };
      return hit;
    }
  }
  const queryStarted = Date.now();
  const { rows } = await runLiquidityQuery(db, { originId: origin.id, radiusKm, filters });
  if (timings) timings[`${timingPrefix}_query_ms`] = Date.now() - queryStarted;
  const compact = rows.map((r) => ({
    city_id: Number(r.city_id),
    slug: r.slug,
    distance_km: Number(r.distance_km),
    count: Number(r.count),
  }));
  if (useCache) {
    const cacheSetStarted = Date.now();
    await policyCacheSet(key, compact, Number(policy.liquidity_cache_ttl_seconds) || 900);
    if (timings) timings[`${timingPrefix}_cache_set_ms`] = Date.now() - cacheSetStarted;
    bookkeeping.cache = { backend: "policy-cache", hit: false, key };
  }
  return compact;
}

/**
 * Até onde a liquidez precisa enxergar nesta requisição.
 *
 * F2.2-A2. Antes desta fase o teto era SEMPRE `intent.max_auto_radius` — que a
 * A1 baixou para 75 em todos os perfis. Com isso um `raio=150` manual produzia
 * território correto nos RESULTADOS (buildTerritoryClause monta o `distance_km
 * <= 150` direto no SQL, sem depender destas linhas) mas uma resposta truncada
 * em 75 km: `cities[]` sem as cidades de 75–150, `territory_city_count` menor
 * que o território real e o anel de 150 com contagem incompleta. Grid e
 * metadados discordariam entre si.
 *
 * O raio manual é intenção explícita do usuário e pode passar do teto
 * automático; a liquidez acompanha o que for maior.
 */
function liquidityRadiusFor(ctx) {
  const auto = Number(ctx.intent.max_auto_radius) || 0;
  const manual =
    ctx.geoRequest?.mode === GEO_MODE.MANUAL_RADIUS
      ? Number(ctx.geoRequest.requested_radius_km) || 0
      : 0;
  return Math.min(Math.max(auto, manual), MANUAL_RADIUS_MAX_KM);
}

async function loadLiquidity(ctx, policy, db, useCache, base, timings = null) {
  const { origin, filters } = ctx;
  return loadLiquidityRows({
    db,
    origin,
    filters,
    profile: ctx.intent.profile,
    radiusKm: liquidityRadiusFor(ctx),
    policy,
    useCache,
    bookkeeping: base,
    timings,
    timingPrefix: "scope_primary",
  });
}
/** Perfil do território-base de descoberta (DEC-18): sempre BROWSE_CITY. */
export const BASELINE_PROFILE = "BROWSE_CITY";

function baselineTarget(policy) {
  return Number(policy?.profiles?.[BASELINE_PROFILE]?.target);
}

function baselineMaxAutoRadius(policy) {
  return Number(policy?.profiles?.[BASELINE_PROFILE]?.max_auto_radius);
}

/** Há alguma restrição de PRODUTO ativa? Usa o mesmo construtor do
 *  CandidateScope para não existir uma segunda definição de "produto". */
export function hasProductFilters(filters = {}) {
  const bag = createParamBag();
  return buildProductClauses(filters, bag).clauses.length > 0;
}

/**
 * Liquidez do BASELINE (DEC-18): mesma consulta, sem filtros de produto e com
 * o teto do perfil BROWSE_CITY. Sem filtro de produto ativo, o baseline é a
 * própria liquidez já carregada — nenhuma query extra.
 */
async function loadBaselineLiquidity(ctx, policy, db, useCache, productRows, timings = null) {
  const { origin, filters } = ctx;
  if (!hasProductFilters(filters)) return productRows;
  return loadLiquidityRows({
    db,
    origin,
    filters: {},
    profile: BASELINE_PROFILE,
    radiusKm: baselineMaxAutoRadius(policy),
    policy,
    useCache,
    bookkeeping: {},
    timings,
    timingPrefix: "scope_baseline",
  });
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
