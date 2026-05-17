-- 028_cities_ancora_columns.sql
--
-- Colunas de âncora regional em `cities`.
--
-- Conceito:
--   Uma cidade-âncora é qualquer cidade com pelo menos 1 anúncio ativo aprovado.
--   Quando o primeiro anúncio de uma cidade é aprovado → is_ancora = true.
--   Quando uma cidade fica mais de `regional.dias_inatividade_ancora` dias sem
--   anúncio ativo → is_ancora = false (job diário, cities.anchor.worker.js).
--
-- Colunas:
--   is_ancora           — city é âncora ativa no momento
--   ancora_ativada_em   — timestamp da última ativação como âncora
--   ancora_desativada_em — timestamp da última desativação
--
-- Índices:
--   idx_cities_latitude        — bounding box do Haversine SQL (substitute
--                                ao GIST/PostGIS; compat. com findMembersFromHaversine)
--   idx_cities_ancora_active   — lookup rápido de âncoras por UF (listagem
--                                regional, sitemap, getCidadeAncoraProxima)
--
-- Idempotente: ADD COLUMN IF NOT EXISTS + CREATE INDEX IF NOT EXISTS.

ALTER TABLE cities
  ADD COLUMN IF NOT EXISTS is_ancora BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ancora_ativada_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ancora_desativada_em TIMESTAMPTZ;

-- B-tree em latitude para o bounding box do Haversine em regions.service.js.
-- Comentário original em findMembersFromHaversine:
--   "Bounding box em latitude antes do acos para usar índice futuro em
--    latitude (B-tree). Sem índice GIST/PostGIS — não dependemos de extensão extra."
CREATE INDEX IF NOT EXISTS idx_cities_latitude
  ON cities (latitude);

-- Índice parcial: só cidades âncora ativas, por UF + slug.
-- Usado em getCidadeAncoraProxima, listagem regional e geração de sitemap.
CREATE INDEX IF NOT EXISTS idx_cities_ancora_active
  ON cities (state, slug)
  WHERE is_ancora = true;

COMMENT ON COLUMN cities.is_ancora IS
  'true quando a cidade tem pelo menos 1 anúncio ativo aprovado → qualifica para Página Regional.';
COMMENT ON COLUMN cities.ancora_ativada_em IS
  'Timestamp da última ativação como âncora (primeiro anúncio aprovado na cidade).';
COMMENT ON COLUMN cities.ancora_desativada_em IS
  'Timestamp da última desativação (cidade ficou sem anúncios ativos por DIAS_INATIVIDADE_ANCORA dias).';
