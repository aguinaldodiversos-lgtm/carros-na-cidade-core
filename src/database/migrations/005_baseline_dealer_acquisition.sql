-- Baseline: aquisição de lojistas (Google Places + WhatsApp + métricas)
-- Idempotente: CREATE IF NOT EXISTS + índices

CREATE TABLE IF NOT EXISTS dealer_leads (
  id BIGSERIAL PRIMARY KEY,
  city_id BIGINT NOT NULL REFERENCES cities (id) ON DELETE CASCADE,
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

CREATE UNIQUE INDEX IF NOT EXISTS dealer_leads_google_place_id_key
  ON dealer_leads (google_place_id)
  WHERE google_place_id IS NOT NULL AND TRIM(google_place_id) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS dealer_leads_city_phone_key
  ON dealer_leads (city_id, phone)
  WHERE phone IS NOT NULL AND TRIM(phone) <> '';

CREATE INDEX IF NOT EXISTS dealer_leads_city_id_idx ON dealer_leads (city_id);

COMMENT ON TABLE dealer_leads IS 'Leads de lojistas (Google Places, campanhas, etc.); phone normalizado só dígitos.';

-- Bancos que já tinham dealer_leads com schema divergente
ALTER TABLE dealer_leads ADD COLUMN IF NOT EXISTS lead_name TEXT;
ALTER TABLE dealer_leads ADD COLUMN IF NOT EXISTS lead_phone TEXT;
ALTER TABLE dealer_leads ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE dealer_leads ADD COLUMN IF NOT EXISTS google_place_id TEXT;
ALTER TABLE dealer_leads ADD COLUMN IF NOT EXISTS lead_price_range TEXT;
ALTER TABLE dealer_leads ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'google_places';
ALTER TABLE dealer_leads ADD COLUMN IF NOT EXISTS contacted BOOLEAN DEFAULT FALSE;
ALTER TABLE dealer_leads ADD COLUMN IF NOT EXISTS converted BOOLEAN DEFAULT FALSE;
ALTER TABLE dealer_leads ADD COLUMN IF NOT EXISTS converted_at TIMESTAMPTZ;
ALTER TABLE dealer_leads ADD COLUMN IF NOT EXISTS whatsapp_sent_at TIMESTAMPTZ;
ALTER TABLE dealer_leads ADD COLUMN IF NOT EXISTS last_outreach_at TIMESTAMPTZ;
ALTER TABLE dealer_leads ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE dealer_leads ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE TABLE IF NOT EXISTS dealer_lead_interactions (
  id BIGSERIAL PRIMARY KEY,
  dealer_lead_id BIGINT NOT NULL REFERENCES dealer_leads (id) ON DELETE CASCADE,
  channel TEXT NOT NULL DEFAULT 'whatsapp',
  direction TEXT NOT NULL DEFAULT 'outbound',
  status TEXT,
  body TEXT,
  provider_message_id TEXT,
  raw JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS dealer_lead_interactions_lead_idx
  ON dealer_lead_interactions (dealer_lead_id);

CREATE TABLE IF NOT EXISTS dealer_followups (
  dealer_lead_id BIGINT PRIMARY KEY REFERENCES dealer_leads (id) ON DELETE CASCADE,
  step INT DEFAULT 1,
  last_sent_at TIMESTAMPTZ,
  completed BOOLEAN DEFAULT FALSE
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'city_metrics'
  ) THEN
    ALTER TABLE city_metrics ADD COLUMN IF NOT EXISTS dealer_pipeline_leads INT DEFAULT 0;
    ALTER TABLE city_metrics ADD COLUMN IF NOT EXISTS dealer_outreach_sent INT DEFAULT 0;
  END IF;
END$$;
