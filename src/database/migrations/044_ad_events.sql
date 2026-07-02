-- Tabela `ad_events` (log de eventos de anúncio: view/click/lead/etc.).
--
-- Existe em produção (ad-events.ingest.recordAdEvent grava; metrics.worker /
-- growth-brain agregam em ad_metrics; metrics.worker limpa eventos > 90 dias),
-- mas NÃO tinha migration. Esta reflete o schema REAL usado pelo código:
--   INSERT INTO ad_events (ad_id, event_type, ip_address, user_agent) VALUES (...)
--   ... COUNT(e.id) FILTER (WHERE e.event_type = 'view'|'click'|'lead') ...
--   DELETE FROM ad_events WHERE created_at < NOW() - INTERVAL '90 days'
--
-- event_type é TEXT livre de propósito (o frontend emite view/click/lead/
-- boost_start/favorite/share/finance/whatsapp) — sem CHECK para não travar
-- novos tipos. Idempotente (no-op em produção onde a tabela já existe).

DO $$
BEGIN
  CREATE TABLE IF NOT EXISTS ad_events (
    id BIGSERIAL PRIMARY KEY,
    ad_id BIGINT REFERENCES ads(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  -- Resiliência para eventual tabela legada parcial.
  ALTER TABLE ad_events ADD COLUMN IF NOT EXISTS ad_id BIGINT;
  ALTER TABLE ad_events ADD COLUMN IF NOT EXISTS event_type TEXT;
  ALTER TABLE ad_events ADD COLUMN IF NOT EXISTS ip_address TEXT;
  ALTER TABLE ad_events ADD COLUMN IF NOT EXISTS user_agent TEXT;
  ALTER TABLE ad_events ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

  -- Índices: ad_id (JOIN da agregação ad_metrics), created_at (limpeza 90d),
  -- (ad_id, event_type) para os COUNT FILTER por tipo.
  CREATE INDEX IF NOT EXISTS idx_ad_events_ad_id ON ad_events (ad_id);
  CREATE INDEX IF NOT EXISTS idx_ad_events_created_at ON ad_events (created_at);
  CREATE INDEX IF NOT EXISTS idx_ad_events_ad_id_type ON ad_events (ad_id, event_type);
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE '044_ad_events: tabela ad_events não criada/ajustada (%).', SQLERRM;
END $$;
