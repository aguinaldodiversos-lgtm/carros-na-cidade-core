import { pool } from "../../infrastructure/database/db.js";
import { logger } from "../../shared/logger.js";
import * as citiesService from "../cities/cities.service.js";
import * as marketIntelligenceService from "../market-intelligence/market-intelligence.service.js";
import { normalizePublicAdRows } from "../ads/ads.public-images.js";

async function safeQuery(label, fn) {
  try {
    return await fn();
  } catch (err) {
    logger.warn(
      { err: err?.message || String(err), label },
      "[public.controller] parte da home falhou"
    );
    return null;
  }
}

export async function getHomeData(req, res, next) {
  try {
    const [
      featuredCities,
      topOpportunities,
      highlightAdsResult,
      opportunityAdsResult,
      recentAdsResult,
      statsResult,
      adsByStateResult,
    ] = await Promise.all([
      safeQuery("featuredCities", () => citiesService.getTopCitiesByDemand(8)).then((r) => r ?? []),
      safeQuery("topOpportunities", () => marketIntelligenceService.getTopOpportunities(8)).then(
        (r) => r ?? []
      ),

      safeQuery("highlightAds", () =>
        pool.query(`
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
          a.images,
          a.highlight_until,
          a.plan
        FROM ads a
        WHERE a.status = 'active'
          AND a.highlight_until IS NOT NULL
          AND a.highlight_until > NOW()
        ORDER BY
          (CASE WHEN a.highlight_until > NOW() THEN 1 ELSE 0 END) DESC,
          a.priority DESC NULLS LAST,
          a.highlight_until DESC,
          a.created_at DESC
        LIMIT 12
      `)
      ),

      safeQuery("opportunityAds", () =>
        pool.query(`
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
          a.images,
          a.below_fipe
        FROM ads a
        WHERE a.status = 'active'
          AND a.below_fipe = true
        ORDER BY a.created_at DESC
        LIMIT 12
      `)
      ),

      safeQuery("recentAds", () =>
        pool.query(`
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
          a.images,
          a.created_at
        FROM ads a
        WHERE a.status = 'active'
        ORDER BY a.created_at DESC
        LIMIT 12
      `)
      ),

      safeQuery("stats", () =>
        pool.query(`
        SELECT
          (SELECT COUNT(*) FROM ads WHERE status = 'active') AS total_ads,
          (SELECT COUNT(*) FROM cities) AS total_cities,
          (SELECT COUNT(*) FROM advertisers) AS total_advertisers,
          (SELECT COUNT(*) FROM users) AS total_users
      `)
      ),

      // Agregacao de ofertas por UF para a secao "Explore por estado" da home.
      // Usa COALESCE(a.state, c.state) pela mesma razao do filtro estadual:
      // tolera anuncios antigos sem UF gravada, caindo para cities.state.
      safeQuery("adsByState", () =>
        pool.query(`
        SELECT
          UPPER(COALESCE(a.state, c.state)) AS uf,
          COUNT(*)::int AS offers
        FROM ads a
        LEFT JOIN cities c ON c.id = a.city_id
        WHERE a.status = 'active'
          AND COALESCE(a.state, c.state) IS NOT NULL
        GROUP BY UPPER(COALESCE(a.state, c.state))
        ORDER BY offers DESC, uf ASC
        LIMIT 10
      `)
      ),
    ]);

    const [highlightAds, opportunityAds, recentAds] = await Promise.all([
      normalizePublicAdRows(highlightAdsResult?.rows ?? []),
      normalizePublicAdRows(opportunityAdsResult?.rows ?? []),
      normalizePublicAdRows(recentAdsResult?.rows ?? []),
    ]);

    res.json({
      success: true,
      data: {
        featuredCities,
        topOpportunities,
        highlightAds,
        opportunityAds,
        recentAds,
        adsByState: adsByStateResult?.rows ?? [],
        stats: statsResult?.rows?.[0] ?? {
          total_ads: "0",
          total_cities: "0",
          total_advertisers: "0",
          total_users: "0",
        },
      },
    });
  } catch (err) {
    next(err);
  }
}
