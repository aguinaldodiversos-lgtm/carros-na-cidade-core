-- 038_user_subscriptions_admin_grant.sql
--
-- Concessão MANUAL de plano pelo admin (cortesia / teste grátis / brinde /
-- negociação) por tempo determinado, SEM pagamento Mercado Pago.
--
-- Decisão de modelagem (auditoria 2026-06-25): NÃO criar tabela paralela.
-- `user_subscriptions` já carrega o ciclo de vida da assinatura (status,
-- expires_at, metadata) e a 020/024 já têm tudo que o fluxo pago usa. Esta
-- migration apenas ADICIONA colunas de PROVENIÊNCIA e CONCESSÃO para
-- diferenciar "plano pago (Mercado Pago)" de "plano concedido (admin)".
--
-- A fonte de verdade do plano efetivo continua sendo `users.plan_id` (lida
-- por account.service.resolveCurrentPlan). O serviço de concessão seta
-- `users.plan_id` ao conceder e reverte ao expirar/revogar — espelhando o
-- que o webhook do Mercado Pago já faz para o fluxo pago.
--
-- Idempotência:
--   - ALTER TABLE ADD COLUMN IF NOT EXISTS x6 (todas nullable, sem rewrite).
--   - CHECK de `source` recriado de forma defensiva (drop-if-exists + add).
--   - Índice parcial CREATE INDEX IF NOT EXISTS.
--
-- Garantias:
--   - Sem DROP/DELETE de coluna ou linha.
--   - Rows pré-existentes (assinaturas pagas/legadas) ficam com source=NULL,
--     o que o CHECK permite e o serviço interpreta como "Pago/legado".

BEGIN;

-- Defesa: tabela precisa existir (criada em 020).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'user_subscriptions'
  ) THEN
    RAISE EXCEPTION 'user_subscriptions não existe — rode migrations anteriores antes de 038';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────
-- 1. Colunas de proveniência / concessão (idempotente)
-- ─────────────────────────────────────────────────────────────────
--
-- source:
--   Proveniência da assinatura. NULL = legado/pago (rows criadas pelo
--   webhook antes desta migration). 'mercado_pago' = fluxo pago.
--   'admin_grant' = concessão manual do admin (esta fase).
--
-- granted_by_admin_id:
--   users.id do admin que concedeu (auditoria de quem deu).
--
-- grant_reason_type:
--   Motivo categorizado (trial, courtesy, gift, retention, correction,
--   negotiation, other) — espelha o dropdown do modal.
--
-- grant_reason_note:
--   Observação obrigatória em texto livre explicando a concessão.
--
-- starts_at:
--   Início explícito da concessão (NOW() ao conceder). Distinto de
--   current_period_start, que o fluxo pago não preenche.
--
-- cancelled_at:
--   Momento em que a concessão foi revogada/substituída pelo admin.

ALTER TABLE user_subscriptions
  ADD COLUMN IF NOT EXISTS source TEXT,
  ADD COLUMN IF NOT EXISTS granted_by_admin_id TEXT,
  ADD COLUMN IF NOT EXISTS grant_reason_type TEXT,
  ADD COLUMN IF NOT EXISTS grant_reason_note TEXT,
  ADD COLUMN IF NOT EXISTS starts_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

-- ─────────────────────────────────────────────────────────────────
-- 2. CHECK defensivo de `source`. NULL permitido (rows legadas/pagas).
-- ─────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'user_subscriptions'::regclass
      AND conname = 'user_subscriptions_source_check'
  ) THEN
    ALTER TABLE user_subscriptions DROP CONSTRAINT user_subscriptions_source_check;
  END IF;
END $$;

ALTER TABLE user_subscriptions
  ADD CONSTRAINT user_subscriptions_source_check
  CHECK (
    source IS NULL OR source IN (
      'free',
      'mercado_pago',
      'admin_grant',
      'trial',
      'courtesy',
      'manual'
    )
  );

-- ─────────────────────────────────────────────────────────────────
-- 3. Índice parcial: sweep de expiração + leitura do grant ativo do user.
-- ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS user_subscriptions_admin_grant_idx
  ON user_subscriptions (user_id, status)
  WHERE source = 'admin_grant';

-- ─────────────────────────────────────────────────────────────────
-- 4. Validação pós-migration
-- ─────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM information_schema.columns
  WHERE table_name = 'user_subscriptions'
    AND column_name IN (
      'source', 'granted_by_admin_id', 'grant_reason_type',
      'grant_reason_note', 'starts_at', 'cancelled_at'
    );
  IF v_count <> 6 THEN
    RAISE EXCEPTION 'user_subscriptions faltando colunas de grant — esperado 6, contadas %', v_count;
  END IF;
END $$;

COMMIT;
