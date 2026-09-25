// src/modules/ads/search-policy/engine.js
//
// Orquestrador do Search Policy Engine v2.1 (§4, §5, §6, §4.9).
//
//   buildSearchContext  → LocationResolver → ProductResolver → IntentResolver → pedido de geo
//   runSearchPolicyEngine (v1) → ScopeResolver → CandidateScope → grid + count + facetas
//                                 → relaxações (se total < target) → resposta §6 → telemetria
//   runShadowComparison (shadow) → ScopeResolver + count + primeiro id → só telemetria
//
// Determinístico (R7): mesma URL + mesma política + mesmo banco = mesma
// resposta. Nenhuma chamada externa. Nenhuma lógica de ranking/escopo/faceta
// no frontend (R8): tudo sai daqui em JSON.

import { pool } from "../../../infrastructure/database/db.js";
import { logger } from "../../../shared/logger.js";
import { ADS_FILTER_LIMITS, isAllowedAdsSort } from "../filters/ads-filter.constants.js";
import { buildSortClause } from "../filters/ads-filter.sort.js";
import { commercialLayerExpr, opportunityExpr } from "../filters/ads-ranking.sql.js";
import { normalizePublicAdRows } from "../ads.public-images.js";
import { serializeAdsForListing } from "../ads.public-listing.js";
import { buildCandidateScope } from "./candidate-scope.js";
import { buildChips } from "./chips.js";
import { getBrandDictionary, getCommercialModelDictionary } from "./dictionaries.js";
import { computeFacets } from "./facets-policy.js";
import { isOriginAllowed } from "./flag.js";
import { resolveIntent } from "./intent-resolver.js";
import { resolveLocation } from "./location-resolver.js";
import { policyCacheBackend } from "./policy-cache.js";
import { loadSearchPolicy } from "./policy-config.js";
import { resolveProduct } from "./product-resolver.js";
import { computeRelaxations } from "./relaxations.js";
import { GEO_MODE, resolveGeoRequest, resolveScope } from "./scope-resolver.js";
import { buildSearchExecutedPayload, recordSearchExecuted } from "./telemetry.js";

export const SHADOW_TIMEOUT_MS = 300;

/**
 * F2.2-D1 — segurança operacional do shadow.
 *
 * A race de SHADOW_TIMEOUT_MS só limita o RELATO: `Promise.race` não cancela o
 * perdedor, e sem `statement_timeout` a query seguia viva no Postgres segurando
 * conexão do pool (prova em F2.2-D1: 2 backends `active` esperando lock por
 * 4 s+ depois de a race devolver timedOut). Agora todo o SQL do shadow roda num
 * client próprio, dentro de BEGIN … ROLLBACK, com `statement_timeout` LOCAL à
 * transação — morre com ela e não vaza para a próxima requisição do pool.
 *
 * Mesmo orçamento da race, por construção (não podem divergir): nenhum
 * statement do shadow sobrevive ao orçamento lógico por mais do que a sua
 * própria duração. O pior caso de posse da conexão é (nº de statements
 * sequenciais do shadow) × este valor — limitado, nunca indefinido.
 */
export const SHADOW_STATEMENT_TIMEOUT_MS = SHADOW_TIMEOUT_MS;

/**
 * Teto de comparações shadow simultâneas por processo. O shadow roda em 100%
 * do tráfego de /api/ads/search (a allowlist só vale para o v1 — escopo
 * preservado de propósito) e o pool tem PG_POOL_MAX=20 por padrão: sem teto,
 * o modo que existe para "não mudar nada" poderia tomar as conexões do legado.
 * Excedente é DESCARTADO, nunca enfileirado.
 *
 * Env operacional `SEARCH_POLICY_SHADOW_MAX_CONCURRENCY` (inteiro ≥ 1), lida a
 * cada chamada como a flag. Ausente ou inválida → default. Não é decisão de
 * política de busca.
 */
export const SHADOW_MAX_CONCURRENCY_DEFAULT = 2;

export function getShadowMaxConcurrency(env = process.env) {
  const raw = String(env.SEARCH_POLICY_SHADOW_MAX_CONCURRENCY ?? "").trim();
  const n = Number(raw);
  return raw !== "" && Number.isInteger(n) && n >= 1 ? n : SHADOW_MAX_CONCURRENCY_DEFAULT;
}

const SHADOW_SATURATION_WARN_INTERVAL_MS = 60_000;
const shadowState = {
  inFlight: 0,
  skippedSaturated: 0,
  skippedPoolPressure: 0,
  lastSaturationWarnAt: 0,
  lastPoolPressureWarnAt: 0,
};

function poolHasShadowPressure(db) {
  const idle = Number(db?.idleCount);
  const total = Number(db?.totalCount);
  const waiting = Number(db?.waitingCount);
  const max = Number(db?.options?.max);

  if (!Number.isFinite(idle) || !Number.isFinite(total)) return false;
  if (idle > 0) return false;

  // Já existe fila: Shadow nunca deve acrescentar mais um waiter.
  if (Number.isFinite(waiting) && waiting > 0) return true;

  // Sem idle e pool no teto: o Shadow seria o primeiro waiter.
  return Number.isFinite(max) && max > 0 && total >= max;
}

/**
 * F2.2-D1R-S — comparações em que o motor NÃO contou (parâmetro não modelado
 * ou timeout). Não viram `search.executed`: esse evento é de busca e exige
 * total_count/seller_count reais (DEC-27 / V3-INV-052), e "não calculado" não
 * pode virar null num evento normativo nem zero inventado. O diagnóstico fica
 * aqui — contadores do processo + log limitado a 1×/min, como a saturação.
 */
const SHADOW_NOT_COUNTED_LOG_INTERVAL_MS = 60_000;
const shadowNotCounted = {
  unsupported: 0,
  unsupportedByParam: new Map(),
  timedOut: 0,
  lastUnsupportedLogAt: 0,
  lastTimeoutLogAt: 0,
};

/**
 * Instrumentação temporária de performance do shadow.
 *
 * Objetivo: decompor o envelope real (pool → setup transacional → contexto →
 * escopo → query de comparação → ROLLBACK → telemetria) sem tocar em política,
 * CandidateScope, ranking, resposta pública ou persistência.
 *
 * Volume controlado:
 *   - timeout/error: no máximo 1 log detalhado a cada 10 s;
 *   - sucesso: no máximo 1 log detalhado a cada 30 s.
 *
 * Não registra query string, q, IP, IDs de usuário ou qualquer payload livre.
 * Em NODE_ENV diferente de production não emite estes logs.
 */
