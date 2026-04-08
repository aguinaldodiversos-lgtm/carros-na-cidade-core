/**
 * Canonical ad_metrics refresh logic.
 *
 * DECISION: ad_metrics is a TABLE (not a materialized view).
 * Migration 010 creates it as a TABLE. All workers MUST use this UPSERT
 * instead of REFRESH MATERIALIZED VIEW.
 *
 * This aggregates views/clicks/leads/ctr from ad_events into ad_metrics.
 * Safe for concurrent execution (ON CONFLICT UPSERT is idempotent).
 */

const UPSERT_AD_METRICS_SQL = `
  INSERT INTO ad_metrics (ad_id, views, clicks, leads, ctr, updated_at)
  SELECT
    a.id,
    COUNT(e.id) FILTER (WHERE e.event_type = 'view'),
    COUNT(e.id) FILTER (WHERE e.event_type = 'click'),
    COUNT(e.id) FILTER (WHERE e.event_type = 'lead'),
    CASE
      WHEN COUNT(e.id) FILTER (WHERE e.event_type = 'view') > 0
      THEN ROUND(
        COUNT(e.id) FILTER (WHERE e.event_type = 'click')::numeric
        / COUNT(e.id) FILTER (WHERE e.event_type = 'view')::numeric
      , 6)
      ELSE 0
    END,
    NOW()
  FROM ads a
  LEFT JOIN ad_events e ON e.ad_id = a.id
  WHERE a.status != 'deleted'
  GROUP BY a.id
  ON CONFLICT (ad_id)
  DO UPDATE SET
    views = EXCLUDED.views,
    clicks = EXCLUDED.clicks,
    leads = EXCLUDED.leads,
    ctr = EXCLUDED.ctr,
    updated_at = NOW()
`;

/**
 * Refresh ad_metrics TABLE via aggregation UPSERT from ad_events.
 * @param {import('pg').Pool} pool
 */
export async function refreshAdMetricsTable(pool) {
  await pool.query(UPSERT_AD_METRICS_SQL);
}
