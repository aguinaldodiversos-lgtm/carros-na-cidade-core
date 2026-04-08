import { query } from "../../../infrastructure/database/db.js";

export async function getTopAds({ limit = 20 } = {}) {
  try {
    const result = await query(
      `SELECT
         a.id, a.title, a.slug, a.city, a.state, a.brand, a.model,
         a.status, a.priority, a.highlight_until,
         COALESCE(m.views, 0) AS views,
         COALESCE(m.clicks, 0) AS clicks,
         COALESCE(m.leads, 0) AS leads,
         COALESCE(m.ctr, 0) AS ctr
       FROM ads a
       LEFT JOIN ad_metrics m ON m.ad_id = a.id
       WHERE a.status = 'active'
       ORDER BY COALESCE(m.views, 0) DESC, COALESCE(m.leads, 0) DESC
       LIMIT $1`,
      [limit]
    );
    return result.rows;
  } catch {
    return [];
  }
}

export async function getCityMetrics({ limit = 30 } = {}) {
  try {
    const result = await query(
      `SELECT
         c.id, c.name, c.slug, c.state,
         COALESCE(cm.visits, 0) AS visits,
         COALESCE(cm.leads, 0) AS leads,
         COALESCE(cm.ads_count, 0) AS ads_count,
         COALESCE(cm.advertisers_count, 0) AS advertisers_count,
         COALESCE(cm.conversion_rate, 0) AS conversion_rate,
         COALESCE(cm.demand_score, 0) AS demand_score,
         cm.updated_at AS metrics_updated_at
       FROM cities c
       LEFT JOIN city_metrics cm ON cm.city_id = c.id
       ORDER BY COALESCE(cm.ads_count, 0) DESC, COALESCE(cm.demand_score, 0) DESC
       LIMIT $1`,
      [limit]
    );
    return result.rows;
  } catch {
    return [];
  }
}

export async function getRecentEvents({ limit = 50 } = {}) {
  try {
    const result = await query(
      `SELECT
         e.id, e.ad_id, e.event_type, e.created_at,
         a.title AS ad_title, a.city AS ad_city
       FROM ad_events e
       LEFT JOIN ads a ON a.id = e.ad_id
       ORDER BY e.created_at DESC
       LIMIT $1`,
      [limit]
    );
    return result.rows;
  } catch {
    return [];
  }
}

export async function getSeoCityMetrics({ limit = 30 } = {}) {
  try {
    const result = await query(
      `SELECT *
       FROM seo_city_metrics
       ORDER BY date DESC
       LIMIT $1`,
      [limit]
    );
    return result.rows;
  } catch {
    try {
      const result = await query(
        `SELECT *
         FROM city_seo_metrics
         ORDER BY updated_at DESC
         LIMIT $1`,
        [limit]
      );
      return result.rows;
    } catch {
      return [];
    }
  }
}
