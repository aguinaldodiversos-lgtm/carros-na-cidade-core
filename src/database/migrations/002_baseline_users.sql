-- Baseline: users (auth / conta)
-- O app aceita password_hash OU password (auth.service resolve em runtime).
-- Ver: docs/database/BASELINE_MIGRATIONS.md

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  password_hash TEXT,
  name TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  plan TEXT NOT NULL DEFAULT 'free',
  document_type TEXT,
  document_number TEXT,
  document_verified BOOLEAN NOT NULL DEFAULT false,
  phone TEXT,
  city TEXT,
  email_verified BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_key ON users (LOWER(email));

COMMENT ON TABLE users IS 'Contas; senha em password_hash (legado: coluna password).';

ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS whatsapp TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_email_verified BOOLEAN;
