// src/modules/ads/search-policy/relaxations.js
//
// Guided Relaxation — DEC-26 (v3 §9), certificada em 2026-09-20 sobre o
// baseline 6981b73d.
//
// O motor não aplica degraus cegos. Para cada dimensão relaxável ele lê do
// ESTOQUE o boundary real — o menor novo teto de preço, o próximo ano
// existente, o menor limite de quilometragem útil, a distância do primeiro
// candidato externo — e só então arredonda para cima, classifica a banda sobre
// o valor final e mede o benefício. Ficaram superados como política vigente:
// preço +15% fixo, ano −2 fixo, quilometragem +25% fixa, "próximo anel" de
// rings_manual e ordenação só por delta.
//
// Custo operacional: no máximo DUAS queries adicionais, sempre.
//
//   (1) boundaries  — um SELECT com MIN/MAX ... FILTER por dimensão;
//   (2) benefício   — um SELECT com COUNT ... FILTER por variante já
//                     materializada, mais as contagens do escopo atual.
//
// Nunca uma query por dimensão, nunca uma por sugestão, nunca loop com round
// trip. A investigação até 150 km vive apenas na query (1) e apenas quando a
// Guided Relaxation é necessária: a busca normal nunca amplia sozinha para
// 150 (DEC-26, "Leveza operacional"; DEC-11/DEC-23 mantêm o AUTO em 75).
//
// Cada boundary relaxa EXATAMENTE UMA dimensão e reaproveita
// `buildProductClauses({ exclude })` — o mesmo construtor do CandidateScope.
// Não existe aqui uma segunda definição de produto, preço, ano, km,
// transmissão, cidade ou status ativo.

import crypto from "node:crypto";
import { pool } from "../../../infrastructure/database/db.js";
import { logger } from "../../../shared/logger.js";
import { baseClauses, buildProductClauses, createParamBag } from "./candidate-scope.js";
import { POLICY_CACHE_PREFIX, policyCacheGet, policyCacheSet } from "./policy-cache.js";
import { GEO_MODE } from "./scope-resolver.js";
import { MANUAL_RADIUS_MAX_KM } from "./policy-config.js";
import {
  COST_BAND,
  RELAXATION_DIMENSION,
  rankRelaxations,
  resolveNumericConcession,
} from "./relaxation-policy.js";

function fmtMil(value) {
  return `R$ ${Math.round(Number(value) / 1000)} mil`;
}

const OTHER_TRANSMISSION = Object.freeze({ automatico: "manual", manual: "automático" });

function sha1(value) {
  return crypto.createHash("sha1").update(String(value)).digest("hex");
}

/** Teto efetivo da concessão de distância: política, nunca acima da malha. */
export function concessionRadiusCap(policy) {
  const configured = Number(policy?.relaxations?.radius?.max_km);
  if (!Number.isFinite(configured)) return MANUAL_RADIUS_MAX_KM;
  return Math.min(configured, MANUAL_RADIUS_MAX_KM);
}

/** A dimensão de distância é relaxável neste escopo? */
function radiusIsRelaxable(ctx, scope) {
  if (!ctx.origin) return false;
  return (
    scope.geo_mode === GEO_MODE.AUTO_RADIUS ||
    scope.geo_mode === GEO_MODE.MANUAL_RADIUS ||
    scope.geo_mode === GEO_MODE.EXACT_CITY
  );
}

/**
 * Query (1) — boundaries reais.
 *
 * Um único SELECT. Cada agregado traz o valor real do estoque que desbloqueia
 * a dimensão, mantendo TODAS as outras restrições:
 *
 *   preço  → MIN(price)  entre os candidatos do território atual acima do teto
 *   ano    → MAX(year)   entre os candidatos do território atual abaixo do piso
 *   km     → MIN(mileage) entre os candidatos do território atual acima do teto
 *   raio   → MIN(distance_km) do primeiro candidato ELEGÍVEL fora do território
 *            e dentro do teto da concessão
 *
 * O WHERE externo enxerga até o teto da concessão; são os FILTERs de preço,
 * ano e km que recolhem o alcance ao território atual. Sem isso seria preciso
 * uma query por dimensão.
 */
