-- Suporte ao ranking híbrido (demanda por cidade em buscas)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'city_metrics'
  ) THEN
    ALTER TABLE city_metrics ADD COLUMN IF NOT EXISTS demand_score DOUBLE PRECISION DEFAULT 0;
  END IF;
END$$;
