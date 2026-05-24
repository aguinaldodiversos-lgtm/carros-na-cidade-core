// src/modules/ads/filters/ads-filter.builder.js

import { buildSortClause } from "./ads-filter.sort.js";
import {
  baseCityBoostExpr,
  cityDemandBoostExpr,
  commercialLayerExpr,
  opportunityExpr,
  planRankExpr,
  sellerKindExpr,
} from "./ads-ranking.sql.js";
import { ADS_FILTER_LIMITS } from "./ads-filter.constants.js";
import { AD_STATUS } from "../ads.canonical.constants.js";

/**
 * Guard de produção contra anúncios de teste/seed/deploy/worker/etc
 * vazando para a vitrine pública. Ligado por padrão em `production` e
 * pode ser desligado via `PUBLIC_TEST_AD_FILTER=disabled` para depurar.
 *
 * Detectado em 2026-05-24: produção mostrava cards "Teste alerta",
 * "Carro teste WhatsApp", "Teste fila worker", "DeployModel" no
 * /comprar/estado/sp. Causa: ambientes compartilham banco (ou seed
 * antigo nunca foi limpo).
 *
 * Padrões cobrem:
 *   - title/model/slug/version começando ou contendo as palavras
 *     (case-insensitive): test, teste, seed, deploy, worker, alerta,
 *     fake, dummy, sample.
 *   - "deploymodel" / "deployads" colados (sem espaço).
 *   - seller_name / dealer_name / dealership_name com palavra
 *     "teste"/"fake"/"dummy" como token isolado (regex word-boundary
 *     com `~*` — case-insensitive). Cobre "Auto Center Teste" sem
 *     bloquear lojas reais como "Autotest Performance" (substring
 *     "test" em palavra composta não casa `\\mtest\\M`).
 *
 * Implementação SQL: bloco `NOT (...)` adicionado ao WHERE com `ILIKE`
 * (substring) para title/model/slug e `~*` (regex word-boundary) para
 * campos de nome de vendedor. Sem parâmetros — padrões hardcoded para
 * que o filtro NUNCA dependa de input externo.
 *
 * Política conservadora para nomes de vendedor (briefing P0 2026-05-24):
 *   - "teste" / "fake" / "dummy" só batem como PALAVRA INTEIRA
 *     (`\mteste\M`). Loja "Teste Multimarcas" → bloqueia. "Atestado
 *     Veículos" → NÃO bloqueia (token é "atestado", não "teste").
 *   - "test" (inglês) NÃO entra na lista — alto risco de FP em nomes
 *     brasileiros legítimos (Autotest, Testdrive, etc.).
 *   - "seed"/"deploy"/"worker"/"alerta" NÃO entram em nomes de vendedor —
 *     são marcadores de origem técnica que só aparecem em campos de
 *     anúncio (title/model/slug), nunca em nome de loja real.
 */
