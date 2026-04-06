-- Baseline: aquisição de lojistas (Google Places + WhatsApp + métricas)
-- Objetivo:
-- 1) funcionar em banco novo
-- 2) funcionar em banco existente com schema divergente
-- 3) garantir que colunas existam antes de criar índices/constraints dependentes

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

COMMENT ON TABLE public.dealer_leads
  IS 'Leads de lojistas (Google Places, campanhas, etc.); phone normalizado só dígitos.';

-- Compatibilidade para bancos que já tinham dealer_leads com schema divergente.
-- IMPORTANTE: isso precisa vir antes dos índices que dependem das colunas.
ALTER TABLE public.dealer_leads ADD COLUMN IF NOT EXISTS city_id BIGINT;
ALTER TABLE public.dealer_leads ADD COLUMN IF NOT EXISTS advertiser_id BIGINT;
ALTER TABLE public.dealer_leads ADD COLUMN IF NOT EXISTS lead_name TEXT;
ALTER TABLE public.dealer_leads ADD COLUMN IF NOT EXISTS lead_phone TEXT;
ALTER TABLE public.dealer_leads ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.dealer_leads ADD COLUMN IF NOT EXISTS google_place_id TEXT;
ALTER TABLE public.dealer_leads ADD COLUMN IF NOT EXISTS lead_price_range TEXT;
ALTER TABLE public.dealer_leads ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'google_places';
ALTER TABLE public.dealer_leads ADD COLUMN IF NOT EXISTS contacted BOOLEAN DEFAULT FALSE;
ALTER TABLE public.dealer_leads ADD COLUMN IF NOT EXISTS converted BOOLEAN DEFAULT FALSE;
ALTER TABLE public.dealer_leads ADD COLUMN IF NOT EXISTS converted_at TIMESTAMPTZ;
ALTER TABLE public.dealer_leads ADD COLUMN IF NOT EXISTS whatsapp_sent_at TIMESTAMPTZ;
ALTER TABLE public.dealer_leads ADD COLUMN IF NOT EXISTS last_outreach_at TIMESTAMPTZ;
ALTER TABLE public.dealer_leads ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.dealer_leads ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Defaults consistentes para tabelas antigas
ALTER TABLE public.dealer_leads ALTER COLUMN source SET DEFAULT 'google_places';
ALTER TABLE public.dealer_leads ALTER COLUMN contacted SET DEFAULT FALSE;
ALTER TABLE public.dealer_leads ALTER COLUMN converted SET DEFAULT FALSE;
ALTER TABLE public.dealer_leads ALTER COLUMN created_at SET DEFAULT NOW();
ALTER TABLE public.dealer_leads ALTER COLUMN updated_at SET DEFAULT NOW();

-- Backfill defensivo em bases antigas
UPDATE public.dealer_leads
SET
  source = COALESCE(source, 'google_places'),
  contacted = COALESCE(contacted, FALSE),
  converted = COALESCE(converted, FALSE),
  created_at = COALESCE(created_at, NOW()),
  updated_at = COALESCE(updated_at, NOW());

-- FK de city_id -> cities(id), adicionada apenas se ainda não existir

DO $$
BEGIN
  IF EXISTS (
    SELECT 1

    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'dealer_leads'
      AND column_name = 'city_id'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'dealer_leads_city_id_fkey'
  ) THEN
    ALTER TABLE public.dealer_leads
      ADD CONSTRAINT dealer_leads_city_id_fkey
      FOREIGN KEY (city_id) REFERENCES public.cities (id) ON DELETE CASCADE;
  END IF;
END
$$;

-- Índices só depois de garantir as colunas
CREATE UNIQUE INDEX IF NOT EXISTS dealer_leads_google_place_id_key
  ON public.dealer_leads (google_place_id)
  WHERE google_place_id IS NOT NULL AND TRIM(google_place_id) <> '';

    FROM dealer_leads
    WHERE google_place_id IS NOT NULL AND TRIM(google_place_id) <> ''
    GROUP BY google_place_id
    HAVING COUNT(*) > 1
  ) THEN
    CREATE INDEX IF NOT EXISTS dealer_leads_google_place_id_idx
      ON dealer_leads (google_place_id)
      WHERE google_place_id IS NOT NULL AND TRIM(google_place_id) <> '';
    RAISE NOTICE '005_baseline_dealer_acquisition: índice único em google_place_id ignorado por duplicidade legada.';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS dealer_leads_google_place_id_key
      ON dealer_leads (google_place_id)
      WHERE google_place_id IS NOT NULL AND TRIM(google_place_id) <> '';
  END IF;