export function buildBoundaryQuery(ctx, scope, policy) {
  const f = ctx.filters;
  const bag = createParamBag();
  const hasOrigin =
    Boolean(ctx.origin) &&
    scope.geo_mode !== GEO_MODE.STATE &&
    scope.geo_mode !== GEO_MODE.NATIONAL;
  const currentRadius = Number(scope.effective_radius_km || 0);
  const cap = concessionRadiusCap(policy);

  const base = baseClauses();
  let joinRm = "";
  if (hasOrigin) {
    const originP = bag.p(Number(ctx.origin.id));
    joinRm = `JOIN region_memberships rm ON rm.base_city_id = ${originP} AND rm.member_city_id = a.city_id`;
    base.push(`rm.distance_km <= ${bag.p(cap)}`);
  } else if (scope.geo_mode === GEO_MODE.STATE && ctx.uf) {
    base.push(`UPPER(a.state) = ${bag.p(String(ctx.uf).toUpperCase())}`);
  }

  const selects = [];
  const dimensions = [];

  // O parâmetro do território atual só é ALOCADO quando alguma dimensão
  // numérica o usa. Alocá-lo adiantado deixava um `$n` no array sem nenhuma
  // citação no SQL quando a única dimensão relaxável era a distância, e o
  // Postgres recusa a query inteira com "could not determine data type of
  // parameter" — falha de tipo, não de lógica, e portanto invisível em teste
  // que não vá ao banco.
  let inTerritory = null;
  const territoryClause = () => {
    if (!hasOrigin) return null;
    if (inTerritory === null) inTerritory = `rm.distance_km <= ${bag.p(currentRadius)}`;
    return inTerritory;
  };
  const withTerritory = (clauses) => {
    const clause = territoryClause();
    return clause ? [clause, ...clauses] : clauses;
  };

  if (f.price_max !== undefined) {
    const product = buildProductClauses(f, bag, { exclude: ["price_max"] });
    const clauses = withTerritory([
      ...product.clauses,
      `a.price > ${bag.p(Number(f.price_max))}`,
      "a.price IS NOT NULL",
    ]);
    selects.push(`MIN(a.price) FILTER (WHERE ${clauses.join(" AND ")})::float AS price_boundary`);
    dimensions.push(RELAXATION_DIMENSION.PRICE);
  }
  if (f.year_from !== undefined) {
    const product = buildProductClauses(f, bag, { exclude: ["year_from"] });
    const clauses = withTerritory([
      ...product.clauses,
      `a.year < ${bag.p(Number(f.year_from))}`,
      "a.year IS NOT NULL",
    ]);
    selects.push(`MAX(a.year) FILTER (WHERE ${clauses.join(" AND ")})::int AS year_boundary`);
    dimensions.push(RELAXATION_DIMENSION.YEAR);
  }
  if (f.mileage_max !== undefined) {
    const product = buildProductClauses(f, bag, { exclude: ["mileage_max"] });
    const clauses = withTerritory([
      ...product.clauses,
      `a.mileage > ${bag.p(Number(f.mileage_max))}`,
      "a.mileage IS NOT NULL",
    ]);
    selects.push(
      `MIN(a.mileage) FILTER (WHERE ${clauses.join(" AND ")})::float AS mileage_boundary`
    );
    dimensions.push(RELAXATION_DIMENSION.MILEAGE);
  }
  if (hasOrigin && radiusIsRelaxable(ctx, scope) && currentRadius < cap) {
    // Única investigação além do território atual em todo o motor, e ela só
    // existe dentro da Guided Relaxation (DEC-26, "Leveza operacional").
    const product = buildProductClauses(f, bag);
    const clauses = [
      ...product.clauses,
      `rm.distance_km > ${bag.p(currentRadius)}`,
      `rm.distance_km <= ${bag.p(cap)}`,
    ];
    selects.push(
      `MIN(rm.distance_km) FILTER (WHERE ${clauses.join(" AND ")})::float AS radius_boundary`
    );
    dimensions.push(RELAXATION_DIMENSION.RADIUS);
  }

  if (!selects.length) return null;

  const sql = `
    SELECT ${selects.join(",\n           ")}
    FROM ads a
    LEFT JOIN cities c              ON c.id  = a.city_id
    LEFT JOIN advertisers adv       ON adv.id = a.advertiser_id
    LEFT JOIN users u               ON u.id  = adv.user_id
    LEFT JOIN subscription_plans sp ON sp.id = u.plan_id
    ${joinRm}
    WHERE ${base.join("\n      AND ")}`;
  return { sql, params: bag.params, dimensions, hasOrigin, currentRadius, cap };
}