const SHADOW_DIAGNOSTIC_TIMEOUT_LOG_INTERVAL_MS = 10_000;
const SHADOW_DIAGNOSTIC_SUCCESS_LOG_INTERVAL_MS = 30_000;
const shadowDiagnostics = {
  completed: 0,
  timedOut: 0,
  failed: 0,
  suppressedSuccess: 0,
  suppressedTimeout: 0,
  suppressedFailure: 0,
  lastSuccessLogAt: 0,
  lastTimeoutLogAt: 0,
  lastFailureLogAt: 0,
};

function elapsedMs(startedAt) {
  return Math.max(0, Date.now() - startedAt);
}

function numericTiming(value) {
  if (value === undefined || value === null) return null;
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function capturePoolSnapshot(timings, phase, db) {
  if (!timings) return;
  timings[`pool_total_${phase}`] = numericTiming(db?.totalCount);
  timings[`pool_idle_${phase}`] = numericTiming(db?.idleCount);
  timings[`pool_waiting_${phase}`] = numericTiming(db?.waitingCount);
}

function compactShadowTimings(timings = {}) {
  return {
    pool_wait_ms: numericTiming(timings.pool_wait_ms),
    pool_total_before: numericTiming(timings.pool_total_before),
    pool_idle_before: numericTiming(timings.pool_idle_before),
    pool_waiting_before: numericTiming(timings.pool_waiting_before),
    pool_total_acquired: numericTiming(timings.pool_total_acquired),
    pool_idle_acquired: numericTiming(timings.pool_idle_acquired),
    pool_waiting_acquired: numericTiming(timings.pool_waiting_acquired),
    pool_total_released: numericTiming(timings.pool_total_released),
    pool_idle_released: numericTiming(timings.pool_idle_released),
    pool_waiting_released: numericTiming(timings.pool_waiting_released),
    setup_ms: numericTiming(timings.setup_ms),
    begin_ms: numericTiming(timings.begin_ms),
    set_timeout_ms: numericTiming(timings.set_timeout_ms),
    context_ms: numericTiming(timings.context_ms),
    context_location_ms: numericTiming(timings.context_location_ms),
    context_dictionaries_ms: numericTiming(timings.context_dictionaries_ms),
    context_product_ms: numericTiming(timings.context_product_ms),
    context_intent_geo_ms: numericTiming(timings.context_intent_geo_ms),
    scope_ms: numericTiming(timings.scope_ms),
    scope_primary_cache_get_ms: numericTiming(timings.scope_primary_cache_get_ms),
    scope_primary_query_ms: numericTiming(timings.scope_primary_query_ms),
    scope_primary_cache_set_ms: numericTiming(timings.scope_primary_cache_set_ms),
    scope_baseline_ms: numericTiming(timings.scope_baseline_ms),
    scope_baseline_cache_get_ms: numericTiming(timings.scope_baseline_cache_get_ms),
    scope_baseline_query_ms: numericTiming(timings.scope_baseline_query_ms),
    scope_baseline_cache_set_ms: numericTiming(timings.scope_baseline_cache_set_ms),
    scope_finalize_ms: numericTiming(timings.scope_finalize_ms),
    query_build_ms: numericTiming(timings.query_build_ms),
    comparison_query_ms: numericTiming(timings.comparison_query_ms),
    query_pair_ms: numericTiming(timings.query_pair_ms),
    count_settle_ms: numericTiming(timings.count_settle_ms),
    first_result_settle_ms: numericTiming(timings.first_result_settle_ms),
    transaction_work_ms: numericTiming(timings.transaction_work_ms),
    work_result_ms: numericTiming(timings.work_result_ms),
    rollback_ms: numericTiming(timings.rollback_ms),
    race_ms: numericTiming(timings.race_ms),
    settled_total_ms: numericTiming(timings.settled_total_ms),
    telemetry_ms: numericTiming(timings.telemetry_ms),
    total_with_telemetry_ms: numericTiming(timings.total_with_telemetry_ms),
  };
}

function noteShadowPerformanceDiagnostic(kind, timings, meta = {}) {
  if (process.env.NODE_ENV !== "production") return;

  const now = Date.now();
  const isSuccess = kind === "success";
  const isTimeout = kind === "timeout";
  const interval = isSuccess
    ? SHADOW_DIAGNOSTIC_SUCCESS_LOG_INTERVAL_MS
    : SHADOW_DIAGNOSTIC_TIMEOUT_LOG_INTERVAL_MS;
  const lastKey = isSuccess
    ? "lastSuccessLogAt"
    : isTimeout
      ? "lastTimeoutLogAt"
      : "lastFailureLogAt";
  const suppressedKey = isSuccess
    ? "suppressedSuccess"
    : isTimeout
      ? "suppressedTimeout"
      : "suppressedFailure";

  if (now - shadowDiagnostics[lastKey] < interval) {
    shadowDiagnostics[suppressedKey] += 1;
    return;
  }

  shadowDiagnostics[lastKey] = now;
  const suppressedSinceLast = shadowDiagnostics[suppressedKey];
  shadowDiagnostics[suppressedKey] = 0;

  const payload = {
    outcome: kind,
    completed_total: shadowDiagnostics.completed,
    timed_out_total: shadowDiagnostics.timedOut,
    failed_total: shadowDiagnostics.failed,
    suppressed_since_last: suppressedSinceLast,
    budget_ms: SHADOW_TIMEOUT_MS,
    profile: meta.profile || null,
    geo_mode: meta.geo_mode || null,
    cache_backend: meta.cache_backend || null,
    cache_hit: meta.cache_hit === true,
    ...compactShadowTimings(timings),
  };

  const message = "[search-policy] shadow performance diagnostic";
  if (isSuccess) logger.info(payload, message);
  else logger.warn(payload, message);
}

function noteShadowUnsupported(params) {
  shadowNotCounted.unsupported += 1;
  for (const p of params) {
    shadowNotCounted.unsupportedByParam.set(
      p,
      (shadowNotCounted.unsupportedByParam.get(p) || 0) + 1
    );
  }
  const now = Date.now();
  if (now - shadowNotCounted.lastUnsupportedLogAt >= SHADOW_NOT_COUNTED_LOG_INTERVAL_MS) {
    shadowNotCounted.lastUnsupportedLogAt = now;
    logger.info(
      {
        skipped_total: shadowNotCounted.unsupported,
        by_param: Object.fromEntries(shadowNotCounted.unsupportedByParam),
      },
      "[search-policy] shadow pulado por parâmetros não modelados — sem search.executed"
    );
  }
}

function noteShadowTimeout() {
  shadowNotCounted.timedOut += 1;
  const now = Date.now();
  if (now - shadowNotCounted.lastTimeoutLogAt >= SHADOW_NOT_COUNTED_LOG_INTERVAL_MS) {
    shadowNotCounted.lastTimeoutLogAt = now;
    logger.warn(
      { timed_out_total: shadowNotCounted.timedOut, budget_ms: SHADOW_TIMEOUT_MS },
      "[search-policy] shadow estourou o orçamento — sem search.executed"
    );
  }
}

/** Só para testes/diagnóstico: estado do limitador do shadow. */
export const __shadowTesting = Object.freeze({
  inFlight: () => shadowState.inFlight,
  skippedSaturated: () => shadowState.skippedSaturated,
  skippedPoolPressure: () => shadowState.skippedPoolPressure,
  skippedUnsupported: () => shadowNotCounted.unsupported,
  skippedUnsupportedByParam: () => Object.fromEntries(shadowNotCounted.unsupportedByParam),
  timedOut: () => shadowNotCounted.timedOut,
  reset() {
    shadowState.inFlight = 0;
    shadowState.skippedSaturated = 0;
    shadowState.skippedPoolPressure = 0;
    shadowState.lastSaturationWarnAt = 0;
    shadowState.lastPoolPressureWarnAt = 0;
    shadowNotCounted.unsupported = 0;
    shadowNotCounted.unsupportedByParam.clear();
    shadowNotCounted.timedOut = 0;
    shadowNotCounted.lastUnsupportedLogAt = 0;
    shadowNotCounted.lastTimeoutLogAt = 0;
    shadowDiagnostics.completed = 0;
    shadowDiagnostics.timedOut = 0;
    shadowDiagnostics.failed = 0;
    shadowDiagnostics.suppressedSuccess = 0;
    shadowDiagnostics.suppressedTimeout = 0;
    shadowDiagnostics.suppressedFailure = 0;
    shadowDiagnostics.lastSuccessLogAt = 0;
    shadowDiagnostics.lastTimeoutLogAt = 0;
    shadowDiagnostics.lastFailureLogAt = 0;
  },
});

/** 57014 = query_canceled (statement_timeout) — esperado no shadow, não é falha. */
function isStatementTimeout(err) {
  return String(err?.code) === "57014";
}

/**
 * Executa `fn(client)` num client dedicado, em transação READ ONLY, com
 * `statement_timeout` LOCAL. BEGIN + SET LOCAL seguem no MESMO round-trip:
 * o diagnóstico de produção mostrou saltos de ~90–100 ms em comandos triviais,
 * então dois round-trips de setup consumiam até 2/3 do orçamento sem executar
 * a comparação. O literal é constante do código — não há input do usuário.
 *
 * O shadow só lê: ROLLBACK zera o limite antes de o client voltar ao pool. Se
 * o próprio ROLLBACK falhar, o client é DESTRUÍDO (release(err)) em vez de
 * devolvido em estado incerto.
 */
export async function withShadowStatementTimeout(db, fn, timings = null) {
  capturePoolSnapshot(timings, "before", db);
  let stepStarted = Date.now();
  const client = await db.connect();
  if (timings) timings.pool_wait_ms = elapsedMs(stepStarted);
  capturePoolSnapshot(timings, "acquired", db);

  let releaseErr;
  let workStarted;
  try {
    stepStarted = Date.now();
    await client.query(
      `BEGIN READ ONLY; SET LOCAL statement_timeout = '${SHADOW_STATEMENT_TIMEOUT_MS}ms'`
    );
    if (timings) timings.setup_ms = elapsedMs(stepStarted);

    workStarted = Date.now();
    return await fn(client);
  } finally {
    if (timings && workStarted != null) timings.transaction_work_ms = elapsedMs(workStarted);

    stepStarted = Date.now();
    try {
      await client.query("ROLLBACK");
    } catch (err) {
      releaseErr = err;
    } finally {
      if (timings) timings.rollback_ms = elapsedMs(stepStarted);
    }
    client.release(releaseErr);
    capturePoolSnapshot(timings, "released", db);
  }
}

/** Campos que o v1 acrescenta ao contrato slim da listagem (§5.5, §6). */
export const V1_EXTRA_LISTING_FIELDS = Object.freeze([
  "explain",
  "distance_km",
  "commercial_model",
]);

function clampPage(v) {
  return Math.max(1, Number(v) || 1);
}
function clampLimit(v) {
  return Math.min(
    ADS_FILTER_LIMITS.LIMIT_MAX,
    Math.max(1, Number(v) || ADS_FILTER_LIMITS.DEFAULT_LIMIT)
  );
}

/**
 * Monta o SearchContext a partir dos parâmetros brutos da URL.
 * @param {object} rawQuery
 * @param {{ db?, policy? }} deps
 */
export async function buildSearchContext(rawQuery = {}, deps = {}) {
  const db = deps.db || pool;
  const policy = deps.policy || (await loadSearchPolicy());
  const timings = deps.timings || null;

  let stepStarted = Date.now();
  const location = await resolveLocation(rawQuery, policy, { db });
  if (timings) timings.context_location_ms = elapsedMs(stepStarted);

  stepStarted = Date.now();
  const [brands, commercialModels] = await Promise.all([
    getBrandDictionary(db),
    getCommercialModelDictionary(db),
  ]);
  if (timings) timings.context_dictionaries_ms = elapsedMs(stepStarted);

  stepStarted = Date.now();
  const product = resolveProduct(location.q, rawQuery, { brands, commercialModels });
  const filters = { ...product.filters };
  if (product.residual_q) filters.q = product.residual_q;
  if (timings) timings.context_product_ms = elapsedMs(stepStarted);

  stepStarted = Date.now();
  const intent = resolveIntent(filters, product.residual_q, policy);
  const geoRequest = resolveGeoRequest(rawQuery, policy, Boolean(location.origin), {
    uf: location.uf,
  });
  if (timings) timings.context_intent_geo_ms = elapsedMs(stepStarted);

  const sortRaw = String(rawQuery.sort || "relevance")
    .trim()
    .toLowerCase();
  return {
    rawQuery,
    rawQ: typeof rawQuery.q === "string" ? rawQuery.q : null,
    page: clampPage(rawQuery.page),
    limit: clampLimit(rawQuery.limit),
    sort: isAllowedAdsSort(sortRaw) ? sortRaw : "relevance",
    filters,
    consumed: product.consumed,
    origin: location.origin,
    location_source: location.location_source,
    uf: location.uf,
    intent,
    geoRequest,
    policy,
  };
}

/** ORDER BY do v1 (§4.5). Só `relevance` muda; os demais seguem o legado. */
export function buildEngineSortClause(sort, { hasOrigin, hasText, cityShareCap = null }) {
  if (sort !== "relevance") return buildSortClause(sort, { useTextRank: false });
  const parts = [`${commercialLayerExpr} DESC`];
  const tail = [];
  if (hasOrigin) tail.push("COALESCE(rm.distance_km, 0) ASC");
  if (hasText) tail.push("text_rank DESC");
  tail.push("a.created_at DESC", "a.id ASC");
  // DEC-29 — o teto por cidade entra DEPOIS do peso comercial e antes da
  // distância. Dentro da faixa de peso ele diversifica; entre faixas, quem
  // manda continua sendo DEC-07. Sem isso, um grátis da própria cidade subiria
  // acima de anúncios pagos da vizinha assim que o teto mordesse — foi o que a
  // primeira versão desta implementação fez, e o teste 8.4 pegou.
  const slot = cityShareCap ? [cityShareCapExpr(cityShareCap, parts.concat(tail))] : [];
  return [...parts, ...slot, ...tail].join(",\n      ");
}

export const CITY_SHARE_CAP_DEFAULT = 0.4;

/** Fração configurada do teto (DEC-29), com o default quando o valor não serve. Puro. */
export function cityShareCapRatio(policy) {
  const configured = Number(policy?.city_share_cap);
  return Number.isFinite(configured) && configured > 0 && configured < 1
    ? configured
    : CITY_SHARE_CAP_DEFAULT;
}

/**
 * DEC-29 — teto de participação por cidade externa. NÃO é chave primária: entra
 * DEPOIS do peso comercial e antes da distância (ver `buildEngineSortClause`),
 * e é aplicado antes de LIMIT/OFFSET (v2.0 §37: nada de re-sort depois da
 * paginação).
 *
 * Cada anúncio recebe um "turno": a origem é sempre turno 1, e uma cidade
 * externa distribui seus anúncios em turnos de `cap` em `cap`, na ordem de
 * DEC-07. Ordenar por turno e, dentro dele, por DEC-07 produz três coisas ao
 * mesmo tempo:
 *
 *   • enquanto houver candidato de outra cidade no turno 1, a cidade grande não
 *     passa de `cap` vagas — o teto morde;
 *   • quando NÃO houver alternativa, os turnos seguintes preenchem a mesma
 *     página — distribuição, não truncamento, e a página não encolhe;
 *   • a origem nunca é rebaixada, porque seu turno é sempre o primeiro.
 *
 * O teto é POR FAIXA de peso, e o denominador é a CAPACIDADE da faixa: o menor
 * entre o tamanho da página e quantos candidatos daquela faixa existem no
 * CandidateScope, nunca menos que 1. Medir contra as vagas que a faixa ocupa na
 * página seria circular — essas vagas dependem da ordenação, que depende do
 * teto —, e medir contra a página inteira faria o teto quase nunca morder numa
 * faixa pequena: numa página de 24, uma cidade externa levaria 9 dos 10 únicos
 * Destaques. Pela capacidade, leva 4. O `COUNT(*) OVER (PARTITION BY faixa)`
 * roda na mesma varredura e mantém a ordenação global, que é o que faz o
 * adiamento atravessar as páginas.
 */
export function cityShareCapExpr(
  { originCityId, ratio, pageLimit, bandExpr, textRankExpr },
  orderParts
) {
  const origin = Number(originCityId);
  const share = Number(ratio);
  const limit = Math.max(1, Number(pageLimit) || 0);
  // Dentro de OVER(...) não vale alias de SELECT: `text_rank` volta a ser a
  // expressão. Fora dele, o alias continua.
  const windowOrder = orderParts
    .join(", ")
    .replace(/text_rank/g, `(${textRankExpr})`)
    .replace(/\s+/g, " ")
    .trim();
  const band = bandExpr.replace(/\s+/g, " ").trim();
  const capacity = `LEAST(${limit}, COUNT(*) OVER (PARTITION BY ${band}))`;
  const cap = `GREATEST(1, FLOOR(${share} * ${capacity}))`;
  return (
    `CASE WHEN a.city_id = ${origin} THEN 1\n` +
    `           ELSE CEIL((ROW_NUMBER() OVER (PARTITION BY a.city_id, ${band} ORDER BY ${windowOrder}))::numeric / ${cap})\n` +
    `      END ASC`
  );
}

/**
 * Chips de OFERTAS — Destaques, Oportunidades, Abaixo da FIPE (F3-B).
 *
 * Não são facetas adaptativas: não competem por `open_max`, não têm entropia e
 * a sidebar sempre os desenha no mesmo bloco fixo. Por isso saem num bloco
 * próprio (`offer_counts`) em vez de entrar no array de facetas.
 *
 * As EXPRESSÕES são as mesmas de `ads-filter.facets.js` de propósito: o número
 * tem de significar a mesma coisa nos dois caminhos. O que muda é só o escopo —
 * aqui é o CandidateScope com o território efetivo (DEC-08), lá é o escopo da
 * cidade. Era exatamente essa divergência que fazia "Abaixo da FIPE (9)"
 * aparecer ao lado de um grid regional de 4 resultados.
 */
const OFFER_COUNT_EXPRS = Object.freeze({
  highlight: `${commercialLayerExpr} = 4`,
  opportunity: opportunityExpr,
  below_fipe: "a.below_fipe = true",
});

/** Filtro interno que cada chip representa (self-excluding, DEC-13). */
const OFFER_FILTER_KEYS = Object.freeze({
  highlight: "priority_tier",
  opportunity: "opportunity",
  below_fipe: "below_fipe",
});

export const OFFER_COUNT_KEYS = Object.freeze(Object.keys(OFFER_COUNT_EXPRS));

/** Colunas `offer_*` para embutir na countQuery — zero round-trip a mais. */
export function offerCountColumns() {
  return OFFER_COUNT_KEYS.map(
    (key) => `COUNT(*) FILTER (WHERE ${OFFER_COUNT_EXPRS[key]})::int AS offer_${key}`
  ).join(",\n           ");
}

/**
 * Chips que precisam de uma query própria para respeitar a DEC-13.
 *
 * Nem todo filtro ativo precisa: contar `X` dentro de um escopo já restrito a
 * `X` dá o MESMO número que contar `X` sem a restrição — é a mesma interseção.
 * A self-exclusion só muda a resposta quando o filtro ativo NEGA a condição
 * contada, e aí sem ela o chip diria 0:
 *
 *   • `below_fipe=false` na URL   → zeraria "Abaixo da FIPE"
 *   • `priority_tier` 1, 2 ou 3   → zeraria "Destaques" (que conta a camada 4)
 *
 * `opportunity` só entra no WHERE quando é `true`, que é exatamente a condição
 * contada — nunca precisa. Na prática os três chips da sidebar mandam
 * `below_fipe=true`, `opportunity=true` e `priority_tier=4`, então a interação
 * normal do usuário não gasta nenhuma query extra.
 */
export function activeOfferKeys(filters = {}) {
  const keys = [];
  if (filters.below_fipe !== undefined && Boolean(filters.below_fipe) !== true) {
    keys.push("below_fipe");
  }
  if (filters.priority_tier !== undefined && Number(filters.priority_tier) !== 4) {
    keys.push("highlight");
  }
  return keys;
}

/**
 * Contagem de UM chip ativo, sem a própria restrição (DEC-13, self-excluding).
 * Sem isto, "Abaixo da FIPE" ativo mostraria o total do próprio filtro em vez
 * de quantos anúncios o chip alcança — e o usuário perderia a informação de
 * que existe algo fora dele.
 */
export function buildOfferCountQuery(scopeCtx, key) {
  const scope = buildCandidateScope(scopeCtx, { exclude: [OFFER_FILTER_KEYS[key]] });
  return {
    sql: `
    SELECT COUNT(*) FILTER (WHERE ${OFFER_COUNT_EXPRS[key]})::int AS count
    FROM ads a ${scope.joins}
    ${scope.whereClause}`,
    params: scope.params,
  };
}

/**
 * dataQuery + countQuery a partir do MESMO CandidateScope (§4.1).
 * countParams = só os parâmetros do WHERE (snapshot antes de rm/limit/offset).
 */
export function buildEngineQueries(ctx, scope) {
  const scopeCtx = { filters: ctx.filters, territory: scope.territory };
  const candidate = buildCandidateScope(scopeCtx);
  const whereParamsLength = candidate.params.length;
  const bag = candidate.bag;
  const hasOrigin =
    Boolean(ctx.origin) &&
    scope.geo_mode !== GEO_MODE.NATIONAL &&
    scope.geo_mode !== GEO_MODE.STATE;

  const rmJoin = hasOrigin
    ? `LEFT JOIN region_memberships rm ON rm.base_city_id = ${bag.p(Number(ctx.origin.id))} AND rm.member_city_id = a.city_id`
    : "";
  const textRank = candidate.qParam
    ? `ts_rank(a.search_vector, plainto_tsquery('portuguese', ${candidate.qParam}))`
    : "0";
  // O teto só vale na ordenação de política (relevance) e com origem: nas
  // ordenações escolhidas pelo usuário (preço, ano, km) quem manda é ele.
  const orderBy = buildEngineSortClause(ctx.sort, {
    hasOrigin,
    hasText: Boolean(candidate.qParam),
    cityShareCap:
      hasOrigin && ctx.sort === "relevance"
        ? {
            originCityId: ctx.origin.id,
            ratio: cityShareCapRatio(ctx.policy),
            pageLimit: ctx.limit,
            bandExpr: commercialLayerExpr,
            textRankExpr: textRank,
          }
        : null,
  });
  const limitP = bag.p(ctx.limit);
  const offsetP = bag.p((ctx.page - 1) * ctx.limit);

  const dataQuery = `
    SELECT
      a.*,
      c.slug AS city_slug,
      c.name AS city_name,
      adv.name         AS seller_name,
      adv.company_name AS dealership_name,
      adv.id           AS dealership_id,
      u.document_type  AS account_type,
      ${commercialLayerExpr} AS priority_tier,
      ${opportunityExpr} AS opportunity,
      ${textRank} AS text_rank,
      ${hasOrigin ? "COALESCE(rm.distance_km, 0)::float" : "NULL::float"} AS distance_km
    FROM ads a ${candidate.joins}
    ${rmJoin}
    ${candidate.whereClause}
    ORDER BY ${orderBy}
    LIMIT ${limitP}
    OFFSET ${offsetP}`;

  // seller_count (DEC-27 / V3-INV-052) sai da MESMA query de `total`: mesmo
  // CandidateScope, mesmo território, antes do LIMIT/OFFSET, sem peso comercial
  // e sem round-trip a mais.
  // Os três chips de OFERTAS (F3-B) entram na mesma varredura, pelo mesmo
  // motivo: mesmo CandidateScope, mesmo território, sem round-trip a mais.
  const countQuery = `
    SELECT COUNT(*)::int AS total,
           COUNT(DISTINCT a.advertiser_id)::int AS seller_count,
           ${offerCountColumns()}
    FROM ads a ${candidate.joins}
    ${candidate.whereClause}`;

  return {
    dataQuery,
    countQuery,
    params: bag.params,
    countParams: bag.params.slice(0, whereParamsLength),
    candidate,
    scopeCtx,
  };
}

function buildShadowCandidateSortClause(sort, { hasOrigin, hasText }) {
  switch (sort) {
    case "recent":
      return "created_at DESC, id DESC";
    case "price_asc":
      return "price ASC NULLS LAST, created_at DESC";
    case "price_desc":
      return "price DESC NULLS LAST, created_at DESC";
    case "year_desc":
      return "year DESC NULLS LAST, created_at DESC";
    case "year_asc":
      return "year ASC NULLS LAST, created_at DESC";
    case "mileage_asc":
      return "mileage ASC NULLS LAST, created_at DESC";
    case "mileage_desc":
      return "mileage DESC NULLS LAST, created_at DESC";
    case "highlight":
      return `
        highlight_active DESC,
        priority DESC NULLS LAST,
        created_at DESC
      `;
    case "relevance":
    default: {
      const parts = ["commercial_layer DESC"];
      if (hasOrigin) parts.push("distance_km ASC");
      if (hasText) parts.push("text_rank DESC");
      parts.push("created_at DESC", "id ASC");
      return parts.join(",\n        ");
    }
  }
}

/**
 * Shadow: total + seller_count + primeiro id em UM único statement e UMA única
 * avaliação materializada do CandidateScope.
 *
 * Antes, `summary` e `first_match` repetiam o mesmo FROM/JOIN/WHERE dentro
 * do statement. Em produção isso deixou o planejamento/execução vulnerável a
 * picos de ~300-400 ms mesmo com apenas dezenas de anúncios ativos. O CTE
 * MATERIALIZED calcula o conjunto elegível uma vez; a contagem e o primeiro
 * resultado leem essa pequena relação intermediária.
 *
 * A ordenação abaixo é um espelho estrutural de buildEngineSortClause /
 * buildSortClause, mas aplicada às colunas já materializadas.
 */
export function buildShadowComparisonQuery(ctx, scope) {
  const scopeCtx = { filters: ctx.filters, territory: scope.territory };
  const candidate = buildCandidateScope(scopeCtx);
  const bag = candidate.bag;
  const hasOrigin =
    Boolean(ctx.origin) &&
    scope.geo_mode !== GEO_MODE.NATIONAL &&
    scope.geo_mode !== GEO_MODE.STATE;

  const rmJoin = hasOrigin
    ? `LEFT JOIN region_memberships rm ON rm.base_city_id = ${bag.p(Number(ctx.origin.id))} AND rm.member_city_id = a.city_id`
    : "";
  const textRank = candidate.qParam
    ? `ts_rank(a.search_vector, plainto_tsquery('portuguese', ${candidate.qParam}))`
    : "0";
  const orderBy = buildShadowCandidateSortClause(ctx.sort, {
    hasOrigin,
    hasText: Boolean(candidate.qParam),
  });

  const query = `
    WITH candidates AS MATERIALIZED (
      SELECT
        a.id,
        a.advertiser_id,
        a.created_at,
        a.price,
        a.year,
        a.mileage,
        a.priority,
        (CASE WHEN a.highlight_until > NOW() THEN 1 ELSE 0 END) AS highlight_active,
        ${commercialLayerExpr} AS commercial_layer,
        ${textRank} AS text_rank,
        ${hasOrigin ? "COALESCE(rm.distance_km, 0)::float" : "NULL::float"} AS distance_km
      FROM ads a ${candidate.joins}
      ${rmJoin}
      ${candidate.whereClause}
    ),
    summary AS (
      SELECT COUNT(*)::int AS total,
             COUNT(DISTINCT advertiser_id)::int AS seller_count
      FROM candidates
    ),
    first_match AS (
      SELECT id
      FROM candidates
      ORDER BY ${orderBy}
      LIMIT 1
    )
    SELECT summary.total,
           summary.seller_count,
           first_match.id AS first_ad_id
    FROM summary
    LEFT JOIN first_match ON TRUE`;

  return {
    query,
    params: bag.params,
    candidate,
    scopeCtx,
  };
}

function tierLabel(priorityTier) {
  const n = Number(priorityTier);
  if (n >= 4) return "Destaque";
  if (n >= 3) return "Pró";
  if (n >= 2) return "Start";
  return "Grátis";
}

/** Linha explicativa do card (§5.5). */
export function buildExplain(row) {
  const below = row.below_fipe === true;
  const diff = row.fipe_diff_percent == null ? null : Number(row.fipe_diff_percent);
  return {
    tier_label: tierLabel(row.priority_tier),
    city_name: row.city_name || row.city || null,
    distance_km: row.distance_km == null ? null : Number(Number(row.distance_km).toFixed(2)),
    fipe_diff_percent: below && Number.isFinite(diff) ? diff : null,
  };
}

function echoFilters(ctx) {
  return {
    page: ctx.page,
    limit: ctx.limit,
    sort: ctx.sort,
    q: ctx.rawQ || undefined,
    city_slug: ctx.origin?.slug,
    origem: ctx.origin?.slug,
    free_query_meta: {
      original_q: ctx.rawQ || null,
      parsed: Boolean(ctx.rawQ),
      safe: true,
      inferred: { ...ctx.filters, city_slug: ctx.origin?.slug || null },
    },
  };
}

function buildSearchPolicyBlock(ctx, scope, total, flagMode) {
  const withOrigin = scope.geo_mode !== GEO_MODE.NATIONAL && scope.geo_mode !== GEO_MODE.STATE;
  return {
    version: ctx.policy.version,
    flag_mode: flagMode,
    profile: ctx.intent.profile,
    specificity: ctx.intent.specificity,
    geo_mode: scope.geo_mode,
    origin_city: ctx.origin
      ? { slug: ctx.origin.slug, name: ctx.origin.name, state: ctx.origin.state }
      : null,
    location_source: ctx.location_source,
    requested_radius_km: scope.requested_radius_km,
    // F2.2-A2 (v3 §4/§26): houve raio explícito válido na URL. Descreve o
    // PEDIDO, não o resultado — em GEO_FALLBACK continua true com
    // effective_radius_km 0, e quem distingue é `reason`. É o que permite ao
    // F3 declarar o raio exato em vez do degrau mais próximo (INV-055).
    user_geo_explicit: scope.user_geo_explicit === true,
    required_distance_km: scope.required_distance_km,
    effective_radius_km: withOrigin ? scope.effective_radius_km : null,
    cities: scope.cities,
    territory_city_count: scope.territory_city_count,
    rings: withOrigin ? scope.rings : [],
    local_result_count: scope.local_result_count,
    total_result_count: total,
    target: ctx.intent.target,
    expanded: scope.expanded,
    reason: scope.reason,
    uf: scope.geo_mode === GEO_MODE.STATE ? ctx.uf : undefined,
  };
}

/**
 * Executa o motor (v1) e devolve a resposta completa (§6).
 * @param {object} rawQuery
 * @param {{ flagMode?: string, path?: string, db?, cache?: boolean, telemetry?: boolean }} opts
 */
export async function runSearchPolicyEngine(rawQuery, opts = {}) {
  const db = opts.db || pool;
  const flagMode = opts.flagMode || "v1";
  const started = Date.now();

  const ctx = await buildSearchContext(rawQuery, { db, policy: opts.policy });
  const scope = await resolveScope(ctx, ctx.policy, { db, cache: opts.cache });
  const queries = buildEngineQueries(ctx, scope);

  // Chip de oferta ATIVO conta sem a própria restrição (DEC-13). No caso comum
  // — nenhum ativo — isto é uma lista vazia e nenhuma query extra.
  const offerActive = activeOfferKeys(ctx.filters);
  const offerQueries = offerActive.map((key) => buildOfferCountQuery(queries.scopeCtx, key));

  const [dataResult, countResult, facetsResult, ...offerResults] = await Promise.all([
    db.query(queries.dataQuery, queries.params),
    db.query(queries.countQuery, queries.countParams),
    computeFacets(queries.scopeCtx, ctx.policy, { db }),
    ...offerQueries.map((q) => db.query(q.sql, q.params)),
  ]);
  const total = Number(countResult.rows[0]?.total || 0);
  const sellerCount = Number(countResult.rows[0]?.seller_count || 0);

  const offerCounts = Object.fromEntries(
    OFFER_COUNT_KEYS.map((key) => [key, Number(countResult.rows[0]?.[`offer_${key}`] || 0)])
  );
  offerActive.forEach((key, i) => {
    offerCounts[key] = Number(offerResults[i]?.rows[0]?.count || 0);
  });

  const relax = await computeRelaxations(ctx, scope, total, ctx.policy, { db, cache: opts.cache });

  const normalized = await normalizePublicAdRows(dataResult.rows);
  const withExplain = normalized.map((row, i) => ({
    ...row,
    distance_km: dataResult.rows[i]?.distance_km ?? null,
    explain: buildExplain({ ...dataResult.rows[i], ...row }),
  }));
  const items = serializeAdsForListing(withExplain, {
    extraAllowedFields: V1_EXTRA_LISTING_FIELDS,
  });

  const response = {
    ok: true,
    filters: echoFilters(ctx),
    data: items,
    pagination: {
      page: ctx.page,
      limit: ctx.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / ctx.limit)),
    },
    search_policy: buildSearchPolicyBlock(ctx, scope, total, flagMode),
    chips: buildChips(ctx, scope),
    facets: facetsResult.facets,
    offer_counts: offerCounts,
    relaxations: relax.relaxations,
  };

  if (opts.telemetry !== false) {
    const payload = buildSearchExecutedPayload({
      ctx,
      scope,
      total,
      sellerCount,
      relaxations: relax.relaxations,
      flagMode,
      policy: ctx.policy,
      cacheBackend: policyCacheBackend(),
    });
    payload.engine_ms = Date.now() - started;
    payload.queries = 2 + facetsResult.queries + relax.queries + 1 + offerQueries.length;
    recordSearchExecuted({ path: opts.path, ctx, payload }, { db }).catch(() => {});
  }

  return response;
}

