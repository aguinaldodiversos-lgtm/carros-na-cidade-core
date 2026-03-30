-- Tabelas usadas em JOINs de `buildAdsSearchQuery` (busca pública).
-- Sem elas, `searchAdsWithFilters` cai no fallback seguro e devolve `data: []` (ok: false).

CREATE TABLE IF NOT EXISTS ad_metrics (
  ad_id BIGINT PRIMARY KEY REFERENCES ads(id) ON DELETE CASCADE,
  views INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  leads INTEGER NOT NULL DEFAULT 0,
  ctr DOUBLE PRECISION NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS city_metrics (
  city_id BIGINT PRIMARY KEY REFERENCES cities(id) ON DELETE CASCADE,
  demand_score DOUBLE PRECISION NOT NULL DEFAULT 0
);
