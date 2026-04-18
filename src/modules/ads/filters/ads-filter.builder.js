// src/modules/ads/filters/ads-filter.builder.js

import { buildSortClause } from "./ads-filter.sort.js";
import { cityDemandBoostExpr, planRankExpr } from "./ads-ranking.sql.js";
import { ADS_FILTER_LIMITS } from "./ads-filter.constants.js";

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

  const where = [`a.status = 'active'`];
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

  if (city_slug) {
    pushFilter(where, params, `c.slug = ?`, city_slug);
  } else if (city_id) {
    pushFilter(where, params, `a.city_id = ?`, Number(city_id));
  } else {
    if (city) pushFilter(where, params, `a.city ILIKE ?`, `%${city}%`);
    if (state) pushFilter(where, params, `a.state = ?`, state.toUpperCase());
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

  const whereClause = `WHERE ${where.join(" AND ")}`;
  const orderByClause = buildSortClause(sort, { useTextRank });

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
    )
  `;

  params.push(safeLimit, offset);
  const limitIndex = params.length - 1;
  const offsetIndex = params.length;

  const dataQuery = `
    SELECT
      a.*,
      c.slug AS city_slug,
      adv.name        AS seller_name,
      adv.company_name AS dealership_name,
      COALESCE(adv.whatsapp, adv.mobile_phone, adv.phone) AS whatsapp_number,
      COALESCE(m.views, 0) AS views,
      COALESCE(m.clicks, 0) AS clicks,
      COALESCE(m.leads, 0) AS leads,
      COALESCE(m.ctr, 0) AS ctr,
      ${textRankExpression} AS text_rank,
      ${hybridScoreExpr} AS hybrid_score
    FROM ads a
    LEFT JOIN cities c ON c.id = a.city_id
    LEFT JOIN advertisers adv ON adv.id = a.advertiser_id
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
    params,
    countParams: params.slice(0, -2),
    pagination: {
      page: safePage,
      limit: safeLimit,
      offset,
    },
  };
}

export function buildAdsFacetWhere(filters = {}) {
  const where = [`a.status = 'active'`];
  const params = [];

  if (filters.city_slug) {
    pushFilter(where, params, `c.slug = ?`, filters.city_slug);
  } else if (filters.city_id) {
    pushFilter(where, params, `a.city_id = ?`, Number(filters.city_id));
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
