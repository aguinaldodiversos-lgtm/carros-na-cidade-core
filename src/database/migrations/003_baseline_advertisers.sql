-- Baseline: advertisers (vinculado a users e cities)
-- Ver: docs/database/BASELINE_MIGRATIONS.md

-- Sem FK na baseline: em bancos legados o tipo de users.id pode diferir (ex.: UUID).
-- Integridade no app + migration opcional `008_advertisers_user_fk.sql` quando tipos alinharem.
CREATE TABLE IF NOT EXISTS advertisers (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL,
  city_id BIGINT NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  email TEXT,
  company_name TEXT,
  plan TEXT NOT NULL DEFAULT 'free',
  status TEXT NOT NULL DEFAULT 'active',
  verified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS advertisers_slug_idx ON advertisers (slug);
CREATE INDEX IF NOT EXISTS advertisers_user_id_idx ON advertisers (user_id);
CREATE INDEX IF NOT EXISTS advertisers_city_id_idx ON advertisers (city_id);

COMMENT ON TABLE advertisers IS 'Anunciantes; slug obrigatório (ensureAdvertiserForPublishing).';

ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS whatsapp TEXT;
ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS mobile_phone TEXT;
ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS telephone TEXT;
ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS telefone TEXT;
