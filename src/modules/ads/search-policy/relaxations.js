// src/modules/ads/search-policy/relaxations.js
//
// Relaxações (§4.7, §5.3, §7.6, D4). Rodam quando total < target (inclui 0).
//
// Para cada filtro ativo listado em relaxations.steps, UMA variante com o
// degrau aplicado; contagem de todas numa única query com COUNT(*) FILTER
// sobre o território mais amplo entre as variantes. delta = count − total;
// só delta > 0. Ordem: delta DESC, empate por priority_order; corte em
// max_items. Cache sp:relax:{sha1(contexto)} por 60 s.
//
// Sem substituição de modelo ("modelos próximos") no v1.

import crypto from "node:crypto";
import { pool } from "../../../infrastructure/database/db.js";
import { baseClauses, buildProductClauses, createParamBag } from "./candidate-scope.js";
import { POLICY_CACHE_PREFIX, policyCacheGet, policyCacheSet } from "./policy-cache.js";
import { GEO_MODE } from "./scope-resolver.js";

function fmtMil(value) {
  return `R$ ${Math.round(Number(value) / 1000)} mil`;
}

const OTHER_TRANSMISSION = Object.freeze({ automatico: "manual", manual: "automático" });

/**
 * Variantes (puro). Cada uma: { dimension, label, url_params, filters, radiusKm }.
 * `radiusKm` = null quando o território não muda.
 */
export function buildRelaxationVariants(ctx, scope, policy) {
  const steps = policy.relaxations?.steps || {};
  const f = ctx.filters;
  const variants = [];
  const withRadius =
    scope.geo_mode === GEO_MODE.AUTO_RADIUS || scope.geo_mode === GEO_MODE.MANUAL_RADIUS;
  const exactCity = scope.geo_mode === GEO_MODE.EXACT_CITY;

  if (steps.radius && (withRadius || exactCity) && ctx.origin) {
    const current = Number(scope.effective_radius_km || 0);
    const manual = [...(policy.rings_manual || [])].sort((a, b) => a - b);
    let next = manual.find((r) => r > current) ?? null;
    if (next === null && ctx.intent.profile.startsWith("SEARCH_") && current < 150) next = 150;
    if (next !== null && next <= ctx.intent.max_auto_radius) {
      variants.push({
        dimension: "radius",
        label: `ampliar para ${next} km`,
        url_params: { raio: next },
        filters: { ...f },
        radiusKm: next,
      });
    }
  }
  if (steps.year_from !== undefined && f.year_from !== undefined) {
    const next = Math.max(1990, Number(f.year_from) + Number(steps.year_from));
    if (next < Number(f.year_from)) {
      variants.push({
        dimension: "year_from",
        label: `aceitar a partir de ${next}`,
        url_params: { year_min: next },
        filters: { ...f, year_from: next },
        radiusKm: null,
      });
    }
  }
  if (steps.price_max !== undefined && f.price_max !== undefined) {
    const next = Math.ceil((Number(f.price_max) * (1 + Number(steps.price_max))) / 1000) * 1000;
    variants.push({
      dimension: "price_max",
      label: `subir o teto para ${fmtMil(next)}`,
      url_params: { price_max: next },
      filters: { ...f, price_max: next },
      radiusKm: null,
    });
  }
  if (steps.mileage_max !== undefined && f.mileage_max !== undefined) {
    const next = Math.ceil((Number(f.mileage_max) * (1 + Number(steps.mileage_max))) / 5000) * 5000;
    variants.push({
      dimension: "mileage_max",
      label: `aceitar até ${next.toLocaleString("pt-BR")} km`,
      url_params: { mileage_max: next },
      filters: { ...f, mileage_max: next },
      radiusKm: null,
    });
  }
  const removals = [
    [
      "transmission",
      f.transmission
        ? `aceitar câmbio ${OTHER_TRANSMISSION[String(f.transmission).toLowerCase()] || "manual"}`
        : null,
      "transmission",
    ],
    ["fuel", "qualquer combustível", "fuel_type"],
    ["body_type", "qualquer carroceria", "body_type"],
    ["seller_kind", "lojas e particulares", "seller_kind"],
  ];
  for (const [dimension, label, urlKey] of removals) {
    if (steps[dimension] !== "remove" || f[dimension] === undefined || f[dimension] === null)
      continue;
    const next = { ...f };
    delete next[dimension];
    variants.push({
      dimension,
      label,
      url_params: { [urlKey]: null },
      filters: next,
      radiusKm: null,
    });
  }
  return variants;
}

function sha1(value) {
  return crypto.createHash("sha1").update(String(value)).digest("hex");
}