END $$;
>>>>>>> 265f923 (refatora fluxo de criacao de anuncio)

CREATE UNIQUE INDEX IF NOT EXISTS dealer_leads_city_phone_key
  ON public.dealer_leads (city_id, phone)
  WHERE phone IS NOT NULL AND TRIM(phone) <> '';

CREATE INDEX IF NOT EXISTS dealer_leads_city_id_idx
  ON public.dealer_leads (city_id);

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

-- Compatibilidade para bancos antigos
ALTER TABLE public.dealer_lead_interactions ADD COLUMN IF NOT EXISTS dealer_lead_id BIGINT;
ALTER TABLE public.dealer_lead_interactions ADD COLUMN IF NOT EXISTS channel TEXT DEFAULT 'whatsapp';
ALTER TABLE public.dealer_lead_interactions ADD COLUMN IF NOT EXISTS direction TEXT DEFAULT 'outbound';
ALTER TABLE public.dealer_lead_interactions ADD COLUMN IF NOT EXISTS status TEXT;
ALTER TABLE public.dealer_lead_interactions ADD COLUMN IF NOT EXISTS body TEXT;
ALTER TABLE public.dealer_lead_interactions ADD COLUMN IF NOT EXISTS provider_message_id TEXT;
ALTER TABLE public.dealer_lead_interactions ADD COLUMN IF NOT EXISTS raw JSONB;
ALTER TABLE public.dealer_lead_interactions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.dealer_lead_interactions ALTER COLUMN channel SET DEFAULT 'whatsapp';
ALTER TABLE public.dealer_lead_interactions ALTER COLUMN direction SET DEFAULT 'outbound';
ALTER TABLE public.dealer_lead_interactions ALTER COLUMN created_at SET DEFAULT NOW();

UPDATE public.dealer_lead_interactions
SET
  channel = COALESCE(channel, 'whatsapp'),
  direction = COALESCE(direction, 'outbound'),
  created_at = COALESCE(created_at, NOW());

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'dealer_lead_interactions'
      AND column_name = 'dealer_lead_id'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'dealer_lead_interactions_dealer_lead_id_fkey'
  ) THEN
    ALTER TABLE public.dealer_lead_interactions
      ADD CONSTRAINT dealer_lead_interactions_dealer_lead_id_fkey
      FOREIGN KEY (dealer_lead_id) REFERENCES public.dealer_leads (id) ON DELETE CASCADE;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS dealer_lead_interactions_lead_idx
  ON public.dealer_lead_interactions (dealer_lead_id);

CREATE TABLE IF NOT EXISTS public.dealer_followups (
  dealer_lead_id BIGINT PRIMARY KEY,
  step INT DEFAULT 1,
  last_sent_at TIMESTAMPTZ,
  completed BOOLEAN DEFAULT FALSE
);

-- Compatibilidade para bancos antigos
ALTER TABLE public.dealer_followups ADD COLUMN IF NOT EXISTS dealer_lead_id BIGINT;
ALTER TABLE public.dealer_followups ADD COLUMN IF NOT EXISTS step INT DEFAULT 1;
ALTER TABLE public.dealer_followups ADD COLUMN IF NOT EXISTS last_sent_at TIMESTAMPTZ;
ALTER TABLE public.dealer_followups ADD COLUMN IF NOT EXISTS completed BOOLEAN DEFAULT FALSE;

ALTER TABLE public.dealer_followups ALTER COLUMN step SET DEFAULT 1;
ALTER TABLE public.dealer_followups ALTER COLUMN completed SET DEFAULT FALSE;

UPDATE public.dealer_followups
SET
  step = COALESCE(step, 1),
  completed = COALESCE(completed, FALSE);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'dealer_followups'
      AND column_name = 'dealer_lead_id'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'dealer_followups_dealer_lead_id_fkey'
  ) THEN
    ALTER TABLE public.dealer_followups
      ADD CONSTRAINT dealer_followups_dealer_lead_id_fkey
      FOREIGN KEY (dealer_lead_id) REFERENCES public.dealer_leads (id) ON DELETE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'city_metrics'
  ) THEN
    ALTER TABLE public.city_metrics
      ADD COLUMN IF NOT EXISTS dealer_pipeline_leads INT DEFAULT 0;

    ALTER TABLE public.city_metrics
      ADD COLUMN IF NOT EXISTS dealer_outreach_sent INT DEFAULT 0;
  END IF;
END
$$;
