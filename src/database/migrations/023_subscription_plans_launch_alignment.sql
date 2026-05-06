-- 023_subscription_plans_launch_alignment.sql
--
-- Fase 2A do alinhamento de planos comerciais (docs/runbooks/
-- plans-launch-alignment.md).
--
-- Atualiza preços, limites de anúncios, benefícios JSON e is_active
-- dos planos seedados na migration 020 para refletir a oferta oficial
-- de lançamento. NÃO adiciona colunas novas (max_photos, weight,
-- video_360_enabled, monthly_highlight_credits ficam para Fase 2B,
-- quando schema dedicado for desenhado).
--
-- Oferta oficial básica desta fase:
--   cpf-free-essential       — R$ 0,    3 ads,  ativo (sem mudança)
--   cpf-premium-highlight    — descontinuado, is_active=false
--   cnpj-free-store          — R$ 0,    10 ads (era 20)
--   cnpj-store-start         — R$ 79,90/mês (era R$ 299,90), 20 ads (era 80)
--   cnpj-store-pro           — R$ 149,90/mês (era R$ 599,90), 1000 ads trava (era 200)
--   cnpj-evento-premium      — produto desligado, is_active=false
--
-- Garantias:
--
--   1. **Idempotente**: pode rodar 2+ vezes sem efeito colateral. Cada
--      UPDATE traz no WHERE o estado-alvo, então a segunda execução
--      simplesmente retorna 0 linhas afetadas.
--   2. **Não-destrutivo**: zero DELETE. Linhas continuam vivas para
--      preservar FKs em `user_subscriptions.plan_id` e `payments.plan_id`.
--      Assinaturas existentes em planos descontinuados (`cpf-premium-
--      highlight`, `cnpj-evento-premium`) seguem válidas até `expires_at`.
--   3. **Preserva subscriptions/cobranças existentes**: nenhum UPDATE em
--      user_subscriptions ou payments aqui. Quem já paga R$ 299,90 segue
--      pagando até o ciclo atual vencer; renovação automática usa preço
--      novo já vindo do banco.
--   4. **Atualiza `updated_at`** explicitamente em cada UPDATE.
--   5. **Sem mudança de schema**: nenhum ALTER TABLE aqui. Migration
--      pura de dados — segura para rollback simples (UPDATE inverso
--      documentado em docs/runbooks/plans-launch-alignment.md §Rollback).

BEGIN;

-- ─────────────────────────────────────────────────────────────────
-- Defesa: a migration assume schema de 020. Se subscription_plans
-- não existir, abortar com erro claro em vez de criar silenciosamente.
-- ─────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'subscription_plans'
  ) THEN
    RAISE EXCEPTION 'subscription_plans não existe — rode migrations anteriores antes de 023';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────
-- 1. cnpj-free-store: ad_limit 20 → 10
-- ─────────────────────────────────────────────────────────────────
UPDATE subscription_plans
SET
  ad_limit = 10,
  benefits = '["Ate 10 anuncios ativos","Ate 8 fotos por anuncio","Perfil de loja ativo","Sem comissao nas vendas"]'::jsonb,
  updated_at = NOW()
WHERE id = 'cnpj-free-store'
  AND (ad_limit <> 10 OR benefits <> '["Ate 10 anuncios ativos","Ate 8 fotos por anuncio","Perfil de loja ativo","Sem comissao nas vendas"]'::jsonb);

-- ─────────────────────────────────────────────────────────────────
-- 2. cnpj-store-start: R$ 299,90 → R$ 79,90; ad_limit 80 → 20
-- ─────────────────────────────────────────────────────────────────
UPDATE subscription_plans
SET
  price = 79.90,
  ad_limit = 20,
  description = 'Plano de entrada para escalar anuncios da loja com destaque opcional.',
  benefits = '["Ate 20 anuncios ativos","Ate 12 fotos por anuncio","1 destaque mensal incluido","Perfil de loja personalizado"]'::jsonb,
  updated_at = NOW()
