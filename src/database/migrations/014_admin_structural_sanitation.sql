-- =============================================================================
-- 014 — Structural sanitation: status standardization + metrics alignment
-- =============================================================================
-- Prepares the schema for admin panel without breaking existing flows.
-- All changes are additive (ADD COLUMN IF NOT EXISTS) or safe UPSERTs.

-- ---------------------------------------------------------------------------
-- 1) ADS: ensure 'blocked' is a valid status (expand CHECK if exists, or
--    add column `priority` if missing for admin priority adjustments)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = current_schema() AND table_name = 'ads'
  ) THEN
    ALTER TABLE ads ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 0;
    ALTER TABLE ads ADD COLUMN IF NOT EXISTS blocked_reason TEXT;
    ALTER TABLE ads ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMPTZ;
  END IF;
END$$;

-- ---------------------------------------------------------------------------
-- 2) ADVERTISERS: add suspension/block support columns
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = current_schema() AND table_name = 'advertisers'
  ) THEN
    ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ;
    ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMPTZ;
    ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS status_reason TEXT;
  END IF;
END$$;

-- ---------------------------------------------------------------------------
-- 3) CITY_METRICS: add columns used by city_metrics.worker.js that are
--    missing from the 010 baseline (which only had city_id + demand_score)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = current_schema() AND table_name = 'city_metrics'
  ) THEN
    ALTER TABLE city_metrics ADD COLUMN IF NOT EXISTS visits INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE city_metrics ADD COLUMN IF NOT EXISTS leads INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE city_metrics ADD COLUMN IF NOT EXISTS ads_count INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE city_metrics ADD COLUMN IF NOT EXISTS advertisers_count INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE city_metrics ADD COLUMN IF NOT EXISTS conversion_rate DOUBLE PRECISION NOT NULL DEFAULT 0;
    ALTER TABLE city_metrics ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END$$;

-- ---------------------------------------------------------------------------
-- 4) AD_METRICS: add updated_at for cache freshness tracking by admin
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = current_schema() AND table_name = 'ad_metrics'
  ) THEN
    ALTER TABLE ad_metrics ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END$$;

-- ---------------------------------------------------------------------------
-- 5) Ensure admin_actions audit table exists for admin operations tracking
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_actions (
  id BIGSERIAL PRIMARY KEY,
  admin_user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  old_value JSONB,
  new_value JSONB,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_actions_target
  ON admin_actions (target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_admin_actions_admin
  ON admin_actions (admin_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_actions_created
  ON admin_actions (created_at DESC);