/**
 * v1 só quando a origem resolvida está na allowlist; senão devolve null e o
 * controller segue o caminho legado (comportamento `off` para a requisição).
 */
/**
 * §4.9 — o motor só assume requisições que modela por completo. Chaves do
 * contrato legado que mudam o resultado e que o v1 NÃO traduz ficam no caminho
 * legado (em v1) e viram evento `skipped` (em shadow):
 *   model          ILIKE na descrição FIPE (ads.model); o v1 filtra por
 *                  commercial_model — F3 mapeia o filtro de modelo do frontend.
 *   highlight_only / highlight / featured   WHERE highlight_until > NOW()
 *                  (widget "Destaques" da home).
 *   city / seller_type   aliases legados normalizados pelo parser antigo.
 *   city_slugs com 2+ cidades   lista fechada da Página Regional — semântica
 *                  distinta do raio automático a partir de city_slugs[0].
 */
export const ENGINE_LEGACY_ONLY_KEYS = Object.freeze([
  "model",
  "highlight_only",
  "highlight",
  "featured",
  "city",
  "seller_type",
]);

function hasValue(v) {
  if (v === undefined || v === null) return false;
  if (Array.isArray(v)) return v.length > 0;
  return String(v).trim() !== "";
}

export function findUnsupportedParams(rawQuery = {}) {
  const found = ENGINE_LEGACY_ONLY_KEYS.filter((key) => hasValue(rawQuery[key]));
  const slugs = rawQuery.city_slugs;
  const slugCount = Array.isArray(slugs)
    ? slugs.filter(hasValue).length
    : typeof slugs === "string"
      ? slugs.split(",").filter((x) => x.trim()).length
      : 0;
  if (slugCount > 1) found.push("city_slugs");
  return found;
}

