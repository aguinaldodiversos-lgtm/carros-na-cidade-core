-- 041_subscription_activation.sql
--
-- Fase 2 — ativação da assinatura recorrente.
--
--   1. user_subscriptions: preço CONTRATADO por assinatura + vigência do preço.
--      Gravados na 1ª ativação e PRESERVADOS na renovação. Base para o futuro
--      motor de reajuste ("assinantes do plano X com contracted_amount < Y e
--      contracted_price_since há > 12 meses") — sem retrabalho depois.
--
--   2. subscription_reconciliation: registra authorized_payment APPROVED que
--      não pôde ser resolvido (intent inexistente / valor ausente). É dinheiro
--      confirmado sem benefício entregue — NÃO pode virar só log. Reconciliação
--      posterior (job/admin) processa status 'unresolved'.
--
-- Idempotência: ADD COLUMN IF NOT EXISTS + CREATE TABLE/INDEX IF NOT EXISTS.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'user_subscriptions'
  ) THEN
    RAISE EXCEPTION 'user_subscriptions não existe — rode migrations anteriores antes de 041';
  END IF;
END $$;

-- 1. Preço contratado + vigência (ambos nullable; sem rewrite).
ALTER TABLE user_subscriptions
  ADD COLUMN IF NOT EXISTS contracted_amount NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS contracted_price_since TIMESTAMPTZ;

-- 2. Ledger de reconciliação de pagamentos aprovados não-resolvidos.
CREATE TABLE IF NOT EXISTS subscription_reconciliation (
  id BIGSERIAL PRIMARY KEY,
  authorized_payment_id TEXT NOT NULL UNIQUE,      -- idempotência: reenvio do MP não duplica
  provider_preapproval_id TEXT,
  amount NUMERIC(12,2),
  status TEXT NOT NULL DEFAULT 'unresolved'
    CHECK (status IN ('unresolved', 'resolved', 'ignored')),
  reason TEXT,                                      -- ex.: 'intent_not_found' | 'amount_missing'
  payload JSONB,                                    -- snapshot do evento para investigação
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS subscription_reconciliation_unresolved_idx
  ON subscription_reconciliation (status)
  WHERE status = 'unresolved';

-- Validação pós-migration.
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM information_schema.columns
  WHERE table_name = 'user_subscriptions'
    AND column_name IN ('contracted_amount', 'contracted_price_since');
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'user_subscriptions faltando colunas de preço contratado — esperado 2, contadas %', v_count;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'subscription_reconciliation'
  ) THEN
    RAISE EXCEPTION 'subscription_reconciliation não foi criada';
  END IF;
END $$;

COMMIT;
