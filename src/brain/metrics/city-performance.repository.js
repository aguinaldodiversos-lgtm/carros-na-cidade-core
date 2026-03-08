import { query } from "../../infrastructure/database/db.js";

export async function upsertCityPerformanceDaily({
  cityId,
  date,
  activeAds,
  leads,
  views,
  clicks,
  ctr,
  seoPages,
  indexablePages,
  organicSessions,
  conversions,
  score,
}) {
  await query(
    `
    INSERT INTO city_performance_daily
      (city_id, date, active_ads, leads, views, clicks, ctr, seo_pages, indexable_pages, organic_sessions, conversions, score, created_at, updated_at)
    VALUES
      ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW(),NOW())
    ON CONFLICT (city_id, date)
    DO UPDATE SET
      active_ads = EXCLUDED.active_ads,
      leads = EXCLUDED.leads,
      views = EXCLUDED.views,
      clicks = EXCLUDED.clicks,
      ctr = EXCLUDED.ctr,
      seo_pages = EXCLUDED.seo_pages,
      indexable_pages = EXCLUDED.indexable_pages,
      organic_sessions = EXCLUDED.organic_sessions,
      conversions = EXCLUDED.conversions,
      score = EXCLUDED.score,
      updated_at = NOW()
    `,
    [
      cityId,
      date,
      activeAds,
      leads,
      views,
      clicks,
      ctr,
      seoPages,
      indexablePages,
      organicSessions,
      conversions,
      score,
    ]
  );
}

export async function listCityPerformanceInputs(limit = 6000) {
  const result = await query(
    `
    WITH ad_base AS (
      SELECT
        a.city_id,
        COUNT(*) FILTER (WHERE a.status = 'active')::int AS active_ads
      FROM ads a
      WHERE a.city_id IS NOT NULL
      GROUP BY a.city_id
    ),
    event_base AS (
      SELECT
        a.city_id,
        COUNT(*) FILTER (WHERE e.event_type = 'lead')::int AS leads,
        COUNT(*) FILTER (WHERE e.event_type = 'view')::int AS views,
        COUNT(*) FILTER (WHERE e.event_type = 'click')::int AS clicks
      FROM ad_events e
      JOIN ads a ON a.id = e.ad_id
      WHERE a.city_id IS NOT NULL
        AND e.created_at >= NOW() - INTERVAL '7 days'
      GROUP BY a.city_id
    ),
    seo_base AS (
      SELECT
        sp.city_id,
        COUNT(*)::int AS seo_pages,
        COUNT(*) FILTER (WHERE sp.is_indexable = true)::int AS indexable_pages
      FROM seo_publications sp
      WHERE sp.city_id IS NOT NULL
        AND sp.status = 'published'
      GROUP BY sp.city_id
    ),
    analytics_base AS (
      SELECT
        c.id AS city_id,
        COALESCE(SUM(scm.sessions), 0)::int AS organic_sessions,
        COALESCE(SUM(scm.conversions), 0)::int AS conversions
      FROM cities c
      LEFT JOIN seo_city_metrics scm
        ON LOWER(scm.city) = LOWER(c.name)
       AND scm.date >= CURRENT_DATE - INTERVAL '7 days'
      GROUP BY c.id
    )
    SELECT
      c.id AS city_id,
      c.stage,
      COALESCE(ab.active_ads, 0) AS active_ads,
      COALESCE(eb.leads, 0) AS leads,
      COALESCE(eb.views, 0) AS views,
      COALESCE(eb.clicks, 0) AS clicks,
      CASE
        WHEN COALESCE(eb.views, 0) > 0
        THEN ROUND((COALESCE(eb.clicks, 0)::numeric / eb.views::numeric), 6)
        ELSE 0
      END AS ctr,
      COALESCE(sb.seo_pages, 0) AS seo_pages,
      COALESCE(sb.indexable_pages, 0) AS indexable_pages,
      COALESCE(an.organic_sessions, 0) AS organic_sessions,
      COALESCE(an.conversions, 0) AS conversions
    FROM cities c
    LEFT JOIN ad_base ab ON ab.city_id = c.id
    LEFT JOIN event_base eb ON eb.city_id = c.id
    LEFT JOIN seo_base sb ON sb.city_id = c.id
    LEFT JOIN analytics_base an ON an.city_id = c.id
    WHERE c.is_active = true
    ORDER BY c.id
    LIMIT $1
    `,
    [limit]
  );

  return result.rows;
}

export async function updateCityScoreSnapshot({
  cityId,
  performanceScore,
  organicSessions7d,
  leads7d,
  indexedPages7d,
  stage,
}) {
  await query(
    `
    INSERT INTO city_scores
      (city_id, performance_score, organic_sessions_7d, leads_7d, indexed_pages_7d, stage, refreshed_at)
    VALUES
      ($1,$2,$3,$4,$5,$6,NOW())
    ON CONFLICT (city_id)
    DO UPDATE SET
      performance_score = EXCLUDED.performance_score,
      organic_sessions_7d = EXCLUDED.organic_sessions_7d,
      leads_7d = EXCLUDED.leads_7d,
      indexed_pages_7d = EXCLUDED.indexed_pages_7d,
      stage = EXCLUDED.stage,
      refreshed_at = NOW()
    `,
    [cityId, performanceScore, organicSessions7d, leads7d, indexedPages7d, stage]
  );
}
