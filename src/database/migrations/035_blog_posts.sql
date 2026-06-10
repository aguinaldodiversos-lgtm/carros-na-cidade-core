-- =============================================================================
-- 035 — blog_posts: CMS editorial do Blog (Fase 4.2)
-- =============================================================================
--
-- O que esta migration cria
-- -------------------------
-- Tabela `blog_posts` — matérias do blog gerenciadas pelo painel admin
-- (criar, editar, publicar, despublicar, arquivar) sem depender de deploy.
--
-- Modelo de status (workflow editorial)
-- -------------------------------------
--   draft       → rascunho; nunca aparece publicamente.
--   published   → visível em /blog e /blog/<slug>; único status público.
--   unpublished → já foi publicado e foi retirado do ar; mantém published_at
--                 original para preservar datePublished se for republicado.
--   archived    → fora do fluxo editorial; archived_at preenchido. Para
--                 voltar, admin usa "restaurar" (vira draft/unpublished).
--
-- Categorias
-- ----------
-- Alinhadas às 6 categorias já existentes no frontend público
-- (frontend/lib/blog/blog-page.ts → BLOG_CATEGORY_DEFINITIONS). CHECK no
-- banco para impedir categoria órfã sem rota pública correspondente.
--
-- SEO
-- ---
-- meta_title/meta_description/canonical_url/og_image_url opcionais com
-- fallback a partir de title/excerpt/cover no frontend. is_indexable
-- default TRUE — só tem efeito quando status='published' (não-publicados
-- nunca são indexáveis porque retornam 404 público).
--
-- Auditoria
-- ---------
-- Mutação SEMPRE passa pelo service (admin-blog.service.js) que registra
-- admin_actions (create/update/publish/unpublish/archive/restore_blog_post)
-- com old_value/new_value/reason. `version` faz bump a cada UPDATE — mesmo
-- padrão de home_sections (034).
--
-- Idempotência
-- ------------
-- CREATE TABLE IF NOT EXISTS + índices IF NOT EXISTS. Rodar 2x dá zero diff.
-- =============================================================================

CREATE TABLE IF NOT EXISTS blog_posts (
  id                   BIGSERIAL PRIMARY KEY,

  -- Conteúdo editorial
  title                TEXT        NOT NULL,
  slug                 TEXT        NOT NULL,
  excerpt              TEXT,
  content              TEXT,               -- Markdown simples (parágrafos, ##/###, listas, links)
  cover_image_url      TEXT,               -- URL pública R2 (site/blog/cover/<yyyy>/<mm>/<uuid>.webp)
  cover_image_alt      TEXT,               -- obrigatório quando cover_image_url existir (validado no service)
  category             TEXT,
  tags                 JSONB       NOT NULL DEFAULT '[]'::jsonb,
  author_id            TEXT,               -- users.id do admin que criou

  -- Workflow
  status               TEXT        NOT NULL DEFAULT 'draft',
  published_at         TIMESTAMPTZ,        -- primeira publicação; preservado em unpublish/republish
  archived_at          TIMESTAMPTZ,

  -- SEO
  meta_title           TEXT,
  meta_description     TEXT,
  canonical_url        TEXT,
  og_image_url         TEXT,
  is_indexable         BOOLEAN     NOT NULL DEFAULT TRUE,
  reading_time_minutes INTEGER,            -- calculado no service ao salvar content (~200 wpm)

  -- Controle
  version              INTEGER     NOT NULL DEFAULT 1,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by_admin_id  TEXT,

  CONSTRAINT blog_posts_slug_uq UNIQUE (slug),
  CONSTRAINT blog_posts_status_chk CHECK (
    status IN ('draft', 'published', 'unpublished', 'archived')
  ),
  CONSTRAINT blog_posts_category_chk CHECK (
    category IS NULL
    OR category IN ('compra', 'venda', 'manutencao', 'mercado', 'financiamento', 'cidades')
  ),
  -- Slug canônico: lowercase, sem acentos, só [a-z0-9] e hífens internos.
  CONSTRAINT blog_posts_slug_format_chk CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

-- Caminho público quente: lista de publicados ordenada por data de publicação.
CREATE INDEX IF NOT EXISTS idx_blog_posts_published_at
  ON blog_posts (published_at DESC)
  WHERE status = 'published';

-- Filtro por categoria na listagem pública.
CREATE INDEX IF NOT EXISTS idx_blog_posts_published_category
  ON blog_posts (category, published_at DESC)
  WHERE status = 'published';

-- Listagem admin: filtro por status + ordenação por updated_at.
CREATE INDEX IF NOT EXISTS idx_blog_posts_status_updated
  ON blog_posts (status, updated_at DESC);

COMMENT ON TABLE blog_posts IS
  'Matérias do Blog gerenciadas pelo painel admin (Fase 4.2). Público vê apenas status=published.';

COMMENT ON COLUMN blog_posts.status IS
  'draft | published | unpublished | archived. Transições só via admin-blog.service (com auditoria).';

COMMENT ON COLUMN blog_posts.published_at IS
  'Primeira publicação (datePublished no JSON-LD). Preservado ao despublicar/republicar.';

COMMENT ON COLUMN blog_posts.content IS
  'Markdown simples. Renderizado no frontend público com renderer próprio sem HTML bruto (sem XSS).';

COMMENT ON COLUMN blog_posts.is_indexable IS
  'Quando TRUE e status=published, página pública leva robots index/follow. Caso contrário noindex.';
