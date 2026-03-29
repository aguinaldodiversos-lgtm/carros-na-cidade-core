-- Baseline: cities (território / FK para ads e advertisers)
-- Idempotente: CREATE IF NOT EXISTS + colunas opcionais com ADD COLUMN IF NOT EXISTS
-- Ver: docs/database/BASELINE_MIGRATIONS.md

CREATE TABLE IF NOT EXISTS cities (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  state TEXT NOT NULL,
  slug TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS cities_slug_key ON cities (slug);

COMMENT ON TABLE cities IS 'Municípios; slug único usado em rotas /cidade/[slug].';

-- Colunas usadas em read-models e snapshot (podem já existir em bancos antigos)
ALTER TABLE cities ADD COLUMN IF NOT EXISTS stage TEXT;
ALTER TABLE cities ADD COLUMN IF NOT EXISTS population BIGINT;
ALTER TABLE cities ADD COLUMN IF NOT EXISTS region TEXT;
