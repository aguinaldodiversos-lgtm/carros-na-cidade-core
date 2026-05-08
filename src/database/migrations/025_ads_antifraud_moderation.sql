-- =============================================================================
-- 025 — Antifraude e moderação (Tarefa 3 da rodada de antifraude)
-- =============================================================================
--
-- Camada inicial de antifraude/moderação:
--
--   1. ADD COLUMN IF NOT EXISTS em `ads` (todas opcionais, com default seguro)
--      • risk_score, risk_level, risk_reasons       — cálculo do adRiskService
--      • reviewed_at, reviewed_by, rejection_reason — decisão admin
--      • correction_requested_reason                — solicitação ao dono
--      • fipe_reference_value, fipe_diff_percent    — comparação preço↔FIPE
--      • structural_change_count                    — auditoria de edições
--
--   2. CREATE TABLE IF NOT EXISTS ad_risk_signals       — sinais detalhados
--   3. CREATE TABLE IF NOT EXISTS ad_moderation_events  — histórico auditável
--
-- INTENCIONALMENTE NÃO INCLUI: CHECK constraint em ads.status. A auditoria de
-- produção (SELECT DISTINCT status FROM ads) precisa ser feita primeiro para
-- detectar legados. A constraint vai numa migration posterior, depois de
-- normalizar quaisquer rows fora do enum.
--
-- Garantias:
--   - Nenhuma coluna obrigatória sem default.
--   - Nenhum DROP / DELETE de coluna ou linha.
--   - Idempotente — pode rodar múltiplas vezes sem erro.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) ads — colunas de risco e moderação
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = current_schema() AND table_name = 'ads'
  ) THEN
    -- Score numérico (0-100). Default 0 = não calculado / baixo risco.
    ALTER TABLE ads
      ADD COLUMN IF NOT EXISTS risk_score INTEGER NOT NULL DEFAULT 0;

    -- Nível agregado: low | medium | high | critical (sem CHECK ainda;
    -- o enum vive em src/shared/constants/status.js — AD_RISK_LEVEL).
    ALTER TABLE ads
      ADD COLUMN IF NOT EXISTS risk_level TEXT NOT NULL DEFAULT 'low';

    -- Lista de motivos do score (cópia textual do que `ad_risk_signals` tem
    -- detalhado; aqui é um snapshot para o admin ler em 1 query).
    -- Estrutura: [{ code, message, severity, score_delta, metadata }]
    ALTER TABLE ads
      ADD COLUMN IF NOT EXISTS risk_reasons JSONB NOT NULL DEFAULT '[]'::jsonb;

    -- Decisão admin
    ALTER TABLE ads
      ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

    -- reviewed_by mantém o tipo do users.id atual (BIGINT no schema baseline);
    -- TEXT é seguro contra evolução futura sem afetar JOINs (CAST natural).
    ALTER TABLE ads
      ADD COLUMN IF NOT EXISTS reviewed_by TEXT;

    ALTER TABLE ads
      ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

    ALTER TABLE ads
      ADD COLUMN IF NOT EXISTS correction_requested_reason TEXT;

    -- Snapshot do valor FIPE no momento da publicação. Permite calcular a
    -- diferença sem reconsultar o provedor externo. NULL = FIPE indisponível.
    ALTER TABLE ads
      ADD COLUMN IF NOT EXISTS fipe_reference_value NUMERIC(14,2);

    -- Diferença percentual = (price - fipe_value) / fipe_value * 100. Valores
    -- negativos = preço abaixo da FIPE. NULL = FIPE indisponível.
    ALTER TABLE ads
      ADD COLUMN IF NOT EXISTS fipe_diff_percent NUMERIC(6,2);

    -- Contador para detectar tentativas repetidas de troca de campos
    -- estruturais (marca/modelo/etc). Usado pelo adRiskService.
    ALTER TABLE ads
      ADD COLUMN IF NOT EXISTS structural_change_count INTEGER NOT NULL DEFAULT 0;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_ads_status_risk
  ON ads (status, risk_score DESC);

CREATE INDEX IF NOT EXISTS idx_ads_pending_review_priority
  ON ads (status, risk_score DESC, created_at ASC)
  WHERE status = 'pending_review';

-- ---------------------------------------------------------------------------
-- 2) ad_risk_signals — auditoria detalhada de cada sinal calculado
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ad_risk_signals (
  id BIGSERIAL PRIMARY KEY,
  ad_id BIGINT NOT NULL,
  signal_code TEXT NOT NULL,         -- ex: PRICE_BELOW_FIPE_REVIEW
  severity TEXT NOT NULL,            -- low | medium | high | critical
  score_delta INTEGER NOT NULL DEFAULT 0,
  message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ad_risk_signals_ad_id
  ON ad_risk_signals (ad_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ad_risk_signals_code
  ON ad_risk_signals (signal_code);

-- ---------------------------------------------------------------------------
-- 3) ad_moderation_events — histórico de decisões e transições
-- ---------------------------------------------------------------------------
--
-- Eventos esperados (event_type):
--   risk_score_calculated
--   sent_to_review
--   moderation_approved
--   moderation_rejected
--   correction_requested
--   boost_blocked_due_to_status
--   structural_field_change_detected
--
CREATE TABLE IF NOT EXISTS ad_moderation_events (
  id BIGSERIAL PRIMARY KEY,
  ad_id BIGINT NOT NULL,
  event_type TEXT NOT NULL,
  actor_user_id TEXT,                -- admin ou system; null = sistema
  actor_role TEXT,                   -- admin | system | owner
  from_status TEXT,
  to_status TEXT,
  reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ad_moderation_events_ad_id
  ON ad_moderation_events (ad_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ad_moderation_events_event_type
  ON ad_moderation_events (event_type, created_at DESC);
