-- Campos extras para autopilot de crescimento por cidade (métricas explícitas + rótulo PT)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'city_opportunities'
  ) THEN
    ALTER TABLE city_opportunities ADD COLUMN IF NOT EXISTS competition_index INTEGER DEFAULT 0;
    ALTER TABLE city_opportunities ADD COLUMN IF NOT EXISTS demand_score_used DOUBLE PRECISION DEFAULT 0;
    ALTER TABLE city_opportunities ADD COLUMN IF NOT EXISTS growth_tier_pt VARCHAR(16);
  END IF;
END$$;
