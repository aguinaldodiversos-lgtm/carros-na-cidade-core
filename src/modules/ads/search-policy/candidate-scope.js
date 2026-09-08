// src/modules/ads/search-policy/candidate-scope.js
//
// CandidateScope (§4.1 + D3). ÚNICA função que monta o WHERE de produto e de
// território do motor. dataQuery, countQuery, facetas, liquidez e relaxações
// consomem daqui — não pode existir uma segunda.
//
// Território (D3), uma só cláusula:
//   AUTO_RADIUS / MANUAL_RADIUS / EXACT_CITY →
//     a.city_id IN (SELECT member_city_id FROM region_memberships
//                    WHERE base_city_id = $origin AND distance_km <= $radius)
//     (EXACT usa $radius = 0: a self-row da F1 garante a própria cidade)
//   STATE    → UPPER(a.state) = $uf
//   NATIONAL → sem cláusula
//
// Produto: q (search_vector), brand, commercial_model (igualdade
// case-insensitive; NULL fica fora), year_from/to, price_min/max, mileage_max,
// transmission, fuel, body_type, below_fipe, seller_kind, opportunity,
// priority_tier. Expressões canônicas vêm de ads-ranking.sql.js — é o mesmo
// SQL do caminho legado, para que "filtro" signifique a mesma coisa nos dois.
//
// Os quatro LEFT JOINs (cities, advertisers, users, subscription_plans) são
// obrigatórios em TODA query que use este WHERE: o guard de anúncio sujo cita
// `adv`, seller_kind cita `u`, priority_tier cita `sp`. Foi assim que o
// countQuery quebrou em produção duas vezes (2026-05-24 e 2026-07-26).

import { AD_STATUS } from "../ads.canonical.constants.js";
import { DIRTY_TEST_AD_GUARD_SQL, shouldApplyDirtyAdGuard } from "../filters/ads-filter.builder.js";
import {
  commercialLayerExpr,
  opportunityExpr,
  sellerKindExpr,
} from "../filters/ads-ranking.sql.js";

export const STANDARD_JOINS = `
    LEFT JOIN cities c              ON c.id  = a.city_id
    LEFT JOIN advertisers adv       ON adv.id = a.advertiser_id
    LEFT JOIN users u               ON u.id  = adv.user_id
    LEFT JOIN subscription_plans sp ON sp.id = u.plan_id`;

/** Acumulador de parâmetros posicionais: `p(valor)` devolve `$n`. */
export function createParamBag(initial = []) {
  const params = [...initial];
  const p = (value) => {
    params.push(value);
    return `$${params.length}`;
  };
  return { p, params };
}

/** Cláusulas base: status ativo + guard de anúncio sujo (mesma regra do legado). */
export function baseClauses() {
  const clauses = [`a.status = '${AD_STATUS.ACTIVE}'`];
  if (shouldApplyDirtyAdGuard()) clauses.push(DIRTY_TEST_AD_GUARD_SQL);
  return clauses;
}

/**
 * Cláusulas de PRODUTO. `exclude` retira dimensões (facetas self-excluding e
 * variantes de relaxação). Devolve também o índice do parâmetro de `q`, que
 * o ranking usa em ts_rank.
 */
