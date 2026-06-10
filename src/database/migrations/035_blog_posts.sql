-- =============================================================================
-- 035 — blog_posts: CMS editorial do Blog (Fase 4.2) — ADITIVA / COMPARTILHADA
-- =============================================================================
--
-- IMPORTANTE — tabela COMPARTILHADA com o motor de SEO
-- ----------------------------------------------------
-- `blog_posts` JÁ EXISTE em produção: foi criada FORA das migrations pelo
-- motor de SEO (src/services/seoEngine.service.js,
-- src/modules/seo/pages/seo-pages.repository.js,
-- src/modules/seo/content/seo-content.repository.js). Esse esquema legado tem
-- aproximadamente (id, title, slug UNIQUE, content, city, brand, model, status,
-- created_at, updated_at) e NÃO possui nenhuma coluna do CMS.
--
-- Causa raiz do boot quebrado
-- ---------------------------
-- A versão anterior desta migration usava `CREATE TABLE IF NOT EXISTS` e logo
-- a seguir criava um índice sobre `published_at`. Em produção o IF NOT EXISTS
-- era no-op (a tabela já existia, sem as colunas do CMS) e o índice falhava com
--   «column "published_at" does not exist»
-- derrubando o boot (startup_failure) antes de a 035 ser registrada.
--
-- Estratégia desta versão (ADITIVA e idempotente)
-- -----------------------------------------------
--   A) CREATE TABLE IF NOT EXISTS com o esquema UNIFICADO (CMS + colunas
--      legadas do SEO) — para instalações novas.
--   B) ADD COLUMN IF NOT EXISTS para TODAS as colunas — completa tabelas
--      legadas parciais sem tocar nas colunas já existentes.
--   C) DROP NOT NULL nas colunas exclusivas do SEO (city/brand/model), para que
--      INSERTs do CMS (que não as preenchem) não falhem em runtime.
--   D) Backfill seguro de defaults nas linhas legadas.
--   E) Discriminador `source` ('seo' p/ linhas legadas, 'cms' p/ o painel) — o
--      conteúdo do motor SEO fica fora das telas do CMS sem quebrar o SEO.
--   F) Constraints/índices só DEPOIS das colunas existirem, e de forma
--      condicional (NOT VALID / IF NOT EXISTS / guards) para nunca quebrar
--      dados legados nem os INSERTs do motor SEO.
--
-- Por que SEM CHECK de formato de slug?
--   O motor SEO gera slugs com regra própria (replace(/[^\w\s]/g, "")) que pode
--   não casar com o padrão estrito do CMS. Um CHECK de slug rejeitaria escritas
--   do SEO. A validação de slug do CMS vive no service
--   (admin-blog.service.js), autoridade para o conteúdo do painel.
--
-- Idempotência
-- ------------
-- CREATE/ALTER ... IF NOT EXISTS, DROP NOT NULL (no-op se já nullable), backfill
-- com WHERE ... IS NULL, constraints guardadas por pg_constraint, índice único
-- guardado por pg_index. Rodar 2x dá zero diff.
-- =============================================================================

