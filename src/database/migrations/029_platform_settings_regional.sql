-- 029_platform_settings_regional.sql
--
-- Seed das configurações regionais complementares em platform_settings.
-- A chave `regional.radius_km` (valor 80) já existe desde migration 027.
--
-- Novas chaves:
--   regional.faixa_2_km          — Limite superior da Faixa 2 (cinza claro, padrão 30 km)
--   regional.faixa_3_km          — Limite superior da Faixa 3 (cinza, padrão 60 km)
--   regional.dias_inatividade_ancora — Dias sem anúncio ativo antes de desativar âncora (padrão 90)
--   regional.min_anuncios_ancora  — Mínimo de anúncios ativos para ser âncora (padrão 1)
--
-- ON CONFLICT DO NOTHING: idempotente — re-executar não sobrescreve customizações.
-- Editar via admin em /admin/regional-settings (painel já existe).

INSERT INTO platform_settings (key, value, description) VALUES
  (
    'regional.faixa_2_km',
    '30',
    'Limite superior da Faixa 2 em km (exibe selo cinza claro "A X km"). Range válido: 10..radius_km.'
  ),
  (
    'regional.faixa_3_km',
    '60',
    'Limite superior da Faixa 3 em km (exibe selo cinza). Faixa 4 = acima disso até radius_km. Range válido: faixa_2_km..radius_km.'
  ),
  (
    'regional.dias_inatividade_ancora',
    '90',
    'Dias corridos sem anúncio ativo aprovado antes de o job diário remover o status de âncora da cidade.'
  ),
  (
    'regional.min_anuncios_ancora',
    '1',
    'Quantidade mínima de anúncios ativos aprovados para uma cidade se tornar âncora automaticamente.'
  )
ON CONFLICT (key) DO NOTHING;
