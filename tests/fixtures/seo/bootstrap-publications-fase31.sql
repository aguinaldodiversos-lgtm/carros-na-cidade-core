-- =============================================================================
-- FIXTURE LOCAL/TEST ONLY — NEVER RUN IN PRODUCTION
-- =============================================================================
-- Caminho: tests/fixtures/seo/bootstrap-publications-fase31.sql
--
-- ESCOPO: estritamente reproduzir o cenário pré-Fase 3.1 em DB de teste
-- (Docker Postgres :5433 ou equivalente local). Aplicar em produção
-- DESTRUIRIA as tabelas reais (DROP CASCADE no início) — NÃO faça.
--
-- USO PERMITIDO:
--   - Operador rodando dry-run/apply de scripts/seo/bootstrap-publications.mjs
--     contra DB local de teste
--   - CI futuro que precise reproduzir schema reduzido de prod
--
-- USO PROIBIDO:
--   - Nenhum script npm chama isto
--   - Nenhum worker chama isto
--   - Nenhum endpoint de admin chama isto
--   - Nenhum caminho automático de produção depende disto
--
-- Como aplicar (manual, no DB de teste):
--   psql "$TEST_DATABASE_URL" -f tests/fixtures/seo/bootstrap-publications-fase31.sql
--
-- Objetivo: reproduzir
--   - seo_cluster_plans completo (matching cluster-plan.repository.js)
--   - seo_publications REDUZIDO (espelha o schema out-of-band de prod —
--     só as colunas que o admin hotfix Fase 3 tolera). Isso força o
--     INSERT defensivo a operar como se fosse prod.
--   - 2 cidades canônicas + 4 cluster_plans elegíveis (2 city_home +
--     2 city_below_fipe, ambos status='planned', sem publicação).
--
-- IDEMPOTENTE. Re-rodar limpa antes (DROP CASCADE) só nas 3 tabelas SEO.
-- =============================================================================

BEGIN;

-- 1. Limpa estado anterior (idempotência, escopo limitado a fase 3.1)
DROP TABLE IF EXISTS seo_publication_audits CASCADE;
DROP TABLE IF EXISTS seo_publications CASCADE;
DROP TABLE IF EXISTS seo_cluster_plans CASCADE;

-- 2. seo_cluster_plans — schema COMPLETO (igual cluster-plan.repository.js)
CREATE TABLE seo_cluster_plans (
  id                BIGSERIAL PRIMARY KEY,
  city_id           BIGINT REFERENCES cities(id) ON DELETE CASCADE,
  cluster_type      TEXT NOT NULL,
  path              TEXT NOT NULL UNIQUE,
  brand             TEXT,
  model             TEXT,
  money_page        BOOLEAN NOT NULL DEFAULT FALSE,
  priority          NUMERIC NOT NULL DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'planned',
  stage             TEXT NOT NULL DEFAULT 'discovery',
  payload           JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_generated_at TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_scp_cluster_type_status ON seo_cluster_plans(cluster_type, status);
CREATE INDEX idx_scp_city_id ON seo_cluster_plans(city_id);

-- 3. seo_publications — schema REDUZIDO (mimic produção)
-- Colunas presentes: as 7 que o hotfix Fase 3 sabe SEMPRE existir + is_indexable
-- (migration 022). Faltam: excerpt, publication_type, content_provider,
-- content_stage, is_money_page, health_status, brand, model, city_id, published_at.
-- O INSERT defensivo do bootstrap-publications.mjs deve omitir todas essas.
CREATE TABLE seo_publications (
  id              BIGSERIAL PRIMARY KEY,
  cluster_plan_id BIGINT REFERENCES seo_cluster_plans(id) ON DELETE SET NULL,
  path            TEXT NOT NULL UNIQUE,
  title           TEXT NOT NULL,
  content         TEXT,
  status          TEXT NOT NULL DEFAULT 'published',
  is_indexable    BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sp_cluster_plan ON seo_publications(cluster_plan_id);

-- 4. 2 cidades canônicas (slug bate VALID_SLUG_REGEX da Fase 1)
INSERT INTO cities (name, state, slug)
VALUES ('Atibaia', 'SP', 'atibaia-sp')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO cities (name, state, slug)
VALUES ('Jundiaí', 'SP', 'jundiai-sp')
ON CONFLICT (slug) DO NOTHING;

-- 5. 4 cluster_plans elegíveis (paths já transformados pela Fase 1 dos canonicals)
-- Imita exatamente o que bootstrap-cluster-plans.mjs --apply --limit=2 teria criado.
INSERT INTO seo_cluster_plans (
  city_id, cluster_type, path, money_page, priority, status, stage, payload
)
SELECT c.id, 'city_home', '/carros-em/atibaia-sp', FALSE, 100, 'planned', 'seed',
       jsonb_build_object('cluster_type','city_home','path','/cidade/atibaia-sp','money_page',false,'priority',100)
FROM cities c WHERE c.slug = 'atibaia-sp'
ON CONFLICT (path) DO NOTHING;

INSERT INTO seo_cluster_plans (
  city_id, cluster_type, path, money_page, priority, status, stage, payload
)
SELECT c.id, 'city_below_fipe', '/carros-baratos-em/atibaia-sp', TRUE, 94, 'planned', 'seed',
       jsonb_build_object('cluster_type','city_below_fipe','path','/cidade/atibaia-sp/abaixo-da-fipe','money_page',true,'priority',94)
FROM cities c WHERE c.slug = 'atibaia-sp'
ON CONFLICT (path) DO NOTHING;

INSERT INTO seo_cluster_plans (
  city_id, cluster_type, path, money_page, priority, status, stage, payload
)
SELECT c.id, 'city_home', '/carros-em/jundiai-sp', FALSE, 100, 'planned', 'seed',
       jsonb_build_object('cluster_type','city_home','path','/cidade/jundiai-sp','money_page',false,'priority',100)
FROM cities c WHERE c.slug = 'jundiai-sp'
ON CONFLICT (path) DO NOTHING;

INSERT INTO seo_cluster_plans (
  city_id, cluster_type, path, money_page, priority, status, stage, payload
)
SELECT c.id, 'city_below_fipe', '/carros-baratos-em/jundiai-sp', TRUE, 94, 'planned', 'seed',
       jsonb_build_object('cluster_type','city_below_fipe','path','/cidade/jundiai-sp/abaixo-da-fipe','money_page',true,'priority',94)
FROM cities c WHERE c.slug = 'jundiai-sp'
ON CONFLICT (path) DO NOTHING;

-- 6. Sanity check (não interromper transação — apenas reportar)
DO $$
DECLARE
  total_plans INT;
  total_pubs INT;
  total_cities INT;
BEGIN
  SELECT COUNT(*) INTO total_plans FROM seo_cluster_plans WHERE status = 'planned';
  SELECT COUNT(*) INTO total_pubs FROM seo_publications;
  SELECT COUNT(*) INTO total_cities FROM cities WHERE slug IN ('atibaia-sp','jundiai-sp');
  RAISE NOTICE '[fixture] cities canônicas: %', total_cities;
  RAISE NOTICE '[fixture] seo_cluster_plans status=planned: %', total_plans;
  RAISE NOTICE '[fixture] seo_publications total: %', total_pubs;
END $$;

COMMIT;