/**
 * Conta as variantes e devolve as relaxações ordenadas/cortadas.
 *
 * @param {object} ctx { origin, filters, intent, uf }
 * @param {object} scope resultado do resolveScope
 * @param {number} total total_result_count
 * @param {object} policy
 * @param {{ db?, cache?: boolean }} deps
 */
export async function computeRelaxations(ctx, scope, total, policy, deps = {}) {
  const db = deps.db || pool;
  const useCache = deps.cache !== false;
  if (!policy.relaxations?.show_when_total_below_target) return { relaxations: [], queries: 0 };
  if (!(Number(total) < Number(ctx.intent.target))) return { relaxations: [], queries: 0 };

  const variants = buildRelaxationVariants(ctx, scope, policy);
  if (!variants.length) return { relaxations: [], queries: 0 };

  const key = `${POLICY_CACHE_PREFIX.RELAXATIONS}:${sha1(
    JSON.stringify({
      o: ctx.origin?.id ?? null,
      m: scope.geo_mode,
      r: scope.effective_radius_km,
      uf: ctx.uf,
      f: ctx.filters,
      v: variants.map((v) => v.dimension),
      t: total,
    })
  )}`;
  if (useCache) {
    const hit = await policyCacheGet(key);
    if (Array.isArray(hit)) return { relaxations: hit, queries: 0, cacheHit: true };
  }

  const bag = createParamBag();
  const hasOrigin =
    Boolean(ctx.origin) &&
    scope.geo_mode !== GEO_MODE.STATE &&
    scope.geo_mode !== GEO_MODE.NATIONAL;
  const currentRadius = Number(scope.effective_radius_km || 0);
  const widest = Math.max(
    currentRadius,
    ...variants.map((v) => (v.radiusKm == null ? currentRadius : v.radiusKm))
  );

  const base = baseClauses();
  let joinRm = "";
  if (hasOrigin) {
    const originP = bag.p(Number(ctx.origin.id));
    joinRm = `JOIN region_memberships rm ON rm.base_city_id = ${originP} AND rm.member_city_id = a.city_id`;
    base.push(`rm.distance_km <= ${bag.p(widest)}`);
  } else if (scope.geo_mode === GEO_MODE.STATE && ctx.uf) {
    base.push(`UPPER(a.state) = ${bag.p(String(ctx.uf).toUpperCase())}`);
  }

  const selects = variants.map((v, i) => {
    const clauses = [];
    if (hasOrigin)
      clauses.push(`rm.distance_km <= ${bag.p(v.radiusKm == null ? currentRadius : v.radiusKm)}`);
    const product = buildProductClauses(v.filters, bag);
    clauses.push(...product.clauses);
    return `COUNT(*) FILTER (WHERE ${clauses.length ? clauses.join(" AND ") : "TRUE"})::int AS v${i}`;
  });

  const sql = `
    SELECT ${selects.join(",\n           ")}
    FROM ads a
    LEFT JOIN cities c              ON c.id  = a.city_id
    LEFT JOIN advertisers adv       ON adv.id = a.advertiser_id
    LEFT JOIN users u               ON u.id  = adv.user_id
    LEFT JOIN subscription_plans sp ON sp.id = u.plan_id
    ${joinRm}
    WHERE ${base.join("\n      AND ")}`;
  const { rows } = await db.query(sql, bag.params);
  const row = rows[0] || {};

  const order = policy.relaxations.priority_order || [];
  const items = variants
    .map((v, i) => ({ v, count: Number(row[`v${i}`] || 0) }))
    .map(({ v, count }) => ({
      dimension: v.dimension,
      label: v.label,
      delta: count - Number(total),
      url_params: v.url_params,
      radiusKm: v.radiusKm,
    }))
    .filter((r) => r.delta > 0)
    .sort((a, b) => b.delta - a.delta || order.indexOf(a.dimension) - order.indexOf(b.dimension))
    .slice(0, Number(policy.relaxations.max_items) || 3)
    .map((r) => {
      const out = {
        dimension: r.dimension,
        label: r.label,
        delta: r.delta,
        url_params: r.url_params,
      };
      if (r.dimension === "radius") {
        out.included_cities = (scope.liquidityRows || [])
          .filter(
            (c) =>
              Number(c.distance_km) > currentRadius &&
              Number(c.distance_km) <= r.radiusKm &&
              Number(c.count) > 0
          )
          .map((c) => c.slug);
      }
      return out;
    });

  if (useCache) await policyCacheSet(key, items, 60);
  return { relaxations: items, queries: 1, sql, params: bag.params };
}
