-- Baseline: cities (território / FK para ads e advertisers)
-- Idempotente: CREATE IF NOT EXISTS + colunas opcionais com ADD COLUMN IF NOT EXISTS
-- Ver: docs/database/BASELINE_MIGRATIONS.md

CREATE TABLE IF NOT EXISTS cities (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  state TEXT NOT NULL,
  slug TEXT NOT NULL
);

ALTER TABLE cities ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE cities ADD COLUMN IF NOT EXISTS state TEXT;
ALTER TABLE cities ADD COLUMN IF NOT EXISTS slug TEXT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM cities
    WHERE slug IS NOT NULL
    GROUP BY slug
    HAVING COUNT(*) > 1
  ) THEN
    CREATE INDEX IF NOT EXISTS cities_slug_idx ON cities (slug);
    RAISE NOTICE '001_baseline_cities: índice único em cities.slug ignorado por slugs duplicados.';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS cities_slug_key ON cities (slug);
  END IF;
END $$;

COMMENT ON TABLE cities IS 'Municípios; slug único usado em rotas /cidade/[slug].';

-- Colunas usadas em read-models e snapshot (podem já existir em bancos antigos)
ALTER TABLE cities ADD COLUMN IF NOT EXISTS stage TEXT;
ALTER TABLE cities ADD COLUMN IF NOT EXISTS population BIGINT;
ALTER TABLE cities ADD COLUMN IF NOT EXISTS region TEXT;
