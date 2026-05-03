-- =============================================================================
-- 022 — seo_publications.is_indexable (column add, schema-only)
-- =============================================================================
--
-- POR QUE
-- O endpoint público `/api/public/seo/sitemap.json`
-- (src/modules/public/public-seo.service.js#listEntries) referencia
-- `sp.is_indexable` num LEFT JOIN com `seo_publications`. Em produção a
-- tabela existe (foi criada out-of-band, sem migration oficial — `grep -l
-- seo_publications src/database/migrations/*.sql` retorna 0 antes desta),
-- mas a coluna `is_indexable` nunca chegou a ser criada. Resultado em prod
-- (capturado 2026-05-03 via curl): HTTP 500 com mensagem PostgreSQL 42703
-- "column sp.is_indexable does not exist". Esta migration adiciona a coluna
-- ausente — schema-only, sem mexer em dados ou status.
--
-- DEFAULT TRUE — alinhado a TODOS os call sites do código:
--   * src/modules/seo/publishing/content-publisher.repository.js#upsertSeoPublication
--     parâmetro padrão da função: `isIndexable = true`
--   * src/modules/seo/publishing/publication-validator.service.js
--     grava `is_indexable: issues.length === 0` — TRUE quando não há issues
--   * src/modules/public/public-seo.service.js
--     filtro do sitemap: `(sp.id IS NULL OR sp.is_indexable = TRUE)`
--     (TRUE = inclui no sitemap)
--   * src/brain/metrics/city-performance.repository.js
--     `COUNT(*) FILTER (WHERE sp.is_indexable = true)`
--
-- DEFAULT FALSE seria perigoso: linhas pré-existentes em prod ficariam
-- todas excluídas do sitemap até cada uma ser republicada — regressão
-- silenciosa exatamente do problema que esta migration deveria resolver.
--
-- NOT NULL: os filtros usam `= TRUE`. Em SQL de 3 valores, `NULL = TRUE`
-- avalia para UNKNOWN, que é tratado como FALSE em WHERE — NULL excluiria
-- a linha do sitemap silenciosamente. NOT NULL + DEFAULT TRUE elimina esse
-- caminho. O código JS sempre passa `Boolean()`, então NOT NULL não causa
-- regressão nas escritas existentes.
--
-- IDEMPOTÊNCIA: `ADD COLUMN IF NOT EXISTS` torna a migration safe pra
-- re-execução. O bloco DO + IF EXISTS sobre `seo_publications` cobre o
-- segundo caso: bancos onde a tabela ainda não existe (ex.: ambientes de
-- teste/CI que rodam só migrations oficiais). Lá, a migration é no-op
-- silencioso — quando alguém um dia criar `seo_publications` via migration
-- futura, ela já deve nascer com `is_indexable BOOLEAN NOT NULL DEFAULT TRUE`
-- na própria DDL e esta migration permanece no-op.
--
-- ESCOPO: estritamente schema. NÃO toca dados, NÃO mexe em status, NÃO
-- popula `seo_cluster_plans`, NÃO altera worker/planner. Reparar o
-- pipeline de dados (planner não rodando, status drift, sitemap frontend
-- desatualizado vs Fase 1 dos canonicals) fica para prompts subsequentes
-- conforme o plano em docs/runbooks/sitemap-empty-investigation.md §10.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = current_schema()
      AND table_name = 'seo_publications'
  ) THEN
    ALTER TABLE seo_publications
      ADD COLUMN IF NOT EXISTS is_indexable BOOLEAN NOT NULL DEFAULT TRUE;
  END IF;
END $$;
