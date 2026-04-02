-- Contrato documentado da tabela `public.ads` (alinhamento app ↔ Postgres).
-- Baseline versionada (CREATE incremental): `src/database/migrations/004_baseline_ads.sql` + `docs/database/BASELINE_MIGRATIONS.md`.
-- Ajuste CHECKs reais no banco para coincidir com `src/modules/ads/ads.canonical.constants.js`.
-- Use `npm run db:check-ads` em staging: lista CHECKs reais e compara slugs com `ads.canonical.constants.js`.
-- Modo CI: `CHECK_ADS_STRICT=1 npm run db:check-ads` ou `node scripts/print-ads-constraints.js --strict` (exit 1 se divergir).

-- Exemplo de constraints esperadas (nomes podem variar por migração):

-- ALTER TABLE public.ads DROP CONSTRAINT IF EXISTS ads_body_type_check;
-- ALTER TABLE public.ads ADD CONSTRAINT ads_body_type_check CHECK (
--   body_type IS NULL OR body_type IN (
--     'suv', 'hatch', 'sedan', 'picape', 'coupe', 'minivan', 'wagon'
--   )
-- );

-- ALTER TABLE public.ads DROP CONSTRAINT IF EXISTS ads_fuel_type_check;
-- ALTER TABLE public.ads ADD CONSTRAINT ads_fuel_type_check CHECK (
--   fuel_type IS NULL OR fuel_type IN (
--     'flex', 'gasolina', 'diesel', 'eletrico', 'hibrido', 'gnv', 'etanol'
--   )
-- );

-- ALTER TABLE public.ads DROP CONSTRAINT IF EXISTS ads_transmission_check;
-- ALTER TABLE public.ads ADD CONSTRAINT ads_transmission_check CHECK (
--   transmission IS NULL OR transmission IN (
--     'automatico', 'manual', 'cvt'
--   )
-- );

COMMENT ON TABLE public.ads IS
  'Contrato de enums: ver ads.canonical.constants.js e este arquivo.';

-- Coluna de galeria (obrigatória no app atual): ver migration 011 e ads.repository.js
-- ALTER TABLE public.ads ADD COLUMN IF NOT EXISTS images JSONB NOT NULL DEFAULT '[]'::jsonb;
-- COMMENT ON COLUMN public.ads.images IS 'URLs em JSON array; capa = índice 0.';
