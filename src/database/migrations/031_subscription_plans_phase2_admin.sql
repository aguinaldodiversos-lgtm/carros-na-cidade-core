-- =============================================================================
-- 031 — subscription_plans Fase 2B + seed de commercial.* em platform_settings
-- =============================================================================
-- Background:
--   A migration 023 explicitamente prometeu Fase 2B: "max_photos, weight,
--   video_360_enabled, monthly_highlight_credits ficam para Fase 2B, quando
--   schema dedicado for desenhado". A Fase 2 do painel admin precisa que
--   esses campos sejam editáveis pelo admin SEM SQL manual — portanto, eles
--   precisam estar no banco.
--
--   Adiciona também sort_order e public_visible para suportar a UI de
--   administração de planos (ordem manual de exibição + separação entre
--   "ativo" e "exposto no checkout/site").
--
--   Backfill respeita os números canônicos de DEFAULT_PLANS em
--   src/modules/account/account.service.js (já consumidos pela UI hoje
--   via fallback). NÃO altera preço/ad_limit/priority_level (vide 023).
--
-- Idempotência:
--   - ALTER TABLE ADD COLUMN IF NOT EXISTS x6
--   - Backfill com WHERE coluna == default-na-criação (re-roda = no-op)
--   - Seed em platform_settings com ON CONFLICT (key) DO NOTHING
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────
-- 1. Defesa: subscription_plans precisa existir (criada em 020).
-- ─────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'subscription_plans'
  ) THEN
    RAISE EXCEPTION 'subscription_plans não existe — rode migrations anteriores antes de 031';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────
-- 2. ADD COLUMNS (idempotente, todas com default seguro)
-- ─────────────────────────────────────────────────────────────────
--
-- max_photos:
--   Limite de fotos por anúncio. 0 = sem limite explícito (default safe).
--   DEFAULT_PLANS hoje carrega 8, 12, 15 conforme plano.
--
-- weight:
--   Peso de produto exibido na UI (1=grátis, 2=Start, 3=Pro, 4=Destaque).
--   NÃO é o que o ranking SQL lê — o ranking continua usando priority_level
--   (commercialLayerExpr em ads-ranking.sql.js com thresholds 50/80).
--   Manter as duas colunas é intencional: `priority_level` é a hierarquia
--   numérica que move plano entre camadas comerciais; `weight` é o número
--   de produto que a UI mostra ao admin/comprador.
--
-- video_360_enabled:
--   Plano permite anúncio com vídeo 360 (Pro=true).
--
-- monthly_highlight_credits:
--   Créditos de destaque mensais incluídos no plano (Start=1, Pro=3).
--
-- sort_order:
--   Ordenação manual no painel admin. Menor primeiro. Default 0.
--
-- public_visible:
--   Separa "ativo" (is_active) de "exposto publicamente". Plano pode estar
--   ativo (preserva subscriptions existentes) mas oculto do checkout/site.
--   Default true para não esconder planos pré-existentes.

ALTER TABLE subscription_plans
  ADD COLUMN IF NOT EXISTS max_photos INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS weight INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS video_360_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS monthly_highlight_credits INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS public_visible BOOLEAN NOT NULL DEFAULT true;

-- ─────────────────────────────────────────────────────────────────
-- 3. Backfill: alinha rows existentes ao DEFAULT_PLANS canônico.
--    WHERE coluna == default-na-criação garante que admin que já
--    customizou esses campos NÃO seja sobrescrito.
-- ─────────────────────────────────────────────────────────────────

-- cpf-free-essential
UPDATE subscription_plans
SET max_photos = 8,
    weight = 1,
    video_360_enabled = false,
    monthly_highlight_credits = 0,
    sort_order = 10,
    updated_at = NOW()
WHERE id = 'cpf-free-essential'
  AND max_photos = 0 AND weight = 1 AND video_360_enabled = false
  AND monthly_highlight_credits = 0 AND sort_order = 0;

-- cnpj-free-store
UPDATE subscription_plans
SET max_photos = 8,
    weight = 1,
    video_360_enabled = false,
    monthly_highlight_credits = 0,
    sort_order = 20,
    updated_at = NOW()
