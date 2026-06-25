-- =============================================================================
-- 037 — ads: opcionais do veículo (vehicle_options JSONB)
-- =============================================================================
--
-- Por quê
-- -------
-- O anunciante passa a selecionar os opcionais do veículo (Conforto,
-- Dirigibilidade, Segurança) no cadastro e na edição. Antes a seleção do
-- wizard era descartada (não havia coluna nem schema). A página pública
-- exibe os opcionais selecionados agrupados por categoria.
--
-- Formato armazenado (agrupado, categorias vazias omitidas):
--   {
--     "comfort":      ["ar_condicionado", "central_multimidia"],
--     "drivability":  ["cambio_automatico", "rodas_liga_leve"],
--     "safety":       ["airbag_duplo", "freios_abs"]
--   }
--
-- A fonte da verdade das keys/labels/categorias é
-- src/modules/ads/ad-options.catalog.js. O backend ignora keys fora do
-- catálogo na normalização (não persiste lixo).
--
-- Índice GIN: prepara filtros futuros por opcional (ex.: câmbio automático,
-- ABS, ar-condicionado, abaixo da FIPE) sem alterar a leitura agora.
--
-- Idempotência
-- ------------
-- IF NOT EXISTS na coluna e no índice. Default '{}'::jsonb garante leitura
-- segura em anúncios antigos (nenhum opcional selecionado). Re-execução segura.

ALTER TABLE ads
  ADD COLUMN IF NOT EXISTS vehicle_options JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN ads.vehicle_options IS
  'Opcionais selecionados pelo anunciante, agrupados por categoria (comfort/drivability/safety). Keys validadas contra src/modules/ads/ad-options.catalog.js. Default {} = nenhum opcional. Migration 037.';

CREATE INDEX IF NOT EXISTS ads_vehicle_options_gin
  ON ads USING gin (vehicle_options);