/**
 * Boundaries → variantes materializadas (puro).
 *
 * Cada variante já carrega o VALOR FINAL — arredondado para cima — que será
 * aplicado, transportado na URL e exibido, e a banda calculada sobre ele.
 */
export function buildRelaxationVariants(ctx, scope, policy, boundaries = {}) {
  const cfg = policy.relaxations || {};
  const f = ctx.filters;
  const variants = [];
  const currentRadius = Number(scope.effective_radius_km || 0);

  if (f.price_max !== undefined && boundaries.price_boundary != null) {
    const concession = resolveNumericConcession({
      boundary: Number(boundaries.price_boundary),
      current: Number(f.price_max),
      quantum: cfg.price?.quantum,
      direction: "up",
      scale: "relative",
      bands: cfg.price || {},
    });
    if (concession) {
      variants.push({
        dimension: RELAXATION_DIMENSION.PRICE,
        label: `subir o teto para ${fmtMil(concession.final)}`,
        applied_value: concession.final,
        boundary_value: Number(boundaries.price_boundary),
        cost_band: concession.cost_band,
        url_params: { price_max: concession.final },
        filters: { ...f, price_max: concession.final },
        radiusKm: null,
      });
    }
  }

  if (f.year_from !== undefined && boundaries.year_boundary != null) {
    const concession = resolveNumericConcession({
      boundary: Number(boundaries.year_boundary),
      current: Number(f.year_from),
      direction: "down",
      scale: "absolute",
      bands: cfg.year || {},
    });
    if (concession) {
      variants.push({
        dimension: RELAXATION_DIMENSION.YEAR,
        label: `aceitar a partir de ${concession.final}`,
        applied_value: concession.final,
        boundary_value: Number(boundaries.year_boundary),
        cost_band: concession.cost_band,
        url_params: { year_min: concession.final },
        filters: { ...f, year_from: concession.final },
        radiusKm: null,
      });
    }
  }

  if (f.mileage_max !== undefined && boundaries.mileage_boundary != null) {
    const concession = resolveNumericConcession({
      boundary: Number(boundaries.mileage_boundary),
      current: Number(f.mileage_max),
      quantum: cfg.mileage?.quantum,
      direction: "up",
      scale: "absolute",
      bands: cfg.mileage || {},
    });
    if (concession) {
      variants.push({
        dimension: RELAXATION_DIMENSION.MILEAGE,
        label: `aceitar até ${concession.final.toLocaleString("pt-BR")} km`,
        applied_value: concession.final,
        boundary_value: Number(boundaries.mileage_boundary),
        cost_band: concession.cost_band,
        url_params: { mileage_max: concession.final },
        filters: { ...f, mileage_max: concession.final },
        radiusKm: null,
      });
    }
  }

  if (radiusIsRelaxable(ctx, scope) && boundaries.radius_boundary != null) {
    const cap = concessionRadiusCap(policy);
    const concession = resolveNumericConcession({
      boundary: Number(boundaries.radius_boundary),
      current: currentRadius,
      quantum: cfg.radius?.quantum,
      direction: "up",
      scale: "absolute",
      bands: cfg.radius || {},
      cap,
    });
    // O cap pode ter cortado o arredondamento abaixo do boundary; nesse caso
    // resolveNumericConcession já devolveu null (a concessão deixaria de fora
    // o candidato que a justificou).
    if (concession) {
      variants.push({
        dimension: RELAXATION_DIMENSION.RADIUS,
        label: `ampliar para ${concession.final} km`,
        applied_value: concession.final,
        boundary_value: Number(boundaries.radius_boundary),
        cost_band: concession.cost_band,
        url_params: { raio: concession.final },
        filters: { ...f },
        radiusKm: concession.final,
      });
    }
  }

  // Câmbio: a concessão é REMOVER a restrição, nunca trocá-la por outra
  // transmissão específica. Banda `GRANDE` por definição qualitativa — não é
  // convertida em peso numérico.
  if (f.transmission !== undefined && f.transmission !== null) {
    const next = { ...f };
    delete next.transmission;
    variants.push({
      dimension: RELAXATION_DIMENSION.TRANSMISSION,
      label: `aceitar câmbio ${OTHER_TRANSMISSION[String(f.transmission).toLowerCase()] || "manual"}`,
      applied_value: null,
      boundary_value: null,
      cost_band: cfg.transmission?.band || COST_BAND.LARGE,
      url_params: { transmission: null },
      filters: next,
      radiusKm: null,
    });
  }

  return variants;
}