export async function runSearchPolicyEngineIfAllowed(rawQuery, opts = {}) {
  if (findUnsupportedParams(rawQuery).length > 0) return null;
  const ctx = await buildSearchContext(rawQuery, { db: opts.db, policy: opts.policy });
  if (!isOriginAllowed(ctx.origin?.slug)) return null;
  return runSearchPolicyEngine(rawQuery, { ...opts, policy: ctx.policy });
}

/**
 * Shadow (§4.9): scope + count + primeiro id, com timeout de 300 ms, e
 * telemetria com old/new. Nunca lança; nunca altera a resposta.
 */
export async function runShadowComparison(rawQuery, legacyResult, opts = {}) {
  const db = opts.db || pool;
  const started = Date.now();
  const unsupported = findUnsupportedParams(rawQuery);
  if (unsupported.length > 0) {
    const shadow = {
      old_count: Number(legacyResult?.pagination?.total ?? 0),
      old_first_ad_id: legacyResult?.data?.[0]?.id ?? null,
      new_count: null,
      new_first_ad_id: null,
      elapsed_ms: Date.now() - started,
    };
    // O motor não roda: não há CandidateScope, logo não há search.executed.
    noteShadowUnsupported(unsupported);
    return { ...shadow, timedOut: false, skipped: true, unsupported_params: unsupported };
  }
  // Limitador: excedente é descartado na hora — sem fila, sem conexão, sem
  // INSERT de telemetria (gravar evento justamente sob saturação pioraria o
  // que se quer proteger). Contado e avisado no máximo 1×/min.
  if (shadowState.inFlight >= getShadowMaxConcurrency()) {
    shadowState.skippedSaturated += 1;
    const now = Date.now();
    if (now - shadowState.lastSaturationWarnAt >= SHADOW_SATURATION_WARN_INTERVAL_MS) {
      shadowState.lastSaturationWarnAt = now;
      logger.warn(
        { skipped_total: shadowState.skippedSaturated, max: getShadowMaxConcurrency() },
        "[search-policy] shadow saturado — comparações descartadas"
      );
    }
    return { timedOut: false, skipped: true, skipped_reason: "shadow_saturated" };
  }
  // Segunda barreira: o teto de Shadow não sabe se o pool já está ocupado por
  // tráfego normal. Se não há idle e o pool já está cheio/em fila, o Shadow é
  // descartado ANTES de db.connect(). Observabilidade nunca disputa a última
  // conexão com a resposta pública.
  if (poolHasShadowPressure(db)) {
    shadowState.skippedPoolPressure += 1;
    const now = Date.now();
    if (now - shadowState.lastPoolPressureWarnAt >= SHADOW_SATURATION_WARN_INTERVAL_MS) {
      shadowState.lastPoolPressureWarnAt = now;
      logger.warn(
        {
          skipped_total: shadowState.skippedPoolPressure,
          pool_total: Number(db?.totalCount) || 0,
          pool_idle: Number(db?.idleCount) || 0,
          pool_waiting: Number(db?.waitingCount) || 0,
          pool_max: Number(db?.options?.max) || null,
        },
        "[search-policy] shadow descartado por pressão do pool"
      );
    }
    return { timedOut: false, skipped: true, skipped_reason: "pool_pressure" };
  }

  // O slot vale a COMPARAÇÃO INTEIRA — trabalho SQL + INSERT de telemetria — e
  // só é devolvido no `finally` lá embaixo. Junto com a espera por `settled`
  // antes da telemetria, isso garante que uma comparação nunca segura duas
  // conexões ao mesmo tempo: o teto N limita conexões, não só comparações.
  shadowState.inFlight += 1;

  const timings = {};
  let timer;
  let publishOperationOutcome;
  let operationOutcomePublished = false;
  const operationOutcome = new Promise((resolve) => {
    publishOperationOutcome = (value) => {
      if (operationOutcomePublished) return;
      operationOutcomePublished = true;
      resolve(value);
    };
  });
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ timedOut: true }), opts.timeoutMs ?? SHADOW_TIMEOUT_MS);
  });
  const work = withShadowStatementTimeout(
    db,
    async (client) => {
      let stepStarted = Date.now();
      const ctx = await buildSearchContext(rawQuery, {
        db: client,
        policy: opts.policy,
        timings,
      });
      timings.context_ms = elapsedMs(stepStarted);

      stepStarted = Date.now();
      const scope = await resolveScope(ctx, ctx.policy, {
        db: client,
        cache: opts.cache,
        // Shadow only needs territorial selection + counters for comparison
        // and telemetry. City labels/rings cost an extra DB round-trip and
        // are discarded before any public response is built.
        includeDetails: false,
        timings,
      });
      timings.scope_ms = elapsedMs(stepStarted);

      stepStarted = Date.now();
      const comparison = buildShadowComparisonQuery({ ...ctx, page: 1, limit: 1 }, scope);
      timings.query_build_ms = elapsedMs(stepStarted);

      const comparisonStarted = Date.now();
      let comparisonResult;
      try {
        comparisonResult = await client.query(comparison.query, comparison.params);
      } catch (error) {
        timings.comparison_query_ms = elapsedMs(comparisonStarted);
        timings.work_result_ms = elapsedMs(started);
        publishOperationOutcome({ error });
        throw error;
      }
      timings.comparison_query_ms = elapsedMs(comparisonStarted);
      const row = comparisonResult.rows[0] || {};

      const outcome = {
        ctx,
        scope,
        new_count: Number(row.total || 0),
        new_seller_count: Number(row.seller_count || 0),
        new_first_ad_id: row.first_ad_id ?? null,
      };
      // O orçamento de 300 ms mede a COMPARAÇÃO, não o housekeeping do
      // ROLLBACK. Publicamos o resultado antes de entrar no finally do helper;
      // a conexão ainda só volta ao pool depois do cleanup.
      timings.work_result_ms = elapsedMs(started);
      publishOperationOutcome(outcome);
      return outcome;
    },
    timings
  );
  // Nunca deixa a rejeição tardia do perdedor (57014 depois que a race já
  // resolveu por timeout) escapar como unhandled rejection.
  const settled = work.then(
    (value) => value,
    (error) => ({ error })
  );
  // Erros ocorridos antes de o callback começar (connect/setup) não passam pelo
  // publish acima. Este fallback os publica quando o helper termina; no caminho
  // normal ele é no-op porque o resultado já foi publicado.
  settled.then((value) => publishOperationOutcome(value));

  try {
    let outcome = await Promise.race([operationOutcome, timeout]);
    const elapsed = Date.now() - started; // o relato é do instante da race
    timings.race_ms = elapsed;
    clearTimeout(timer);
    // O resultado/timeout já foi decidido. Agora esperamos apenas o cleanup
    // transacional terminar antes de pedir outra conexão para telemetria.
    // ROLLBACK lento não retroage e transforma uma comparação concluída dentro
    // do budget em timeout falso.
    await settled;
    timings.settled_total_ms = elapsedMs(started);
    if (outcome.error) {
      // statement_timeout venceu o timer JS: é o mesmo timeout, relatado pelo banco.
      if (!isStatementTimeout(outcome.error)) throw outcome.error;
      outcome = { timedOut: true };
    }
    const shadow = {
      old_count: Number(legacyResult?.pagination?.total ?? 0),
      old_first_ad_id: legacyResult?.data?.[0]?.id ?? null,
      new_count: outcome.timedOut ? null : outcome.new_count,
      new_first_ad_id: outcome.timedOut ? null : outcome.new_first_ad_id,
      elapsed_ms: elapsed,
    };
    if (outcome.timedOut) {
      // A contagem não terminou: sem total/seller_count reais, sem search.executed.
      noteShadowTimeout();
      shadowDiagnostics.timedOut += 1;
      noteShadowPerformanceDiagnostic("timeout", timings, {
        profile: outcome.ctx?.intent?.profile,
        geo_mode: outcome.scope?.geo_mode,
        cache_backend: outcome.scope?.cache?.backend || policyCacheBackend(),
        cache_hit: outcome.scope?.cache?.hit === true,
      });
      return { ...shadow, timedOut: true };
    }
    const ctx = outcome.ctx;
    const payload = buildSearchExecutedPayload({
      ctx,
      scope: outcome.scope,
      total: outcome.new_count,
      sellerCount: outcome.new_seller_count,
      relaxations: [],
      flagMode: "shadow",
      shadow,
      policy: ctx.policy,
      cacheBackend: policyCacheBackend(),
    });
    const telemetryStarted = Date.now();
    await recordSearchExecuted({ path: opts.path, ctx, payload }, { db });
    timings.telemetry_ms = elapsedMs(telemetryStarted);
    timings.total_with_telemetry_ms = elapsedMs(started);

    shadowDiagnostics.completed += 1;
    noteShadowPerformanceDiagnostic("success", timings, {
      profile: ctx.intent?.profile,
      geo_mode: outcome.scope?.geo_mode,
      cache_backend: outcome.scope?.cache?.backend || policyCacheBackend(),
      cache_hit: outcome.scope?.cache?.hit === true,
    });
    return { ...shadow, timedOut: false };
  } catch (err) {
    clearTimeout(timer);
    timings.settled_total_ms ??= elapsedMs(started);
    shadowDiagnostics.failed += 1;
    noteShadowPerformanceDiagnostic("failure", timings);
    logger.warn({ err: err?.message || String(err) }, "[search-policy] shadow falhou");
    return null;
  } finally {
    shadowState.inFlight -= 1;
  }
}