WHERE id = 'cnpj-store-start'
  AND (price <> 79.90 OR ad_limit <> 20 OR benefits <> '["Ate 20 anuncios ativos","Ate 12 fotos por anuncio","1 destaque mensal incluido","Perfil de loja personalizado"]'::jsonb);

-- ─────────────────────────────────────────────────────────────────
-- 3. cnpj-store-pro: R$ 599,90 → R$ 149,90; ad_limit 200 → 1000 (trava técnica)
-- ─────────────────────────────────────────────────────────────────
UPDATE subscription_plans
SET
  price = 149.90,
  ad_limit = 1000,
  description = 'Anuncios sem limite pratico, destaques mensais inclusos e video 360.',
  benefits = '["Anuncios ilimitados (trava tecnica configuravel pelo admin)","Ate 15 fotos por anuncio","3 destaques mensais inclusos","Video 360 habilitado","Dashboard de performance por cidade"]'::jsonb,
  updated_at = NOW()
WHERE id = 'cnpj-store-pro'
  AND (price <> 149.90 OR ad_limit <> 1000 OR benefits <> '["Anuncios ilimitados (trava tecnica configuravel pelo admin)","Ate 15 fotos por anuncio","3 destaques mensais inclusos","Video 360 habilitado","Dashboard de performance por cidade"]'::jsonb);

-- ─────────────────────────────────────────────────────────────────
-- 4. cpf-premium-highlight: descontinuar (is_active=false)
--    Substituído pelo boost avulso "Destaque 7 dias" (R$ 39,90,
--    BOOST_OPTIONS no backend), válido para CPF e CNPJ.
-- ─────────────────────────────────────────────────────────────────
UPDATE subscription_plans
SET
  is_active = false,
  updated_at = NOW()
WHERE id = 'cpf-premium-highlight'
  AND is_active = true;

-- ─────────────────────────────────────────────────────────────────
-- 5. cnpj-evento-premium: descontinuar publicamente (is_active=false)
--    Produto Evento já era filtrado pelo backend via
--    EVENTS_PUBLIC_ENABLED + isEventPlanId(); is_active=false adiciona
--    defesa em profundidade (mesmo se a flag for ligada por engano).
-- ─────────────────────────────────────────────────────────────────
UPDATE subscription_plans
SET
  is_active = false,
  updated_at = NOW()
WHERE id = 'cnpj-evento-premium'
  AND is_active = true;

-- ─────────────────────────────────────────────────────────────────
-- Validação final: invariantes pós-migration. Se algo escapou, FALHA.
-- ─────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  -- cnpj-free-store: ad_limit 10
  SELECT COUNT(*) INTO v_count FROM subscription_plans
  WHERE id = 'cnpj-free-store' AND ad_limit = 10 AND is_active = true;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'cnpj-free-store fora do esperado (esperado 1 linha ad_limit=10 is_active=true)';
  END IF;

  -- cnpj-store-start: price 79.90, ad_limit 20
  SELECT COUNT(*) INTO v_count FROM subscription_plans
  WHERE id = 'cnpj-store-start' AND price = 79.90 AND ad_limit = 20 AND is_active = true;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'cnpj-store-start fora do esperado (esperado price=79.90 ad_limit=20)';
  END IF;

  -- cnpj-store-pro: price 149.90, ad_limit 1000
  SELECT COUNT(*) INTO v_count FROM subscription_plans
  WHERE id = 'cnpj-store-pro' AND price = 149.90 AND ad_limit = 1000 AND is_active = true;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'cnpj-store-pro fora do esperado (esperado price=149.90 ad_limit=1000)';
  END IF;

  -- cpf-premium-highlight: is_active=false
  SELECT COUNT(*) INTO v_count FROM subscription_plans
  WHERE id = 'cpf-premium-highlight' AND is_active = false;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'cpf-premium-highlight deveria estar is_active=false';
  END IF;

  -- cnpj-evento-premium: is_active=false
  SELECT COUNT(*) INTO v_count FROM subscription_plans
  WHERE id = 'cnpj-evento-premium' AND is_active = false;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'cnpj-evento-premium deveria estar is_active=false';
  END IF;
END $$;

COMMIT;
