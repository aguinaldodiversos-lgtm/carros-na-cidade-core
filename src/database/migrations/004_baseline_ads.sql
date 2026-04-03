-- Baseline: ads (núcleo do marketplace)
-- Colunas alinhadas a src/modules/ads/ads.repository.js (INSERT/UPDATE).
-- CHECKs de enums (body_type, fuel, transmission) podem existir no banco real;
--   comparar com docs/database/ads-schema-contract.sql e npm run db:check-ads
-- Ver: docs/database/BASELINE_MIGRATIONS.md

-- Sem FK declarada (compatível com schemas legados); índices abaixo cobrem joins frequentes.
CREATE TABLE IF NOT EXISTS ads (
  id BIGSERIAL PRIMARY KEY,
  advertiser_id BIGINT,
  title TEXT NOT NULL,
  description TEXT,
  price NUMERIC(14, 2) NOT NULL,
  city_id BIGINT,
  city TEXT,
  state TEXT,
  category TEXT,
  brand TEXT NOT NULL,
  model TEXT NOT NULL,
  year INTEGER NOT NULL,
  mileage INTEGER NOT NULL DEFAULT 0,
  body_type TEXT,
  fuel_type TEXT,
  transmission TEXT,
  below_fipe BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'active',
  plan TEXT NOT NULL DEFAULT 'free',
  slug TEXT NOT NULL,
  highlight_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE ads ADD COLUMN IF NOT EXISTS advertiser_id BIGINT;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS price NUMERIC(14, 2);
ALTER TABLE ads ADD COLUMN IF NOT EXISTS city_id BIGINT;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS state TEXT;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS brand TEXT;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS model TEXT;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS year INTEGER;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS mileage INTEGER DEFAULT 0;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS body_type TEXT;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS fuel_type TEXT;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS transmission TEXT;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS below_fipe BOOLEAN DEFAULT false;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
ALTER TABLE ads ADD COLUMN IF NOT EXISTS plan TEXT DEFAULT 'free';
ALTER TABLE ads ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS highlight_until TIMESTAMPTZ;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE ads ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS ads_slug_idx ON ads (slug);
CREATE INDEX IF NOT EXISTS ads_status_city_id_idx ON ads (status, city_id);
CREATE INDEX IF NOT EXISTS ads_advertiser_id_idx ON ads (advertiser_id);
CREATE INDEX IF NOT EXISTS ads_created_at_idx ON ads (created_at DESC);

COMMENT ON TABLE ads IS 'Anúncios; status inclui active/deleted; enums opcionais via CHECK no banco.';

-- Colunas opcionais referenciadas em filtros / legado (somente se ainda não existirem)
ALTER TABLE ads ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS search_vector tsvector;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 1;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS gearbox TEXT;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS cambio TEXT;

-- Galeria (JSON array de URLs); espelha `011_ads_images.sql` — IF NOT EXISTS é idempotente.
ALTER TABLE ads ADD COLUMN IF NOT EXISTS images JSONB NOT NULL DEFAULT '[]'::jsonb;
COMMENT ON COLUMN ads.images IS 'Array JSON de URLs de imagem (capa = primeiro elemento).';
