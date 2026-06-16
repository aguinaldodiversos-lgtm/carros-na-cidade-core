-- =============================================================================
-- 036 — analytics_events: analytics interno first-party (Fase 4.4)
-- =============================================================================
--
-- Analytics anônimo e operacional do portal. NÃO armazena dados pessoais
-- (nome/cpf/telefone/e-mail), NÃO armazena IP bruto (só um hash do
-- User-Agent para distinguir dispositivos sem identificar pessoas) e NÃO
-- armazena geolocalização precisa. session_id é um UUID aleatório de
-- primeira-parte gerado no navegador.
--
-- Tabela append-only de alto volume: sem FK (ad_id/blog_post_id são apenas
-- referências numéricas; um anúncio apagado não deve quebrar o histórico).
-- Idempotente: CREATE ... IF NOT EXISTS + constraint/índices guardados.
-- =============================================================================

CREATE TABLE IF NOT EXISTS analytics_events (
  id              BIGSERIAL PRIMARY KEY,

  event_type      TEXT        NOT NULL,

  -- Página
  path            TEXT,
  canonical_path  TEXT,

  -- Entidade genérica (city|region|ad|blog_post|store|search...)
  entity_type     TEXT,
  entity_id       TEXT,

  -- Território
  city_slug       TEXT,
  city_name       TEXT,
  state           TEXT,
  region_slug     TEXT,

  -- Referências (sem FK — ver cabeçalho)
  ad_id           BIGINT,
  blog_post_id    BIGINT,

  -- Origem
  referrer        TEXT,
  utm_source      TEXT,
  utm_medium      TEXT,
  utm_campaign    TEXT,

  -- Contexto anônimo
  device_type     TEXT,
  user_agent_hash TEXT,
  session_id      TEXT,

  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Whitelist de event_type (tabela nova → CHECK validado direto, idempotente).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'analytics_events_event_type_chk') THEN
    ALTER TABLE analytics_events
      ADD CONSTRAINT analytics_events_event_type_chk
      CHECK (event_type IN (
        'page_view',
        'ad_view',
        'city_page_view',
        'region_page_view',
        'below_fipe_page_view',
        'blog_view',
        'whatsapp_click',
        'phone_click',
        'finance_click',
        'search_performed',
        'seller_store_view'
      ));
  END IF;
END $$;

-- Índices de leitura (rankings/timeseries do dashboard admin).
CREATE INDEX IF NOT EXISTS analytics_events_occurred_at_idx   ON analytics_events (occurred_at DESC);
CREATE INDEX IF NOT EXISTS analytics_events_event_type_idx    ON analytics_events (event_type);
CREATE INDEX IF NOT EXISTS analytics_events_city_slug_idx     ON analytics_events (city_slug);
CREATE INDEX IF NOT EXISTS analytics_events_region_slug_idx   ON analytics_events (region_slug);
CREATE INDEX IF NOT EXISTS analytics_events_ad_id_idx         ON analytics_events (ad_id);
CREATE INDEX IF NOT EXISTS analytics_events_blog_post_id_idx  ON analytics_events (blog_post_id);
CREATE INDEX IF NOT EXISTS analytics_events_path_idx          ON analytics_events (path);
CREATE INDEX IF NOT EXISTS analytics_events_session_id_idx    ON analytics_events (session_id);

-- Caminho quente: filtra por tipo + janela temporal (timeseries por evento).
CREATE INDEX IF NOT EXISTS analytics_events_type_time_idx     ON analytics_events (event_type, occurred_at DESC);

COMMENT ON TABLE analytics_events IS
  'Analytics interno first-party (Fase 4.4). Anônimo: sem PII, sem IP bruto, sem geo precisa. Retenção sugerida 180-365 dias.';
COMMENT ON COLUMN analytics_events.session_id IS
  'UUID aleatório de primeira-parte (cookie/localStorage), sem identificação pessoal.';
COMMENT ON COLUMN analytics_events.user_agent_hash IS
  'SHA-256 do User-Agent — distingue dispositivos sem armazenar o UA bruto nem identificar a pessoa.';