const DIRTY_TEST_AD_GUARD_SQL = `
  NOT (
    COALESCE(a.title, '') ILIKE '%test%'
    OR COALESCE(a.title, '') ILIKE '%teste%'
    OR COALESCE(a.title, '') ILIKE '%seed%'
    OR COALESCE(a.title, '') ILIKE '%deploy%'
    OR COALESCE(a.title, '') ILIKE '%worker%'
    OR COALESCE(a.title, '') ILIKE '%alerta%'
    OR COALESCE(a.title, '') ILIKE '%fake%'
    OR COALESCE(a.title, '') ILIKE '%dummy%'
    OR COALESCE(a.title, '') ILIKE '%sample%'
    OR COALESCE(a.model, '') ILIKE 'test%'
    OR COALESCE(a.model, '') ILIKE 'teste%'
    OR COALESCE(a.model, '') ILIKE 'seed%'
    OR COALESCE(a.model, '') ILIKE 'deploy%'
    OR COALESCE(a.model, '') ILIKE 'worker%'
    OR COALESCE(a.model, '') ILIKE 'fake%'
    OR COALESCE(a.model, '') ILIKE 'dummy%'
    OR COALESCE(a.model, '') ILIKE 'sample%'
    OR COALESCE(a.model, '') ILIKE '%deploymodel%'
    OR COALESCE(a.slug, '') ILIKE 'test-%'
    OR COALESCE(a.slug, '') ILIKE 'teste-%'
    OR COALESCE(a.slug, '') ILIKE 'seed-%'
    OR COALESCE(a.slug, '') ILIKE 'deploy-%'
    OR COALESCE(a.slug, '') ILIKE 'worker-%'
    OR COALESCE(a.slug, '') ILIKE 'fake-%'
    OR COALESCE(a.slug, '') ILIKE 'dummy-%'
    OR COALESCE(a.slug, '') ILIKE 'sample-%'
    OR COALESCE(a.seller_name, '') ~* '\\mteste\\M'
    OR COALESCE(a.seller_name, '') ~* '\\mfake\\M'
    OR COALESCE(a.seller_name, '') ~* '\\mdummy\\M'
    OR COALESCE(a.dealer_name, '') ~* '\\mteste\\M'
    OR COALESCE(a.dealer_name, '') ~* '\\mfake\\M'
    OR COALESCE(a.dealer_name, '') ~* '\\mdummy\\M'
    OR COALESCE(a.dealership_name, '') ~* '\\mteste\\M'
    OR COALESCE(a.dealership_name, '') ~* '\\mfake\\M'
    OR COALESCE(a.dealership_name, '') ~* '\\mdummy\\M'
  )
`;

function shouldApplyDirtyAdGuard() {
  const explicit = String(process.env.PUBLIC_TEST_AD_FILTER || "")
    .trim()
    .toLowerCase();
  if (explicit === "disabled") return false;
  if (explicit === "enabled") return true;
  return process.env.NODE_ENV === "production";
}

function pushFilter(where, params, expression, ...values) {
  let sql = expression;

  for (const value of values) {
    params.push(value);
    sql = sql.replace("?", `$${params.length}`);
  }

  where.push(sql);
}

