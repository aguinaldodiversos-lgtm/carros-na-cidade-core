-- =============================================================================
-- 015 — Canonical SEO city metrics table
-- =============================================================================
-- DECISION: seo_city_metrics is the canonical name.
-- Legacy code referencing city_seo_metrics gets a backward-compatible VIEW.
--
-- Schema merges both shapes:
--   New modules (seo-metrics.repository, ga4.collector): (date, city) as PK
--   Legacy workers (dataCollector, seoCollector): (city_name) as PK
--
-- The canonical table uses (date, city) as PK to support time-series.
-- The VIEW city_seo_metrics provides latest-per-city for legacy code.

CREATE TABLE IF NOT EXISTS seo_city_metrics (
  date        DATE         NOT NULL DEFAULT CURRENT_DATE,
  city        TEXT         NOT NULL,
  impressions INTEGER      NOT NULL DEFAULT 0,
  clicks      INTEGER      NOT NULL DEFAULT 0,
  ctr         DOUBLE PRECISION NOT NULL DEFAULT 0,
  avg_position DOUBLE PRECISION NOT NULL DEFAULT 0,
  sessions    INTEGER      NOT NULL DEFAULT 0,
  users_count INTEGER      NOT NULL DEFAULT 0,
  conversions INTEGER      NOT NULL DEFAULT 0,
  source      TEXT         DEFAULT 'google',
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (date, city)
);

CREATE INDEX IF NOT EXISTS idx_seo_city_metrics_city
  ON seo_city_metrics (city);
CREATE INDEX IF NOT EXISTS idx_seo_city_metrics_date
  ON seo_city_metrics (date DESC);

-- Backward-compatible VIEW for legacy workers that use city_seo_metrics.
-- Shows latest row per city. Legacy INSERT/UPSERT will fail on a VIEW,
-- so the migration also creates the table if the VIEW cannot be created
-- (e.g., city_seo_metrics already exists as a table).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = current_schema()
      AND table_name = 'city_seo_metrics'
  ) THEN
    EXECUTE $view$
      CREATE VIEW city_seo_metrics AS
      SELECT DISTINCT ON (city)
        city AS city_name,
        impressions,
        clicks,
        ctr,
        avg_position,
        sessions,
        created_at AS last_updated
      FROM seo_city_metrics
      ORDER BY city, date DESC
    $view$;
  END IF;
END$$;
