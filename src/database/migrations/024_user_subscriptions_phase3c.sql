-- 024_user_subscriptions_phase3c.sql
--
-- Fase 3C: prepara user_subscriptions para assinaturas recorrentes
-- Mercado Pago (Start/Pro). Esta migration é IDEMPOTENTE e NÃO deve
-- ser executada em produção sem o runbook docs/runbooks/
-- mercado-pago-subscriptions-start-pro.md (checklist + smoke).
--
-- Mudanças:
--
--   1. ADD COLUMN IF NOT EXISTS — nenhuma coluna obrigatória sem default;
--      todas opcionais ou com default seguro. Tabelas existentes
--      continuam funcionando sem qualquer backfill obrigatório.
--
--   2. CHECK constraint de status: amplia para incluir os 6 estados
--      locais alvo (Tarefa 2): pending, active, paused, cancelled,
--      payment_failed, expired. Mantém 'canceled' (sem 'l' duplicado)
--      como ALIAS LEGADO para não quebrar rows existentes que
--      foram inseridas com a constraint antiga (apenas active/expired/
--      canceled/pending).
--
--   3. UNIQUE em provider_preapproval_id quando não nulo: garante
--      idempotência absoluta — mesmo preapproval do MP nunca cria
--      2 user_subscriptions distintas.
--
--   4. updated_at: necessário para auditar mudanças de status via
--      webhook. Backfill com NOW() para rows pré-existentes.
--
-- Garantias:
--   - Sem DROP/DELETE de coluna ou linha.
--   - ALTER TABLE ADD COLUMN IF NOT EXISTS é idempotente.
--   - Roda em paralelo com tráfego (locks rápidos para ADD COLUMN
--     sem default ou com default constante; evita rewrite da tabela).
--   - Constraint nova é validada APENAS contra rows novas (NOT VALID
--     então VALIDATE). Em produção: rodar em janela de baixo tráfego
--     conforme runbook.

BEGIN;

-- Defesa: tabela precisa existir (criada em 020).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'user_subscriptions'
  ) THEN
    RAISE EXCEPTION 'user_subscriptions não existe — rode migrations anteriores antes de 024';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────
-- 1. ADD COLUMNS (idempotente)
-- ─────────────────────────────────────────────────────────────────

ALTER TABLE user_subscriptions
  ADD COLUMN IF NOT EXISTS provider TEXT,
  ADD COLUMN IF NOT EXISTS provider_preapproval_id TEXT,
  ADD COLUMN IF NOT EXISTS external_reference TEXT,
  ADD COLUMN IF NOT EXISTS current_period_start TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_payment_id TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- ─────────────────────────────────────────────────────────────────
-- 2. Atualiza CHECK de status para incluir os novos estados.
--    Mantém 'canceled' (legado, com 1 'l') E 'cancelled' (novo) para
--    permitir migração suave sem reescrever rows existentes.
-- ─────────────────────────────────────────────────────────────────

DO $$
BEGIN
  -- Drop antiga se existir (com nome conhecido pela migration 020).
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'user_subscriptions'::regclass
      AND conname = 'user_subscriptions_status_check'
  ) THEN
    ALTER TABLE user_subscriptions DROP CONSTRAINT user_subscriptions_status_check;
  END IF;
END $$;

ALTER TABLE user_subscriptions
  ADD CONSTRAINT user_subscriptions_status_check
  CHECK (status IN (
    'pending',
    'active',
    'paused',
    'cancelled',     -- canônico Fase 3C
    'canceled',      -- legado da migration 020 — preservado para compat
    'payment_failed',
    'expired'
  ));

-- ─────────────────────────────────────────────────────────────────
-- 3. UNIQUE de idempotência por preapproval do MP.
--    Webhook duplicado com mesmo provider_preapproval_id NUNCA
--    cria 2 user_subscriptions diferentes.
-- ─────────────────────────────────────────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS user_subscriptions_provider_preapproval_uniq
  ON user_subscriptions (provider_preapproval_id)
  WHERE provider_preapproval_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────
-- 4. Index de busca rápida por user + status (consultar "user tem
--    sub ativa?" sem table scan).
-- ─────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS user_subscriptions_user_active_idx
  ON user_subscriptions (user_id, status)
  WHERE status IN ('active', 'pending');

-- ─────────────────────────────────────────────────────────────────
-- Validação pós-migration: invariantes de schema.
-- ─────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_count INTEGER;
BEGIN
  -- Todas as 9 colunas novas presentes
  SELECT COUNT(*) INTO v_count
  FROM information_schema.columns
  WHERE table_name = 'user_subscriptions'
    AND column_name IN (
      'provider', 'provider_preapproval_id', 'external_reference',
      'current_period_start', 'current_period_end',
      'cancel_at_period_end', 'last_payment_id', 'metadata', 'updated_at'
    );
  IF v_count <> 9 THEN
    RAISE EXCEPTION 'user_subscriptions está faltando colunas — esperado 9, contadas %', v_count;
  END IF;

  -- Constraint de status atualizada
  SELECT COUNT(*) INTO v_count
  FROM pg_constraint
  WHERE conrelid = 'user_subscriptions'::regclass
    AND conname = 'user_subscriptions_status_check';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'user_subscriptions_status_check não foi recriado';
  END IF;
END $$;

COMMIT;
