-- ============================================================================
-- 001_baseline.sql — Schema consolidado do Carros na Cidade
--
-- Gerado a partir do schema real em 2026-04-15.
-- Substitui as 18 migrações anteriores (001..018) em um único arquivo
-- idempotente e limpo. Pode ser executado em banco novo ou existente.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. TABELAS CORE
-- ---------------------------------------------------------------------------

-- cities
CREATE TABLE IF NOT EXISTS public.cities (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  state TEXT NOT NULL,
  slug TEXT NOT NULL,
  stage TEXT,
  population BIGINT,
  region TEXT
);
COMMENT ON TABLE public.cities IS 'Municípios; slug único usado em rotas /cidade/[slug].';

-- users
CREATE TABLE IF NOT EXISTS public.users (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  password_hash TEXT,
  password TEXT,
  name TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  plan TEXT NOT NULL DEFAULT 'free',
  document_type TEXT,
  document_number TEXT,
  document_verified BOOLEAN NOT NULL DEFAULT FALSE,
  phone TEXT,
  whatsapp TEXT,
  city TEXT,
  email_verified BOOLEAN NOT NULL DEFAULT TRUE,
  is_email_verified BOOLEAN,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  email_verification_token TEXT,
  email_verification_expires TIMESTAMPTZ,
  reset_token TEXT,
  reset_token_expires TIMESTAMPTZ,
  address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE public.users IS 'Contas; senha em password_hash (legado: coluna password).';

-- advertisers
CREATE TABLE IF NOT EXISTS public.advertisers (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL,
  city_id BIGINT NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  email TEXT,
  company_name TEXT,
  plan TEXT NOT NULL DEFAULT 'free',
  status TEXT NOT NULL DEFAULT 'active',
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  phone TEXT,
  whatsapp TEXT,
  mobile_phone TEXT,
  telephone TEXT,
  telefone TEXT,
  suspended_at TIMESTAMPTZ,
  blocked_at TIMESTAMPTZ,
  status_reason TEXT,
  address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE public.advertisers IS 'Anunciantes; slug obrigatório (ensureAdvertiserForPublishing).';

-- ads
CREATE TABLE IF NOT EXISTS public.ads (
  id BIGSERIAL PRIMARY KEY,
  advertiser_id BIGINT,
  title TEXT NOT NULL,
  description TEXT,
  price NUMERIC(14,2) NOT NULL,
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
  below_fipe BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'active',
  plan TEXT NOT NULL DEFAULT 'free',
  slug TEXT NOT NULL,
  highlight_until TIMESTAMPTZ,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  search_vector TSVECTOR,
  priority INTEGER DEFAULT 1,
  gearbox TEXT,
  cambio TEXT,
  images JSONB NOT NULL DEFAULT '[]',
  blocked_reason TEXT,
  blocked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE public.ads IS 'Anúncios; status inclui active/deleted; enums opcionais via CHECK no banco.';
COMMENT ON COLUMN public.ads.images IS 'Array JSON de URLs de imagem (capa = primeiro elemento).';

-- ---------------------------------------------------------------------------
-- 2. TABELAS DE MÉTRICAS
-- ---------------------------------------------------------------------------

-- ad_metrics
CREATE TABLE IF NOT EXISTS public.ad_metrics (
  ad_id BIGINT PRIMARY KEY,
  views INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  leads INTEGER NOT NULL DEFAULT 0,
  ctr DOUBLE PRECISION NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- city_metrics
CREATE TABLE IF NOT EXISTS public.city_metrics (
  city_id BIGINT PRIMARY KEY,
  demand_score DOUBLE PRECISION NOT NULL DEFAULT 0,
  visits INTEGER NOT NULL DEFAULT 0,
  leads INTEGER NOT NULL DEFAULT 0,
  ads_count INTEGER NOT NULL DEFAULT 0,
  advertisers_count INTEGER NOT NULL DEFAULT 0,
  conversion_rate DOUBLE PRECISION NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- seo_city_metrics
CREATE TABLE IF NOT EXISTS public.seo_city_metrics (
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  city TEXT NOT NULL,
  impressions INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  ctr DOUBLE PRECISION NOT NULL DEFAULT 0,
  avg_position DOUBLE PRECISION NOT NULL DEFAULT 0,
  sessions INTEGER NOT NULL DEFAULT 0,
  users_count INTEGER NOT NULL DEFAULT 0,
  conversions INTEGER NOT NULL DEFAULT 0,
  source TEXT DEFAULT 'google',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (date, city)
);

-- ---------------------------------------------------------------------------
-- 3. TABELAS DE AUTH
-- ---------------------------------------------------------------------------

-- refresh_tokens
CREATE TABLE IF NOT EXISTS public.refresh_tokens (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  token TEXT,
  token_hash TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked BOOLEAN NOT NULL DEFAULT FALSE,
  family_id TEXT,
  created_ip TEXT,
  user_agent TEXT,
  revoked_at TIMESTAMPTZ,
  rotated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 4. TABELAS DE DEALER ACQUISITION
-- ---------------------------------------------------------------------------

-- dealer_leads
CREATE TABLE IF NOT EXISTS public.dealer_leads (
  id BIGSERIAL PRIMARY KEY,
  city_id BIGINT NOT NULL,
  advertiser_id BIGINT,
  lead_name TEXT,
  lead_phone TEXT,
  phone TEXT,
  google_place_id TEXT,
  lead_price_range TEXT,
  source TEXT DEFAULT 'google_places',
  contacted BOOLEAN DEFAULT FALSE,
  converted BOOLEAN DEFAULT FALSE,
  converted_at TIMESTAMPTZ,
  whatsapp_sent_at TIMESTAMPTZ,
  last_outreach_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
COMMENT ON TABLE public.dealer_leads IS 'Leads de lojistas (Google Places, campanhas, etc.); phone normalizado só dígitos.';

-- dealer_lead_interactions
CREATE TABLE IF NOT EXISTS public.dealer_lead_interactions (
  id BIGSERIAL PRIMARY KEY,
  dealer_lead_id BIGINT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'whatsapp',
  direction TEXT NOT NULL DEFAULT 'outbound',
  status TEXT,
  body TEXT,
  provider_message_id TEXT,
  raw JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- dealer_followups
CREATE TABLE IF NOT EXISTS public.dealer_followups (
  dealer_lead_id BIGINT PRIMARY KEY,
  step INTEGER DEFAULT 1,
  last_sent_at TIMESTAMPTZ,
  completed BOOLEAN DEFAULT FALSE
);

-- ---------------------------------------------------------------------------
-- 5. TABELAS ADMIN
-- ---------------------------------------------------------------------------

-- admin_actions
CREATE TABLE IF NOT EXISTS public.admin_actions (
  id BIGSERIAL PRIMARY KEY,
  admin_user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  old_value JSONB,
  new_value JSONB,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 6. ÍNDICES
-- ---------------------------------------------------------------------------

-- cities
CREATE UNIQUE INDEX IF NOT EXISTS cities_slug_key ON public.cities (slug);

-- users
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_key ON public.users (LOWER(email));
CREATE INDEX IF NOT EXISTS users_email_verification_token_idx
  ON public.users (email_verification_token) WHERE email_verification_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS users_reset_token_idx
  ON public.users (reset_token) WHERE reset_token IS NOT NULL;

-- advertisers
CREATE INDEX IF NOT EXISTS advertisers_slug_idx ON public.advertisers (slug);
CREATE INDEX IF NOT EXISTS advertisers_user_id_idx ON public.advertisers (user_id);
CREATE INDEX IF NOT EXISTS advertisers_city_id_idx ON public.advertisers (city_id);

-- ads
CREATE INDEX IF NOT EXISTS ads_slug_idx ON public.ads (slug);
CREATE INDEX IF NOT EXISTS ads_status_city_id_idx ON public.ads (status, city_id);
CREATE INDEX IF NOT EXISTS ads_advertiser_id_idx ON public.ads (advertiser_id);
CREATE INDEX IF NOT EXISTS ads_created_at_idx ON public.ads (created_at DESC);

-- refresh_tokens
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON public.refresh_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON public.refresh_tokens (token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON public.refresh_tokens (expires_at);

-- dealer_leads
CREATE UNIQUE INDEX IF NOT EXISTS dealer_leads_google_place_id_key
  ON public.dealer_leads (google_place_id)
  WHERE google_place_id IS NOT NULL AND TRIM(google_place_id) <> '';
CREATE UNIQUE INDEX IF NOT EXISTS dealer_leads_city_phone_key
  ON public.dealer_leads (city_id, phone)
  WHERE phone IS NOT NULL AND TRIM(phone) <> '';
CREATE INDEX IF NOT EXISTS dealer_leads_city_id_idx ON public.dealer_leads (city_id);

-- dealer_lead_interactions
CREATE INDEX IF NOT EXISTS dealer_lead_interactions_lead_idx
  ON public.dealer_lead_interactions (dealer_lead_id);

-- seo_city_metrics
CREATE INDEX IF NOT EXISTS idx_seo_city_metrics_city ON public.seo_city_metrics (city);
CREATE INDEX IF NOT EXISTS idx_seo_city_metrics_date ON public.seo_city_metrics (date DESC);

-- admin_actions
CREATE INDEX IF NOT EXISTS idx_admin_actions_admin ON public.admin_actions (admin_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_actions_created ON public.admin_actions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_actions_target ON public.admin_actions (target_type, target_id);

-- ---------------------------------------------------------------------------
-- 7. FOREIGN KEYS (condicionais para idempotência)
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ad_metrics_ad_id_fkey') THEN
    ALTER TABLE public.ad_metrics
      ADD CONSTRAINT ad_metrics_ad_id_fkey FOREIGN KEY (ad_id) REFERENCES public.ads(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'advertisers_user_id_fkey') THEN
    ALTER TABLE public.advertisers
      ADD CONSTRAINT advertisers_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'city_metrics_city_id_fkey') THEN
    ALTER TABLE public.city_metrics
      ADD CONSTRAINT city_metrics_city_id_fkey FOREIGN KEY (city_id) REFERENCES public.cities(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dealer_leads_city_id_fkey') THEN
    ALTER TABLE public.dealer_leads
      ADD CONSTRAINT dealer_leads_city_id_fkey FOREIGN KEY (city_id) REFERENCES public.cities(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dealer_lead_interactions_dealer_lead_id_fkey') THEN
    ALTER TABLE public.dealer_lead_interactions
      ADD CONSTRAINT dealer_lead_interactions_dealer_lead_id_fkey FOREIGN KEY (dealer_lead_id) REFERENCES public.dealer_leads(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dealer_followups_dealer_lead_id_fkey') THEN
    ALTER TABLE public.dealer_followups
      ADD CONSTRAINT dealer_followups_dealer_lead_id_fkey FOREIGN KEY (dealer_lead_id) REFERENCES public.dealer_leads(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 8. ROW LEVEL SECURITY
-- ---------------------------------------------------------------------------

ALTER TABLE public.ads ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS ads_select_open ON public.ads;
  CREATE POLICY ads_select_open ON public.ads FOR SELECT USING (true);
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS ads_write_owner ON public.ads;
  CREATE POLICY ads_write_owner ON public.ads
    USING (
      current_setting('app.current_user_id', true) IS NULL
      OR current_setting('app.current_user_id', true) = ''
      OR EXISTS (
        SELECT 1 FROM public.advertisers adv
        WHERE adv.id = ads.advertiser_id
          AND adv.user_id::text = current_setting('app.current_user_id', true)
      )
    )
    WITH CHECK (
      current_setting('app.current_user_id', true) IS NULL
      OR current_setting('app.current_user_id', true) = ''
      OR EXISTS (
        SELECT 1 FROM public.advertisers adv
        WHERE adv.id = ads.advertiser_id
          AND adv.user_id::text = current_setting('app.current_user_id', true)
      )
    );
END $$;

-- ---------------------------------------------------------------------------
-- 9. VIEWS
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.city_seo_metrics AS
  SELECT DISTINCT ON (city)
    city AS city_name,
    impressions,
    clicks,
    ctr,
    avg_position,
    sessions,
    created_at AS last_updated
  FROM public.seo_city_metrics
  ORDER BY city, date DESC;