export function buildProductClauses(filters = {}, bag, { exclude = [] } = {}) {
  const skip = new Set(exclude);
  const clauses = [];
  let qParam = null;

  const q = typeof filters.q === "string" ? filters.q.trim() : "";
  if (q.length >= 2 && !skip.has("q")) {
    qParam = bag.p(q);
    clauses.push(`a.search_vector @@ plainto_tsquery('portuguese', ${qParam})`);
  }
  if (filters.brand && !skip.has("brand")) {
    clauses.push(`a.brand ILIKE ${bag.p(`%${filters.brand}%`)}`);
  }
  if (filters.commercial_model && !skip.has("commercial_model")) {
    clauses.push(`LOWER(a.commercial_model) = LOWER(${bag.p(String(filters.commercial_model))})`);
  }
  if (filters.year_from !== undefined && !skip.has("year_from") && !skip.has("year")) {
    clauses.push(`a.year >= ${bag.p(Number(filters.year_from))}`);
  }
  if (filters.year_to !== undefined && !skip.has("year_to") && !skip.has("year")) {
    clauses.push(`a.year <= ${bag.p(Number(filters.year_to))}`);
  }
  if (filters.price_min !== undefined && !skip.has("price_min") && !skip.has("price")) {
    clauses.push(`a.price >= ${bag.p(Number(filters.price_min))}`);
  }
  if (filters.price_max !== undefined && !skip.has("price_max") && !skip.has("price")) {
    clauses.push(`a.price <= ${bag.p(Number(filters.price_max))}`);
  }
  if (filters.mileage_max !== undefined && !skip.has("mileage_max") && !skip.has("mileage")) {
    clauses.push(`a.mileage <= ${bag.p(Number(filters.mileage_max))}`);
  }
  if (filters.transmission && !skip.has("transmission")) {
    clauses.push(
      `(COALESCE(a.transmission, a.gearbox, a.cambio, '') ILIKE ${bag.p(`%${filters.transmission}%`)})`
    );
  }
  if (filters.fuel && !skip.has("fuel")) {
    clauses.push(`a.fuel_type ILIKE ${bag.p(`%${filters.fuel}%`)}`);
  }
  if (filters.body_type && !skip.has("body_type")) {
    clauses.push(`a.body_type ILIKE ${bag.p(`%${filters.body_type}%`)}`);
  }
  if (filters.below_fipe !== undefined && !skip.has("below_fipe")) {
    clauses.push(`a.below_fipe = ${bag.p(Boolean(filters.below_fipe))}`);
  }
  if (
    (filters.seller_kind === "dealer" || filters.seller_kind === "private") &&
    !skip.has("seller_kind")
  ) {
    clauses.push(`${sellerKindExpr} = ${bag.p(filters.seller_kind)}`);
  }
  if (filters.opportunity === true && !skip.has("opportunity")) {
    clauses.push(`${opportunityExpr} = true`);
  }
  if (filters.priority_tier !== undefined && !skip.has("priority_tier")) {
    const tier = Number(filters.priority_tier);
    if ([1, 2, 3, 4].includes(tier)) clauses.push(`${commercialLayerExpr} = ${bag.p(tier)}`);
  }
  return { clauses, qParam };
}

/**
 * Cláusula territorial (D3). `territory` = { mode, originId, radiusKm, uf }.
 * Devolve null em NATIONAL.
 */
export function buildTerritoryClause(territory = {}, bag) {
  const mode = territory.mode;
  if (mode === "AUTO_RADIUS" || mode === "MANUAL_RADIUS" || mode === "EXACT_CITY") {
    if (!Number.isFinite(Number(territory.originId))) return null;
    const radius = Number.isFinite(Number(territory.radiusKm)) ? Number(territory.radiusKm) : 0;
    return `a.city_id IN (SELECT member_city_id FROM region_memberships WHERE base_city_id = ${bag.p(
      Number(territory.originId)
    )} AND distance_km <= ${bag.p(radius)})`;
  }
  if (mode === "STATE" && territory.uf) {
    return `UPPER(a.state) = ${bag.p(String(territory.uf).toUpperCase())}`;
  }
  return null;
}

/**
 * CandidateScope completo.
 *
 * @param {{ filters, territory }} ctx  filters internos + { mode, originId, radiusKm, uf }
 * @param {{ exclude?: string[], params?: any[] }} options
 * @returns {{ whereClause, clauses, params, joins, qParam, territoryClause }}
 */
export function buildCandidateScope(ctx, { exclude = [], params = [] } = {}) {
  const bag = createParamBag(params);
  const clauses = baseClauses();
  const territoryClause = buildTerritoryClause(ctx.territory, bag);
  if (territoryClause) clauses.push(territoryClause);
  const product = buildProductClauses(ctx.filters, bag, { exclude });
  clauses.push(...product.clauses);
  return {
    whereClause: `WHERE ${clauses.join("\n      AND ")}`,
    clauses,
    params: bag.params,
    joins: STANDARD_JOINS,
    qParam: product.qParam,
    territoryClause,
    bag,
  };
}