export function buildAdsSearchQuery(filters = {}) {
  const {
    q,
    city_id,
    city_slug,
    city_slugs,
    city,
    state,
    brand,
    model,
    min_price,
    max_price,
    // price_min / price_max: compat com schema Zod (alias de min_price / max_price)
    price_min,
    price_max,
    year_min,
    year_max,
    mileage_max,
    fuel_type,
    transmission,
    body_type,
    below_fipe,
    highlight_only,
    // highlight: alias legado do mesmo filtro (parser unifica em highlight_only)
    highlight,
    priority_tier,
    opportunity,
    seller_kind,
    advertiser_id,
    page = 1,
    limit = 20,
    sort = "relevance",
  } = filters;

  const effectiveMinPrice = min_price !== undefined ? min_price : price_min;
  const effectiveMaxPrice = max_price !== undefined ? max_price : price_max;

  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(
    ADS_FILTER_LIMITS.LIMIT_MAX,
    Math.max(1, Number(limit) || ADS_FILTER_LIMITS.DEFAULT_LIMIT)
  );
  const offset = (safePage - 1) * safeLimit;

  const where = [`a.status = '${AD_STATUS.ACTIVE}'`];
  if (shouldApplyDirtyAdGuard()) {
    where.push(DIRTY_TEST_AD_GUARD_SQL);
  }
  const params = [];
  let useTextRank = false;
  let textRankExpression = "0";

  if (q && String(q).trim().length >= 2) {
    useTextRank = true;
    params.push(q);
    const textIndex = params.length;
    where.push(`a.search_vector @@ plainto_tsquery('portuguese', $${textIndex})`);
    textRankExpression = `ts_rank(a.search_vector, plainto_tsquery('portuguese', $${textIndex}))`;
  }

  // Captura o param da cidade-base só quando city_slugs[0] é um slug não-vazio
  // E há vizinhança (length > 1). Permanece null nos outros caminhos —
  // hybridScoreExpr abaixo injeta `0` (no-op) quando null.
  let baseCitySlugParamIdx = null;
  // O slug da cidade-base é usado APENAS no hybridScoreExpr do SELECT
  // (não no WHERE). Capturamos aqui e empurramos no `params` *depois* de
  // todo o WHERE estar pronto — caso contrário o countQuery (que reusa
  // só o WHERE) recebe um param a mais que o número de placeholders e
  // o Postgres rejeita com "bind message supplies N parameters, but
  // prepared statement requires N-1". Bug detectado em produção quando
  // a Página Regional manda city_slugs com 2+ membros e o COUNT(*) do
  // total quebra silenciosamente, retornando data:[] / total:0 e
  // forçando o catálogo a renderizar "0 ofertas".
  let pendingBaseCitySlug = null;

  if (city_slug) {
    pushFilter(where, params, `c.slug = ?`, city_slug);
  } else if (Array.isArray(city_slugs) && city_slugs.length > 0) {
    // Multi-cidade (preparação interna para Página Regional). Usa ANY($n)
    // com array — postgres.js / node-postgres serializa para text[] no
    // protocolo binário, índice em cities.slug atende. Se `state` for
    // passado junto, AND-ed como safety net (defesa contra slug
    // inconsistente vs UF gravada em ads.state). Ver normalizeTerritoryFilters.
    params.push(city_slugs);
    where.push(`c.slug = ANY($${params.length})`);

    // Preferência cidade-base: city_slugs[0] é a base por convenção.
    // SÓ aplica quando length > 1 (com 1 cidade não há "vizinha" — boost
    // sem alvo). O push do slug é DIFERIDO para depois do WHERE — ver
    // `pendingBaseCitySlug` acima.
    if (city_slugs.length > 1 && typeof city_slugs[0] === "string" && city_slugs[0]) {
      pendingBaseCitySlug = city_slugs[0];
    }

    if (state)
      pushFilter(where, params, `UPPER(COALESCE(a.state, c.state)) = ?`, state.toUpperCase());
  } else if (city_id) {
    pushFilter(where, params, `a.city_id = ?`, Number(city_id));
  } else {
    if (city) pushFilter(where, params, `a.city ILIKE ?`, `%${city}%`);
    // Tolerante: fallback para cities.state quando ads.state está nulo/minusculo.
    // Evita zerar /comprar/estado/* por inconsistencia de casing na gravacao.
    if (state)
      pushFilter(where, params, `UPPER(COALESCE(a.state, c.state)) = ?`, state.toUpperCase());
  }
  if (brand) pushFilter(where, params, `a.brand ILIKE ?`, `%${brand}%`);
  if (model) pushFilter(where, params, `a.model ILIKE ?`, `%${model}%`);
  if (effectiveMinPrice !== undefined)
    pushFilter(where, params, `a.price >= ?`, Number(effectiveMinPrice));
  if (effectiveMaxPrice !== undefined)
    pushFilter(where, params, `a.price <= ?`, Number(effectiveMaxPrice));
  if (year_min !== undefined) pushFilter(where, params, `a.year >= ?`, Number(year_min));
  if (year_max !== undefined) pushFilter(where, params, `a.year <= ?`, Number(year_max));
  if (mileage_max !== undefined) pushFilter(where, params, `a.mileage <= ?`, Number(mileage_max));
  if (fuel_type) pushFilter(where, params, `a.fuel_type ILIKE ?`, `%${fuel_type}%`);
  if (transmission) {
    pushFilter(
      where,
      params,
      `(COALESCE(a.transmission, a.gearbox, a.cambio, '') ILIKE ?)`,
      `%${transmission}%`
    );
  }
  if (body_type) pushFilter(where, params, `a.body_type ILIKE ?`, `%${body_type}%`);
  if (below_fipe !== undefined) pushFilter(where, params, `a.below_fipe = ?`, Boolean(below_fipe));
  if (highlight_only === true || highlight === true) where.push(`a.highlight_until > NOW()`);
  if (advertiser_id !== undefined && advertiser_id !== null) {
    pushFilter(where, params, `a.advertiser_id = ?`, Number(advertiser_id));
  }

  // ─── Filtros canônicos da Fase 3 (selos viraram filtros) ───────────
  // priority_tier: filtra pela camada comercial calculada (1..4). Aceitar
  // só inteiros 1-4 — Zod já valida. Defesa: re-checa aqui para callers
  // programáticos.
  if (priority_tier !== undefined && priority_tier !== null) {
    const tier = Number(priority_tier);
    if (tier === 1 || tier === 2 || tier === 3 || tier === 4) {
      pushFilter(where, params, `${commercialLayerExpr} = ?`, tier);
    }
  }
  // opportunity: filtra anúncios com selo "Oportunidade" canônico (>=10%
  // abaixo da FIPE). opportunity=false NÃO é case útil (não selo, não filtra).
  if (opportunity === true) {
    where.push(`${opportunityExpr} = true`);
  }
  // seller_kind: 'dealer' (loja: dealership_id ou CNPJ) ou 'private'
  // (particular). Filtro TIPO DE VENDEDOR — ortogonal ao priority_tier.
  if (seller_kind === "dealer" || seller_kind === "private") {
    pushFilter(where, params, `${sellerKindExpr} = ?`, seller_kind);
  }

  const whereClause = `WHERE ${where.join(" AND ")}`;
  const orderByClause = buildSortClause(sort, { useTextRank });

  // Snapshot do tamanho de params no fim do WHERE — define o countParams
  // exato (countQuery NÃO usa o baseCityBoostExpr nem o LIMIT/OFFSET, só
  // o WHERE). Ver comentário em `pendingBaseCitySlug` acima.
  const whereParamsLength = params.length;

  // Diferimos o push do slug da cidade-base para DEPOIS do WHERE: assim
  // o countParams = params.slice(0, whereParamsLength) fica exatamente
  // alinhado com o número de placeholders do countQuery.
  if (pendingBaseCitySlug !== null) {
    params.push(pendingBaseCitySlug);
    baseCitySlugParamIdx = params.length;
  }

  // Boost intra-camada para cidade-base (multi-cidade). `0` quando não há
  // city_slugs[0] válido com vizinhança — no-op no hybrid_score, comportamento
  // singular intacto. Ver baseCityBoostExpr em ads-ranking.sql.js.
  const baseCityBoostFragment = baseCitySlugParamIdx
    ? baseCityBoostExpr(baseCitySlugParamIdx)
    : "0";

  const hybridScoreExpr = `
    (
      (CASE WHEN a.highlight_until > NOW() THEN 1 ELSE 0 END) * 125
      + (${planRankExpr})
      + (${cityDemandBoostExpr})
      + (COALESCE(a.priority, 1) * 10)
      + (COALESCE(m.ctr, 0) * 52)
      + (COALESCE(m.leads, 0) * 2)
      + (28.0 / (1.0 + (EXTRACT(EPOCH FROM (NOW() - a.created_at)) / 86400.0)))
      + (${useTextRank ? `${textRankExpression} * 50` : "0"})
      + (${baseCityBoostFragment})
    )
  `;

  params.push(safeLimit, offset);
  const limitIndex = params.length - 1;
  const offsetIndex = params.length;

  const dataQuery = `
    SELECT
      a.*,
      c.slug AS city_slug,
      adv.name         AS seller_name,
      adv.company_name AS dealership_name,
      adv.id           AS dealership_id,
      u.document_type  AS account_type,
      COALESCE(adv.whatsapp, adv.mobile_phone, adv.phone) AS whatsapp_number,
      COALESCE(m.views, 0) AS views,
      COALESCE(m.clicks, 0) AS clicks,
      COALESCE(m.leads, 0) AS leads,
      COALESCE(m.ctr, 0) AS ctr,
      ${commercialLayerExpr} AS priority_tier,
      ${opportunityExpr} AS opportunity,
      ${textRankExpression} AS text_rank,
      ${hybridScoreExpr} AS hybrid_score
    FROM ads a
    LEFT JOIN cities c ON c.id = a.city_id
    LEFT JOIN advertisers adv ON adv.id = a.advertiser_id
    LEFT JOIN users u ON u.id = adv.user_id
    LEFT JOIN subscription_plans sp ON sp.id = u.plan_id
    LEFT JOIN ad_metrics m ON m.ad_id = a.id
    LEFT JOIN city_metrics cm ON cm.city_id = a.city_id
    ${whereClause}
    ORDER BY ${orderByClause}
    LIMIT $${limitIndex}
    OFFSET $${offsetIndex}
  `;

  const countQuery = `
    SELECT COUNT(*)::int AS total
    FROM ads a
    LEFT JOIN cities c ON c.id = a.city_id
    ${whereClause}
  `;

  return {
    dataQuery,
    countQuery,
    // countParams usa o snapshot do fim do WHERE — exclui tanto o
    // baseCitySlug (referenciado só pelo SELECT) quanto o limit/offset.
    // O `params.slice(0, -2)` antigo arrastava o baseCitySlug e
    // quebrava o COUNT(*) com "bind message supplies N parameters, but
    // prepared statement requires N-1" sempre que city_slugs tinha 2+
    // elementos (cenário primário da Página Regional).
    params,
    countParams: params.slice(0, whereParamsLength),
    pagination: {
      page: safePage,
      limit: safeLimit,
      offset,
    },
  };
}

