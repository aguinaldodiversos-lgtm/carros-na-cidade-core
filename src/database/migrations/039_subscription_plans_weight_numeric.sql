-- 039_subscription_plans_weight_numeric.sql
--
-- Peso decimal para planos: `subscription_plans.weight` deixa de ser INTEGER e
-- passa a NUMERIC(4,2), permitindo encaixar um plano ENTRE dois pesos
-- existentes (ex.: 3.5 entre Pro=3 e boost=4) SEM alterar nenhum outro peso.
--
-- A partir desta migration, o ranking passa a usar `weight` (data-driven) como
-- a camada comercial (ver ads-ranking.sql.js). Os valores atuais são
-- PRESERVADOS exatamente: 1→1.00, 2→2.00, 3→3.00, 4→4.00 — NUMERIC(4,2) não
-- arredonda inteiros. NUMERIC(4,2) cobre 0.01..99.99 com 2 casas (3.50, 3.75).
--
-- Idempotência: a conversão só roda se a coluna ainda for de tipo inteiro. Se
-- já for numeric/decimal (re-run), é no-op.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'subscription_plans'
  ) THEN
    RAISE EXCEPTION 'subscription_plans não existe — rode migrations anteriores antes de 039';
  END IF;

  -- Só converte se ainda for inteiro (idempotente).
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subscription_plans'
      AND column_name = 'weight'
      AND data_type IN ('integer', 'smallint', 'bigint')
  ) THEN
    ALTER TABLE subscription_plans
      ALTER COLUMN weight TYPE NUMERIC(4,2) USING weight::numeric(4,2);
  END IF;
END $$;

-- Mantém NOT NULL + default seguro (piso 1, nunca 0 — o sistema assume piso 1).
ALTER TABLE subscription_plans ALTER COLUMN weight SET DEFAULT 1;
ALTER TABLE subscription_plans ALTER COLUMN weight SET NOT NULL;

-- Validação pós-migration: tipo numérico e valores preservados.
DO $$
DECLARE
  v_type TEXT;
  v_bad  INTEGER;
BEGIN
  SELECT data_type INTO v_type
  FROM information_schema.columns
  WHERE table_name = 'subscription_plans' AND column_name = 'weight';
  IF v_type <> 'numeric' THEN
    RAISE EXCEPTION 'weight deveria ser numeric após 039, é %', v_type;
  END IF;

  -- Nenhum peso pode ter virado NULL ou 0 na conversão.
  SELECT COUNT(*) INTO v_bad FROM subscription_plans WHERE weight IS NULL OR weight <= 0;
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'weight inválido (NULL/<=0) em % linha(s) após conversão', v_bad;
  END IF;
END $$;

COMMIT;
