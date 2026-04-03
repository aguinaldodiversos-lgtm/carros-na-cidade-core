-- Tabelas usadas em JOINs de `buildAdsSearchQuery` (busca pública).
-- Sem elas, `searchAdsWithFilters` cai no fallback seguro e devolve `data: []` (ok: false).

DO $$
BEGIN
  CREATE TABLE IF NOT EXISTS ad_metrics (
    ad_id BIGINT PRIMARY KEY REFERENCES ads(id) ON DELETE CASCADE,
    views INTEGER NOT NULL DEFAULT 0,
    clicks INTEGER NOT NULL DEFAULT 0,
    leads INTEGER NOT NULL DEFAULT 0,
    ctr DOUBLE PRECISION NOT NULL DEFAULT 0
  );

  ALTER TABLE ad_metrics ADD COLUMN IF NOT EXISTS views INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE ad_metrics ADD COLUMN IF NOT EXISTS clicks INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE ad_metrics ADD COLUMN IF NOT EXISTS leads INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE ad_metrics ADD COLUMN IF NOT EXISTS ctr DOUBLE PRECISION NOT NULL DEFAULT 0;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE '010_baseline_ad_and_city_metrics: tabela ad_metrics não criada/ajustada (%).', SQLERRM;
END $$;

DO $$
BEGIN
  CREATE TABLE IF NOT EXISTS city_metrics (
    city_id BIGINT PRIMARY KEY REFERENCES cities(id) ON DELETE CASCADE,
    demand_score DOUBLE PRECISION NOT NULL DEFAULT 0
  );

  ALTER TABLE city_metrics ADD COLUMN IF NOT EXISTS demand_score DOUBLE PRECISION NOT NULL DEFAULT 0;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE '010_baseline_ad_and_city_metrics: tabela city_metrics não criada/ajustada (%).', SQLERRM;
END $$;