export function buildAdsFacetWhere(filters = {}) {
  const where = [`a.status = '${AD_STATUS.ACTIVE}'`];
  if (shouldApplyDirtyAdGuard()) {
    where.push(DIRTY_TEST_AD_GUARD_SQL);
  }
  const params = [];

  if (filters.city_slug) {
    pushFilter(where, params, `c.slug = ?`, filters.city_slug);
  } else if (Array.isArray(filters.city_slugs) && filters.city_slugs.length > 0) {
    // Espelha o comportamento do buildAdsSearchQuery — facets regionais
    // (multi-cidade) devem agregar marcas/modelos do conjunto de city_slugs
    // da Página Regional. Sem isso, /carros-usados/regiao/* mostrava
    // facets vazias.
    params.push(filters.city_slugs);
    where.push(`c.slug = ANY($${params.length})`);
    if (filters.state) {
      pushFilter(
        where,
        params,
        `UPPER(COALESCE(a.state, c.state)) = ?`,
        String(filters.state).toUpperCase()
      );
    }
  } else if (filters.city_id) {
    pushFilter(where, params, `a.city_id = ?`, Number(filters.city_id));
  } else if (filters.state) {
    pushFilter(
      where,
      params,
      `UPPER(COALESCE(a.state, c.state)) = ?`,
      String(filters.state).toUpperCase()
    );
  }
  if (filters.brand) pushFilter(where, params, `a.brand ILIKE ?`, `%${filters.brand}%`);
  if (filters.model) pushFilter(where, params, `a.model ILIKE ?`, `%${filters.model}%`);
  if (filters.below_fipe !== undefined)
    pushFilter(where, params, `a.below_fipe = ?`, Boolean(filters.below_fipe));
  if (filters.fuel_type) pushFilter(where, params, `a.fuel_type ILIKE ?`, `%${filters.fuel_type}%`);
  if (filters.transmission) {
    pushFilter(
      where,
      params,
      `(COALESCE(a.transmission, a.gearbox, a.cambio, '') ILIKE ?)`,
      `%${filters.transmission}%`
    );
  }
  if (filters.body_type) pushFilter(where, params, `a.body_type ILIKE ?`, `%${filters.body_type}%`);

  return {
    whereClause: `WHERE ${where.join(" AND ")}`,
    params,
  };
}
