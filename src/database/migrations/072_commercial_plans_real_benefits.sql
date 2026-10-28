-- Alinha o texto comercial e capacidades realmente entregues.
-- Não modifica preços, planos ativos, pesos, assinaturas ou anúncios publicados.
BEGIN;

UPDATE subscription_plans
SET max_photos = 8,
    is_featured_enabled = FALSE,
    benefits = '["Até 3 anúncios ativos","Até 8 fotos por anúncio","Contato direto com o anunciante","Sem comissão"]'::jsonb,
    updated_at = NOW()
WHERE id = 'cpf-free-essential';

UPDATE subscription_plans
SET description = 'Comece a anunciar sem custos e alcance compradores da sua região.',
    max_photos = 8,
    benefits = '["Até 10 anúncios ativos","Até 8 fotos por anúncio","Presença nas listagens locais e regionais","Perfil básico da loja"]'::jsonb,
    updated_at = NOW()
WHERE id = 'cnpj-free-store';

UPDATE subscription_plans
SET description = 'Mais presença para a sua loja e novas oportunidades de negócio.',
    max_photos = 12,
    monthly_highlight_credits = 0,
    video_360_enabled = FALSE,
    benefits = '["Até 20 anúncios ativos","Até 12 fotos por anúncio","Prioridade nas listagens (peso 2)","Perfil de loja personalizado","Veículos para avaliação"]'::jsonb,
    updated_at = NOW()
WHERE id = 'cnpj-store-start';

UPDATE subscription_plans
SET description = 'Mais visibilidade, mais fotos e acesso a oportunidades para sua loja.',
    max_photos = 15,
    monthly_highlight_credits = 0,
    video_360_enabled = FALSE,
    benefits = '["Anúncios ilimitados (trava operacional)","Até 15 fotos por anúncio","Maior prioridade nas listagens (peso 3)","Perfil de loja personalizado","Compradores procurando","Veículos para avaliação"]'::jsonb,
    updated_at = NOW()
WHERE id = 'cnpj-store-pro';

COMMIT;
