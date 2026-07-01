-- 042_payments_schema_reconcile.sql
--
-- Correção de SCHEMA DRIFT (Opção 2 — renomear + recriar canônica).
--
-- Em produção, `payments` foi criada pelo antigo `ensurePaymentsSchema()` em
-- runtime (schema pré-020: `mp_payment_id`, `mp_preference_id`, `currency`,
-- `user_id INTEGER`, SEM `plan_id`/`mercado_pago_id`/`payment_type`). A migration
-- 020 usa `CREATE TABLE IF NOT EXISTS payments`, então virou NO-OP e a tabela
-- canônica NUNCA foi criada. Resultado: todo o billing (upsertPlanPayment,
-- recordPaymentAndActivate) quebra com `column "plan_id"/"mercado_pago_id" ...
-- does not exist`.
--
-- A tabela legada está VAZIA (COUNT(*)=0, confirmado). Estratégia: renomear a
-- casca vazia para arquivo (`payments_legacy_pre020`) e criar a `payments`
-- CANÔNICA no schema EXATO da 020, que o código espera.
--
-- Idempotente: só renomeia se a `payments` atual ainda for a legada (sem coluna
-- `mercado_pago_id`) e o destino não existir. Em banco já correto (dev/fresh via
-- 020, ou re-execução), não faz nada.

BEGIN;

-- 1) Renomeia a legada (só quando aplicável). Preserva a casca para histórico.
DO $$
BEGIN
  IF EXISTS (
       SELECT 1 FROM information_schema.tables WHERE table_name = 'payments'
     )
     AND NOT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_name = 'payments' AND column_name = 'mercado_pago_id'
     )
     AND NOT EXISTS (
       SELECT 1 FROM information_schema.tables WHERE table_name = 'payments_legacy_pre020'
     )
  THEN
    ALTER TABLE payments RENAME TO payments_legacy_pre020;
  END IF;
END $$;

-- 2) Cria a canônica (schema da 020). IF NOT EXISTS: no-op onde já existe correta.
--    Colunas conferidas contra os INSERTs reais:
--      upsertPlanPayment / recordPaymentAndActivate →
--      (user_id, plan_id, mercado_pago_id, status, amount, payment_type)
--      + ON CONFLICT (mercado_pago_id) + DO UPDATE ... updated_at.
CREATE TABLE IF NOT EXISTS payments (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  plan_id TEXT NOT NULL REFERENCES subscription_plans(id),
  mercado_pago_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'canceled')),
  amount NUMERIC(12,2) NOT NULL,
  payment_type TEXT NOT NULL CHECK (payment_type IN ('one_time', 'recurring')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS payments_user_id_idx ON payments (user_id);

-- 3) Validação: canônica presente + UNIQUE de idempotência em mercado_pago_id.
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM information_schema.columns
  WHERE table_name = 'payments'
    AND column_name IN (
      'user_id', 'plan_id', 'mercado_pago_id', 'status', 'amount',
      'payment_type', 'created_at', 'updated_at'
    );
  IF v_count <> 8 THEN
    RAISE EXCEPTION 'payments canônica incompleta — esperado 8 colunas, contadas %', v_count;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'payments'
      AND indexdef ILIKE '%UNIQUE%'
      AND indexdef ILIKE '%mercado_pago_id%'
  ) THEN
    RAISE EXCEPTION 'payments sem UNIQUE em mercado_pago_id (necessária para ON CONFLICT)';
  END IF;
END $$;

COMMIT;