WHERE id = 'cnpj-free-store'
  AND max_photos = 0 AND weight = 1 AND video_360_enabled = false
  AND monthly_highlight_credits = 0 AND sort_order = 0;

-- cnpj-store-start
UPDATE subscription_plans
SET max_photos = 12,
    weight = 2,
    video_360_enabled = false,
    monthly_highlight_credits = 1,
    sort_order = 30,
    updated_at = NOW()
WHERE id = 'cnpj-store-start'
  AND max_photos = 0 AND weight = 1 AND video_360_enabled = false
  AND monthly_highlight_credits = 0 AND sort_order = 0;

-- cnpj-store-pro
UPDATE subscription_plans
SET max_photos = 15,
    weight = 3,
    video_360_enabled = true,
    monthly_highlight_credits = 3,
    sort_order = 40,
    updated_at = NOW()
WHERE id = 'cnpj-store-pro'
  AND max_photos = 0 AND weight = 1 AND video_360_enabled = false
  AND monthly_highlight_credits = 0 AND sort_order = 0;

-- cpf-premium-highlight (descontinuado — mantém defaults seguros)
UPDATE subscription_plans
SET sort_order = 90,
    public_visible = false,
    updated_at = NOW()
WHERE id = 'cpf-premium-highlight'
  AND sort_order = 0 AND public_visible = true;

-- cnpj-evento-premium (desligado — mantém defaults seguros)
UPDATE subscription_plans
SET sort_order = 100,
    public_visible = false,
    updated_at = NOW()
WHERE id = 'cnpj-evento-premium'
  AND sort_order = 0 AND public_visible = true;

-- ─────────────────────────────────────────────────────────────────
-- 4. Seed de chaves commercial.* em platform_settings (idempotente).
--    A camada de serviço (admin-commercial-settings.service.js)
--    valida shape/range antes de gravar.
-- ─────────────────────────────────────────────────────────────────

INSERT INTO platform_settings (key, value, description) VALUES
  (
    'commercial.boost_default_price_cents',
    '3990',
    'Preço padrão do destaque avulso (boost-7d) em centavos. Editável pelo admin via /admin/comercial. Range válido: 100..1000000.'
  ),
  (
    'commercial.boost_default_days',
    '7',
    'Duração padrão do destaque avulso em dias. Range válido: 1..365.'
  ),
  (
    'commercial.boost_duplicate_behavior',
    '"extend_duration"',
    'Comportamento de compra duplicada de destaque. Valores aceitos: "extend_duration" (default — soma os dias), "replace" (substitui o período), "block_duplicate" (rejeita).'
  ),
  (
    'commercial.boost_max_extension_days',
    '90',
    'Limite máximo cumulativo de extensão de destaque em dias quando duplicate_behavior=extend_duration. Range válido: 7..365.'
  ),
  (
    'commercial.allow_boost_cpf',
    'true',
    'Permite que usuários CPF comprem destaque avulso. true|false.'
  ),
  (
    'commercial.allow_boost_cnpj',
    'true',
    'Permite que usuários CNPJ comprem destaque avulso. true|false.'
  ),
  (
    'commercial.pro_ad_limit_guard',
    '1000',
    'Trava técnica do plano Pro (anúncios ilimitados na oferta). O service back enforça este valor como teto. Range válido: 100..100000.'
  )
ON CONFLICT (key) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────
-- 5. Validação final
-- ─────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  -- 6 colunas novas presentes
  SELECT COUNT(*) INTO v_count
  FROM information_schema.columns
  WHERE table_name = 'subscription_plans'
    AND column_name IN (
      'max_photos','weight','video_360_enabled',
      'monthly_highlight_credits','sort_order','public_visible'
    );
  IF v_count <> 6 THEN
    RAISE EXCEPTION 'subscription_plans está faltando colunas — esperado 6, contadas %', v_count;
  END IF;

  -- 7 chaves commercial.* seedadas (somando às pré-existentes)
  SELECT COUNT(*) INTO v_count
  FROM platform_settings
  WHERE key LIKE 'commercial.%';
  IF v_count < 7 THEN
    RAISE EXCEPTION 'platform_settings commercial.* incompleto — esperado >=7, contadas %', v_count;
  END IF;
END $$;

COMMIT;
