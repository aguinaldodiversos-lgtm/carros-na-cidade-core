-- ============================================================================
-- 002_city_intelligence_tables.sql
-- Tabelas de inteligência territorial necessárias para o sistema de cidades.
-- ============================================================================

-- cities.updated_at (necessário para city-stage.engine.js)
ALTER TABLE public.cities ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- city_metrics: garantir que tabela existe antes de adicionar colunas
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

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'city_metrics_city_id_fkey') THEN
    ALTER TABLE public.city_metrics
      ADD CONSTRAINT city_metrics_city_id_fkey FOREIGN KEY (city_id) REFERENCES public.cities(id) ON DELETE CASCADE;
  END IF;
END $$;

-- city_metrics: colunas adicionais para read-model e lead ingestion
ALTER TABLE public.city_metrics ADD COLUMN IF NOT EXISTS total_leads INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.city_metrics ADD COLUMN IF NOT EXISTS total_ads INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.city_metrics ADD COLUMN IF NOT EXISTS total_dealers INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.city_metrics ADD COLUMN IF NOT EXISTS dealer_pipeline_leads INTEGER DEFAULT 0;
ALTER TABLE public.city_metrics ADD COLUMN IF NOT EXISTS dealer_outreach_sent INTEGER DEFAULT 0;

-- city_dominance
CREATE TABLE IF NOT EXISTS public.city_dominance (
  city_id BIGINT PRIMARY KEY REFERENCES public.cities(id) ON DELETE CASCADE,
  dominance_score DOUBLE PRECISION NOT NULL DEFAULT 0,
  total_ads INTEGER NOT NULL DEFAULT 0,
  leads INTEGER NOT NULL DEFAULT 0,
  avg_ctr DOUBLE PRECISION NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- city_opportunities
CREATE TABLE IF NOT EXISTS public.city_opportunities (
  city_id BIGINT PRIMARY KEY REFERENCES public.cities(id) ON DELETE CASCADE,
  opportunity_score DOUBLE PRECISION NOT NULL DEFAULT 0,
  priority_level TEXT NOT NULL DEFAULT 'low',
  demand_index DOUBLE PRECISION NOT NULL DEFAULT 0,
  supply_index DOUBLE PRECISION NOT NULL DEFAULT 0,
  competition_index DOUBLE PRECISION NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- city_predictions
CREATE TABLE IF NOT EXISTS public.city_predictions (
  city_id BIGINT PRIMARY KEY REFERENCES public.cities(id) ON DELETE CASCADE,
  prediction_score DOUBLE PRECISION NOT NULL DEFAULT 0,
  prediction_label TEXT NOT NULL DEFAULT 'cold',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- blog_posts (conteúdo territorial por cidade)
CREATE TABLE IF NOT EXISTS public.blog_posts (
  id BIGSERIAL PRIMARY KEY,
  city TEXT,
  title TEXT NOT NULL,
  slug TEXT,
  content TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS blog_posts_city_status_idx
  ON public.blog_posts (city, status) WHERE status = 'published';

-- Índices de performance para inteligência territorial
CREATE INDEX IF NOT EXISTS city_dominance_score_idx
  ON public.city_dominance (dominance_score DESC);
CREATE INDEX IF NOT EXISTS city_opportunities_score_idx
  ON public.city_opportunities (opportunity_score DESC);
CREATE INDEX IF NOT EXISTS city_predictions_score_idx
  ON public.city_predictions (prediction_score DESC);
