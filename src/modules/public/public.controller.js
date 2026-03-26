import { pool } from "../../infrastructure/database/db.js";
import { logger } from "../../shared/logger.js";
import * as citiesService from "../cities/cities.service.js";
import * as marketIntelligenceService from "../market-intelligence/market-intelligence.service.js";

async function safeQuery(label, fn) {
  try {
    return await fn();
  } catch (err) {
    logger.warn({ err: err?.message || String(err), label }, "[public.controller] parte da home falhou");
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
          a.highlight_until,
          a.plan
        FROM ads a
        WHERE a.status = 'active'
          AND a.highlight_until IS NOT NULL
          AND a.highlight_until > NOW()
        ORDER BY a.highlight_until DESC
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
    ]);

    res.json({
      success: true,
      data: {
        featuredCities,
        topOpportunities,
        highlightAds: highlightAdsResult?.rows ?? [],
        opportunityAds: opportunityAdsResult?.rows ?? [],
        recentAds: recentAdsResult?.rows ?? [],
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
