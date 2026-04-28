import { pool } from "../../infrastructure/database/db.js";

/* =====================================================
   SNAPSHOT PÚBLICO DA CIDADE
===================================================== */

export async function getCityPublicSnapshot(slug) {
  const result = await pool.query(
    `
    SELECT
      c.id,
      c.name,
      c.state,
      c.slug,
      c.stage,
      c.population,
      c.region,
      COALESCE(cm.demand_score, 0) AS demand_score,
      -- Os nomes canônicos das colunas em city_metrics são leads/ads_count/
      -- advertisers_count (ver migration 014_admin_structural_sanitation.sql
      -- e worker city_metrics.worker.js). Aliases mantidos para não
      -- quebrar consumidores downstream.
      COALESCE(cm.leads, 0) AS total_leads_metric,
      COALESCE(cm.ads_count, 0) AS total_ads_metric,
      COALESCE(cm.advertisers_count, 0) AS total_dealers_metric,
      COALESCE(cd.dominance_score, 0) AS dominance_score,
      COALESCE(cd.total_ads, 0) AS dominance_total_ads,
      COALESCE(cd.leads, 0) AS dominance_total_leads,
      COALESCE(cd.avg_ctr, 0) AS avg_ctr,
      COALESCE(co.opportunity_score, 0) AS opportunity_score,
      COALESCE(co.priority_level, 'low') AS priority_level,
      COALESCE(co.demand_index, 0) AS demand_index,
      COALESCE(co.supply_index, 0) AS supply_index,
      COALESCE(cp.prediction_score, 0) AS prediction_score,
      COALESCE(cp.prediction_label, 'cold') AS prediction_label,
      (
        SELECT COUNT(*)::int
        FROM ads a
        WHERE a.city_id = c.id
          AND a.status = 'active'
      ) AS live_ads_count,
      (
        SELECT COUNT(*)::int
        FROM ads a
        WHERE a.city_id = c.id
          AND a.status = 'active'
          AND a.highlight_until IS NOT NULL
          AND a.highlight_until > NOW()
      ) AS highlighted_ads_count,
      (
        SELECT COUNT(*)::int
        FROM ads a
        WHERE a.city_id = c.id
          AND a.status = 'active'
          AND a.below_fipe = true
      ) AS below_fipe_ads_count,
      (
        SELECT COUNT(*)::int
        FROM advertisers adv
        WHERE adv.city_id = c.id
      ) AS advertisers_count,
      (
        SELECT COUNT(*)::int
        FROM blog_posts bp
        WHERE bp.city = c.name
          AND bp.status = 'published'
      ) AS published_city_pages_count
    FROM cities c
    LEFT JOIN city_metrics cm
      ON cm.city_id = c.id
    LEFT JOIN city_dominance cd
      ON cd.city_id = c.id
    LEFT JOIN city_opportunities co
      ON co.city_id = c.id
    LEFT JOIN city_predictions cp
      ON cp.city_id = c.id
    WHERE c.slug = $1
    LIMIT 1
    `,
    [slug]
  );

  return result.rows[0] || null;
}

/* =====================================================
   ADS DESTAQUE DA CIDADE
===================================================== */

export async function listCityHighlightAds(citySlug, limit = 12) {
  const safeLimit = Math.min(50, Math.max(1, Number(limit) || 12));

  const result = await pool.query(
    `
    SELECT
      a.id,
      a.title,
      a.price,
      a.city,
      a.state,
      a.brand,
      a.model,
      a.year,
      a.mileage,
      a.slug,
      a.plan,
      a.highlight_until,
      a.below_fipe,
      a.created_at
    FROM ads a
    JOIN cities c ON c.id = a.city_id
    WHERE c.slug = $1
      AND a.status = 'active'
      AND a.highlight_until IS NOT NULL
      AND a.highlight_until > NOW()
    ORDER BY
      a.highlight_until DESC,
      a.priority DESC NULLS LAST,
      a.created_at DESC
    LIMIT $2
    `,
    [citySlug, safeLimit]
  );

  return result.rows;
}

/* =====================================================
   ADS OPORTUNIDADE DA CIDADE
===================================================== */

export async function listCityOpportunityAds(citySlug, limit = 12) {
  const safeLimit = Math.min(50, Math.max(1, Number(limit) || 12));

  const result = await pool.query(
    `
    SELECT
      a.id,
      a.title,
      a.price,
      a.city,
      a.state,
      a.brand,
      a.model,
      a.year,
      a.mileage,
      a.slug,
      a.plan,
      a.below_fipe,
      a.created_at
    FROM ads a
    JOIN cities c ON c.id = a.city_id
    WHERE c.slug = $1
      AND a.status = 'active'
      AND a.below_fipe = true
    ORDER BY
      a.created_at DESC,
      a.price ASC NULLS LAST
    LIMIT $2
    `,
    [citySlug, safeLimit]
  );

  return result.rows;
}

/* =====================================================
   ADS RECENTES DA CIDADE
===================================================== */

export async function listRecentCityAds(citySlug, limit = 12) {
  const safeLimit = Math.min(50, Math.max(1, Number(limit) || 12));

  const result = await pool.query(
    `
    SELECT
      a.id,
      a.title,
      a.price,
      a.city,
      a.state,
      a.brand,
      a.model,
      a.year,
      a.mileage,
      a.slug,
      a.plan,
      a.below_fipe,
      a.created_at
    FROM ads a
    JOIN cities c ON c.id = a.city_id
    WHERE c.slug = $1
      AND a.status = 'active'
    ORDER BY a.created_at DESC
    LIMIT $2
    `,
    [citySlug, safeLimit]
  );

  return result.rows;
}

/* =====================================================
   FACETS DE MARCAS DA CIDADE
===================================================== */

export async function listCityBrandFacets(citySlug, limit = 20) {
  const safeLimit = Math.min(50, Math.max(1, Number(limit) || 20));

  const result = await pool.query(
    `
    SELECT
      a.brand,
      COUNT(*)::int AS total
    FROM ads a
    JOIN cities c ON c.id = a.city_id
    WHERE c.slug = $1
      AND a.status = 'active'
      AND a.brand IS NOT NULL
    GROUP BY a.brand
    ORDER BY total DESC, a.brand ASC
    LIMIT $2
    `,
    [citySlug, safeLimit]
  );

  return result.rows;
}

/* =====================================================
   FACETS DE MODELOS DA CIDADE
===================================================== */

export async function listCityModelFacets(citySlug, limit = 20) {
  const safeLimit = Math.min(50, Math.max(1, Number(limit) || 20));

  const result = await pool.query(
    `
    SELECT
      a.brand,
      a.model,
      COUNT(*)::int AS total
    FROM ads a
    JOIN cities c ON c.id = a.city_id
    WHERE c.slug = $1
      AND a.status = 'active'
      AND a.brand IS NOT NULL
      AND a.model IS NOT NULL
    GROUP BY a.brand, a.model
    ORDER BY total DESC, a.brand ASC, a.model ASC
    LIMIT $2
    `,
    [citySlug, safeLimit]
  );

  return result.rows;
}