-- A) Esquema UNIFICADO para instalações novas. -------------------------------
--    Sem UNIQUE/CHECK inline: uniformizamos via os blocos guardados em (F),
--    para que instalações novas e bancos legados convirjam pelo mesmo caminho.
CREATE TABLE IF NOT EXISTS blog_posts (
  id                   BIGSERIAL PRIMARY KEY,

  -- Conteúdo editorial (CMS)
  title                TEXT        NOT NULL,
  slug                 TEXT        NOT NULL,
  excerpt              TEXT,
  content              TEXT,
  cover_image_url      TEXT,
  cover_image_alt      TEXT,
  category             TEXT,
  tags                 JSONB       NOT NULL DEFAULT '[]'::jsonb,
  author_id            TEXT,

  -- Workflow
  status               TEXT        NOT NULL DEFAULT 'draft',
  published_at         TIMESTAMPTZ,
  archived_at          TIMESTAMPTZ,

  -- SEO do post (CMS)
  meta_title           TEXT,
  meta_description     TEXT,
  canonical_url        TEXT,
  og_image_url         TEXT,
  is_indexable         BOOLEAN     NOT NULL DEFAULT TRUE,
  reading_time_minutes INTEGER,

  -- Origem da linha: 'cms' (painel) | 'seo' (motor de SEO / legado).
  source               TEXT        NOT NULL DEFAULT 'seo',

  -- Controle
  version              INTEGER     NOT NULL DEFAULT 1,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by_admin_id  TEXT,

  -- Colunas legadas do motor de SEO (nullable; o CMS não as usa, mas o motor
  -- de SEO continua escrevendo nelas — mantê-las aqui faz instalações novas
  -- também suportarem o motor de SEO).
  city                 TEXT,
  brand                TEXT,
  model                TEXT
);

-- B) Colunas faltantes em tabelas legadas parciais (no-op quando já existem). -
--    Colunas com DEFAULT são preenchidas pelo Postgres para linhas existentes.
--    title/slug entram como nullable aqui (só disparam em tabela legada que não
--    os tenha — improvável); o backfill em (D) garante valores não-nulos.
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS title                TEXT;
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS slug                 TEXT;
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS excerpt              TEXT;
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS content              TEXT;
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS cover_image_url      TEXT;
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS cover_image_alt      TEXT;
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS category             TEXT;
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS tags                 JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS author_id            TEXT;
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS status               TEXT NOT NULL DEFAULT 'draft';
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS published_at         TIMESTAMPTZ;
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS archived_at          TIMESTAMPTZ;
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS meta_title           TEXT;
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS meta_description     TEXT;
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS canonical_url        TEXT;
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS og_image_url         TEXT;
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS is_indexable         BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS reading_time_minutes INTEGER;
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS source               TEXT NOT NULL DEFAULT 'seo';
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS version              INTEGER NOT NULL DEFAULT 1;
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS updated_by_admin_id  TEXT;
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS city                 TEXT;
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS brand                TEXT;
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS model                TEXT;

-- C) Afrouxar NOT NULL das colunas exclusivas do SEO. ------------------------
--    O CMS não preenche city/brand/model. Se vierem NOT NULL do esquema legado,
--    o INSERT do painel falharia. DROP NOT NULL é no-op se já forem nullable e
--    não afeta o motor SEO (que sempre informa esses campos).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = current_schema()
                AND table_name = 'blog_posts' AND column_name = 'city') THEN
    ALTER TABLE blog_posts ALTER COLUMN city DROP NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = current_schema()
                AND table_name = 'blog_posts' AND column_name = 'brand') THEN
    ALTER TABLE blog_posts ALTER COLUMN brand DROP NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = current_schema()
                AND table_name = 'blog_posts' AND column_name = 'model') THEN
    ALTER TABLE blog_posts ALTER COLUMN model DROP NOT NULL;
  END IF;
END $$;

-- D) Backfill de defaults nas linhas legadas (idempotente: WHERE ... IS NULL). -
UPDATE blog_posts SET source       = 'seo'       WHERE source IS NULL;
UPDATE blog_posts SET status       = 'draft'     WHERE status IS NULL;
UPDATE blog_posts SET tags         = '[]'::jsonb WHERE tags IS NULL;
UPDATE blog_posts SET is_indexable = TRUE        WHERE is_indexable IS NULL;
UPDATE blog_posts SET version      = 1           WHERE version IS NULL;
UPDATE blog_posts SET created_at   = NOW()       WHERE created_at IS NULL;
UPDATE blog_posts SET updated_at   = NOW()       WHERE updated_at IS NULL;
-- slug/title nunca podem ficar nulos; fallback determinístico e único por id.
UPDATE blog_posts SET slug  = 'post-' || id::text WHERE slug  IS NULL OR btrim(slug)  = '';
UPDATE blog_posts SET title = 'Post '  || id::text WHERE title IS NULL OR btrim(title) = '';