/**
 * Query (2) — benefício.
 *
 * Um único SELECT com as contagens do escopo ATUAL e de cada variante. Como
 * toda variante relaxa uma dimensão mantendo as outras, o conjunto dela é
 * superset do atual e os deltas são subtrações diretas.
 */
export function buildBenefitQuery(ctx, scope, variants) {
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

  const scopeClauses = (filters, radiusKm) => {
    const clauses = [];
    if (hasOrigin)
      clauses.push(`rm.distance_km <= ${bag.p(radiusKm == null ? currentRadius : radiusKm)}`);
    clauses.push(...buildProductClauses(filters, bag).clauses);
    return clauses.length ? clauses.join(" AND ") : "TRUE";
  };

  const current = scopeClauses(ctx.filters, currentRadius);
  const selects = [
    `COUNT(*) FILTER (WHERE ${current})::int AS cur_results`,
    `COUNT(DISTINCT a.advertiser_id) FILTER (WHERE ${current})::int AS cur_sellers`,
    `COUNT(DISTINCT a.city_id) FILTER (WHERE ${current})::int AS cur_cities`,
  ];
  variants.forEach((v, i) => {
    const where = scopeClauses(v.filters, v.radiusKm);
    selects.push(`COUNT(*) FILTER (WHERE ${where})::int AS v${i}_results`);
    selects.push(`COUNT(DISTINCT a.advertiser_id) FILTER (WHERE ${where})::int AS v${i}_sellers`);
    selects.push(`COUNT(DISTINCT a.city_id) FILTER (WHERE ${where})::int AS v${i}_cities`);
    if (v.dimension === RELAXATION_DIMENSION.RADIUS && hasOrigin) {
      // As cidades que a concessão acrescenta saem da MESMA query, não de
      // `liquidityRows`: aquelas linhas param no teto automático e listariam
      // um subconjunto silenciosamente incompleto de uma concessão maior.
      selects.push(
        `ARRAY_AGG(DISTINCT c.slug) FILTER (WHERE ${where} AND rm.distance_km > ${bag.p(
          currentRadius
        )}) AS v${i}_cities_added`
      );
    }
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
  return { sql, params: bag.params };
}

/**
 * Executa a Guided Relaxation e devolve as concessões ordenadas/cortadas.
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
  const cfg = policy.relaxations || {};
  if (!cfg.show_when_total_below_target) return { relaxations: [], queries: 0 };

  // Portão de leveza (DEC-26). Nada abaixo desta linha roda quando o alvo foi
  // atingido: nenhum boundary, nenhuma contagem e, sobretudo, nenhuma consulta
  // até 150 km. É o que mantém a busca normal no território do automático.
  if (!(Number(total) < Number(ctx.intent.target))) return { relaxations: [], queries: 0 };

  const key = `${POLICY_CACHE_PREFIX.RELAXATIONS}:${sha1(
    JSON.stringify({
      o: ctx.origin?.id ?? null,
      m: scope.geo_mode,
      r: scope.effective_radius_km,
      uf: ctx.uf,
      f: ctx.filters,
      t: total,
      cap: concessionRadiusCap(policy),
    })
  )}`;
  if (useCache) {
    const hit = await policyCacheGet(key);
    if (Array.isArray(hit)) return { relaxations: hit, queries: 0, cacheHit: true };
  }

  let queries = 0;
  let boundaries = {};
  const sqls = [];
  const boundaryQuery = buildBoundaryQuery(ctx, scope, policy);
  if (boundaryQuery) {
    sqls.push(boundaryQuery.sql);
    const { rows } = await db.query(boundaryQuery.sql, boundaryQuery.params);
    queries += 1;
    boundaries = rows[0] || {};
  }

  const variants = buildRelaxationVariants(ctx, scope, policy, boundaries);
  if (!variants.length) return { relaxations: [], queries, boundaries, sqls };

  const benefitQuery = buildBenefitQuery(ctx, scope, variants);
  sqls.push(benefitQuery.sql);
  const { rows: benefitRows } = await db.query(benefitQuery.sql, benefitQuery.params);
  queries += 1;
  const row = benefitRows[0] || {};

  const cur = {
    results: Number(row.cur_results || 0),
    sellers: Number(row.cur_sellers || 0),
    cities: Number(row.cur_cities || 0),
  };

  const candidates = [];
  variants.forEach((v, i) => {
    const deltaResults = Number(row[`v${i}_results`] || 0) - cur.results;
    const deltaSellers = Number(row[`v${i}_sellers`] || 0) - cur.sellers;
    const deltaCities = Number(row[`v${i}_cities`] || 0) - cur.cities;
    // Toda variante é superset do escopo atual: delta negativo não é benefício
    // ruim, é contagem inconsistente. Não vira score — é descartado e logado.
    if (deltaResults < 0 || deltaSellers < 0 || deltaCities < 0) {
      logger.error(
        { dimension: v.dimension, deltaResults, deltaSellers, deltaCities },
        "[search-policy] delta negativo na Guided Relaxation — variante descartada"
      );
      return;
    }
    const item = {
      dimension: v.dimension,
      label: v.label,
      cost_band: v.cost_band,
      delta_result_count: deltaResults,
      delta_seller_count: deltaSellers,
      delta_city_count: deltaCities,
      // `delta` é o nome que o contrato publicado já usava para o benefício
      // principal; continua sendo exatamente delta_result_count.
      delta: deltaResults,
      applied_value: v.applied_value,
      url_params: v.url_params,
    };
    if (v.dimension === RELAXATION_DIMENSION.RADIUS) {
      item.included_cities = Array.isArray(row[`v${i}_cities_added`])
        ? row[`v${i}_cities_added`].filter(Boolean)
        : [];
    }
    candidates.push(item);
  });

  const items = rankRelaxations(candidates, {
    priority_order: cfg.priority_order || [],
    min_delta: Number(cfg.min_delta_to_offer ?? 1),
    max_options: Number(cfg.max_options ?? 3),
  });

  if (useCache) await policyCacheSet(key, items, 60);
  return { relaxations: items, queries, boundaries, current: cur, sqls };
}
