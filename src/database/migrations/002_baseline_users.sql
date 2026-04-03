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

ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user';
ALTER TABLE users ADD COLUMN IF NOT EXISTS plan TEXT DEFAULT 'free';
ALTER TABLE users ADD COLUMN IF NOT EXISTS document_type TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS document_number TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS document_verified BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS whatsapp TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM users
    WHERE email IS NOT NULL AND BTRIM(email) <> ''
    GROUP BY LOWER(email)
    HAVING COUNT(*) > 1
  ) THEN
    CREATE INDEX IF NOT EXISTS users_email_lower_idx ON users (LOWER(email));
    RAISE NOTICE '002_baseline_users: índice único em LOWER(users.email) ignorado por emails duplicados.';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_key ON users (LOWER(email));
  END IF;
END $$;

COMMENT ON TABLE users IS 'Contas; senha em password_hash (legado: coluna password).';
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_email_verified BOOLEAN;