-- F1) CHECK de status — NOT VALID: não escaneia/rejeita linhas legadas, mas
--     valida toda escrita nova. SEO usa 'published'/default (NULL passa). ------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'blog_posts_status_chk') THEN
    ALTER TABLE blog_posts
      ADD CONSTRAINT blog_posts_status_chk
      CHECK (status IN ('draft', 'published', 'unpublished', 'archived')) NOT VALID;
  END IF;
END $$;

-- F2) CHECK de category — lista fechada; NULL permitido (linhas SEO têm NULL). -
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'blog_posts_category_chk') THEN
    ALTER TABLE blog_posts
      ADD CONSTRAINT blog_posts_category_chk
      CHECK (
        category IS NULL
        OR category IN ('compra', 'venda', 'manutencao', 'mercado', 'financiamento', 'cidades')
      ) NOT VALID;
  END IF;
END $$;

-- F3) Índice único de slug — exigido pelo CMS e pelo ON CONFLICT (slug) do SEO.
--     Só cria se ainda não houver índice único de 1 coluna em (slug). Se houver
--     slugs duplicados (e nenhum único), aborta com mensagem CLARA. -----------
DO $$
DECLARE
  dup TEXT;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_index i
    JOIN pg_class t ON t.oid = i.indrelid
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY (i.indkey)
    WHERE t.relname = 'blog_posts'
      AND i.indisunique
      AND i.indnatts = 1
      AND a.attname = 'slug'
  ) THEN
    RETURN; -- já existe índice único em (slug)
  END IF;

  SELECT slug INTO dup
  FROM blog_posts
  WHERE slug IS NOT NULL
  GROUP BY slug
  HAVING COUNT(*) > 1
  LIMIT 1;

  IF dup IS NOT NULL THEN
    RAISE EXCEPTION
      'blog_posts: slug duplicado "%" impede criar o índice único. Resolva os slugs duplicados antes de aplicar 035_blog_posts.',
      dup;
  END IF;

  CREATE UNIQUE INDEX blog_posts_slug_uq ON blog_posts (slug);
END $$;

-- F4) Índices de leitura (colunas já existem neste ponto). --------------------
CREATE INDEX IF NOT EXISTS idx_blog_posts_published_at
  ON blog_posts (published_at DESC)
  WHERE status = 'published';

CREATE INDEX IF NOT EXISTS idx_blog_posts_published_category
  ON blog_posts (category, published_at DESC)
  WHERE status = 'published';

CREATE INDEX IF NOT EXISTS idx_blog_posts_status_updated
  ON blog_posts (status, updated_at DESC);

-- Caminho quente do CMS público/admin: filtra por source + status.
CREATE INDEX IF NOT EXISTS idx_blog_posts_source_status
  ON blog_posts (source, status, published_at DESC);

-- Comentários (idempotentes).
COMMENT ON TABLE blog_posts IS
  'Compartilhada: CMS do Blog (Fase 4.2, source=cms) + motor de SEO (source=seo). Público do CMS vê apenas source=cms AND status=published.';

COMMENT ON COLUMN blog_posts.source IS
  'Origem da linha: cms (painel admin) | seo (motor de SEO / legado). Queries do CMS filtram source=cms.';

COMMENT ON COLUMN blog_posts.status IS
  'draft | published | unpublished | archived. Transições do CMS via admin-blog.service (com auditoria).';

COMMENT ON COLUMN blog_posts.published_at IS
  'Primeira publicação (datePublished no JSON-LD). Preservado ao despublicar/republicar.';

COMMENT ON COLUMN blog_posts.is_indexable IS
  'Quando TRUE e status=published, a página pública leva robots index/follow. Caso contrário noindex.';
