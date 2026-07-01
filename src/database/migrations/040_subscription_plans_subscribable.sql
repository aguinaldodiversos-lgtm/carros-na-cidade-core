-- 040_subscription_plans_subscribable.sql
--
-- Elegibilidade DATA-DRIVEN ao checkout de assinatura. Substitui a whitelist
-- fixa (cnpj-store-start/cnpj-store-pro hardcoded no código) por uma coluna
-- explícita `subscribable`. Um plano só é oferecido/aceito no fluxo de
-- assinatura recorrente quando `subscribable = true` AND `is_active = true`.
--
-- Default = false (opt-in explícito): plano novo NÃO vira assinável sem o admin
-- marcar. Backfill liga apenas os dois planos assináveis de hoje.
--
-- Idempotência: ADD COLUMN IF NOT EXISTS + UPDATE guardado por subscribable=false.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'subscription_plans'
  ) THEN
    RAISE EXCEPTION 'subscription_plans não existe — rode migrations anteriores antes de 040';
  END IF;
END $$;

ALTER TABLE subscription_plans
  ADD COLUMN IF NOT EXISTS subscribable BOOLEAN NOT NULL DEFAULT false;

-- Backfill: só os assináveis atuais viram true (idempotente).
UPDATE subscription_plans
SET subscribable = true, updated_at = NOW()
WHERE id IN ('cnpj-store-start', 'cnpj-store-pro')
  AND subscribable = false;

-- Validação pós-migration: coluna presente.
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM information_schema.columns
  WHERE table_name = 'subscription_plans' AND column_name = 'subscribable';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'subscription_plans.subscribable ausente após 040';
  END IF;
END $$;

COMMIT;
