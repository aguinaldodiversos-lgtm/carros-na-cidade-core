-- Compatibilidade entre bancos novos, legados e parcialmente migrados.
-- Garante as colunas mínimas usadas pelo código atual sem exigir intervenção manual.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = current_schema() AND table_name = 'cities'
  ) THEN
    ALTER TABLE cities ADD COLUMN IF NOT EXISTS name TEXT;
    ALTER TABLE cities ADD COLUMN IF NOT EXISTS state TEXT;
    ALTER TABLE cities ADD COLUMN IF NOT EXISTS slug TEXT;
    ALTER TABLE cities ADD COLUMN IF NOT EXISTS stage TEXT;
    ALTER TABLE cities ADD COLUMN IF NOT EXISTS population BIGINT;
    ALTER TABLE cities ADD COLUMN IF NOT EXISTS region TEXT;

    UPDATE cities
    SET slug = LOWER(
      REGEXP_REPLACE(
        CONCAT_WS('-', NULLIF(BTRIM(name), ''), NULLIF(BTRIM(state), ''), id::text),
        '[^a-zA-Z0-9]+',
        '-',
        'g'
      )
    )
    WHERE slug IS NULL OR BTRIM(slug) = '';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = current_schema() AND table_name = 'users'
  ) THEN
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
    ALTER TABLE users ADD COLUMN IF NOT EXISTS is_email_verified BOOLEAN;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_attempts INTEGER DEFAULT 0;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_token TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_expires TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
    ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

    UPDATE users
    SET email_verified = COALESCE(email_verified, is_email_verified, true)
    WHERE email_verified IS NULL;

    UPDATE users
    SET role = COALESCE(NULLIF(role, ''), 'user'),
        plan = COALESCE(NULLIF(plan, ''), 'free'),
        document_verified = COALESCE(document_verified, false),
        failed_attempts = COALESCE(failed_attempts, 0)
    WHERE role IS NULL
       OR plan IS NULL
       OR document_verified IS NULL
       OR failed_attempts IS NULL;

    CREATE INDEX IF NOT EXISTS users_email_verification_token_idx
      ON users (email_verification_token)
      WHERE email_verification_token IS NOT NULL;

    CREATE INDEX IF NOT EXISTS users_reset_token_idx
      ON users (reset_token)
      WHERE reset_token IS NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = current_schema() AND table_name = 'advertisers'
  ) THEN
    ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS user_id TEXT;
    ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS city_id BIGINT;
    ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS name TEXT;
    ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS slug TEXT;
    ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS email TEXT;
    ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS company_name TEXT;
    ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS plan TEXT DEFAULT 'free';
    ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
    ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT false;
    ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS phone TEXT;
    ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS whatsapp TEXT;
    ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS mobile_phone TEXT;
    ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS telephone TEXT;
    ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS telefone TEXT;
    ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
    ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

    UPDATE advertisers
    SET name = COALESCE(NULLIF(name, ''), NULLIF(company_name, ''), NULLIF(email, ''), 'Anunciante'),
        plan = COALESCE(NULLIF(plan, ''), 'free'),
        status = COALESCE(NULLIF(status, ''), 'active'),
        verified = COALESCE(verified, false)
    WHERE name IS NULL
       OR plan IS NULL
       OR status IS NULL
       OR verified IS NULL;

    UPDATE advertisers
    SET slug = LOWER(
      REGEXP_REPLACE(
        CONCAT_WS('-', NULLIF(BTRIM(name), ''), id::text),
        '[^a-zA-Z0-9]+',
        '-',
        'g'
      )
    )
    WHERE slug IS NULL OR BTRIM(slug) = '';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = current_schema() AND table_name = 'ads'
  ) THEN
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
    ALTER TABLE ads ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
    ALTER TABLE ads ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
    ALTER TABLE ads ADD COLUMN IF NOT EXISTS search_vector tsvector;
    ALTER TABLE ads ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 1;
    ALTER TABLE ads ADD COLUMN IF NOT EXISTS gearbox TEXT;
    ALTER TABLE ads ADD COLUMN IF NOT EXISTS cambio TEXT;
    ALTER TABLE ads ADD COLUMN IF NOT EXISTS images JSONB DEFAULT '[]'::jsonb;

    UPDATE ads
    SET mileage = COALESCE(mileage, 0),
        below_fipe = COALESCE(below_fipe, false),
        status = COALESCE(NULLIF(status, ''), 'active'),
        plan = COALESCE(NULLIF(plan, ''), 'free'),
        priority = COALESCE(priority, 1),
        images = COALESCE(images, '[]'::jsonb)
    WHERE mileage IS NULL
       OR below_fipe IS NULL
       OR status IS NULL
       OR plan IS NULL
       OR priority IS NULL
       OR images IS NULL;
  END IF;
END $$;

DO $$
BEGIN
  CREATE TABLE IF NOT EXISTS refresh_tokens (
    id BIGSERIAL PRIMARY KEY,
    user_id TEXT NOT NULL,
    token TEXT,
    token_hash TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    family_id TEXT,
    created_ip TEXT,
    user_agent TEXT,
    revoked_at TIMESTAMPTZ,
    rotated_at TIMESTAMPTZ
  );

  ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS user_id TEXT;
  ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS token TEXT;
  ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS token_hash TEXT;
  ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
  ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS revoked BOOLEAN DEFAULT false;
  ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
  ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS family_id TEXT;
  ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS created_ip TEXT;
  ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS user_agent TEXT;
  ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;
  ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS rotated_at TIMESTAMPTZ;

  UPDATE refresh_tokens
  SET revoked = COALESCE(revoked, false),
      created_at = COALESCE(created_at, NOW())
  WHERE revoked IS NULL OR created_at IS NULL;

  CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens (user_id);
  CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens (token_hash);
  CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens (expires_at);
END $$;
