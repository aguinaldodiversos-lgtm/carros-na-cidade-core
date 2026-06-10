# Fase 4.2 — CMS de Blog no Painel Admin

Data: 2026-06-10
Branch: main

## 1. Decisão de modelagem

- **Tabela nova `blog_posts`** (migration `035_blog_posts.sql`), independente de
  `home_sections`/`seo_publications`. Posts são entidades editoriais próprias, com
  workflow de status e SEO por registro.
- **Status**: `draft | published | unpublished | archived` (TEXT + CHECK). Não havia
  enum prévio de blog no projeto; `unpublished` foi escolhido (em vez de `paused`)
  porque o conceito é "já esteve no ar e foi retirado".
- **Categorias**: reutilizam as 6 categorias já existentes no frontend público
  (`compra, venda, manutencao, mercado, financiamento, cidades` —
  `frontend/lib/blog/blog-page.ts`), com CHECK no banco. Nenhuma categoria órfã possível.
- **Conteúdo**: Markdown simples armazenado como TEXT (parágrafos, `##`/`###`, listas,
  links, negrito/itálico, citação). **Sem editor pesado e sem HTML bruto**: o frontend
  renderiza com renderer próprio que emite elementos React (texto sempre escapado),
  nunca `dangerouslySetInnerHTML` para conteúdo do banco → XSS impossível por construção.
  Defesa dupla: o backend rejeita links markdown com `javascript:`, `data:`, `file:`,
  `vbscript:` ao salvar.
- **`published_at` = primeira publicação** (vira `datePublished` no JSON-LD);
  despublicar/republicar preserva. `dateModified` = `updated_at`.
- **`version`** com bump a cada UPDATE + `updated_by_admin_id` (padrão da 4.1).
- **`reading_time_minutes`** calculado no service ao salvar content (~200 wpm).

## 2. Migration

`src/database/migrations/035_blog_posts.sql` — idempotente (CREATE TABLE/INDEX IF NOT
EXISTS), padrão do executor custom do projeto (roda no boot). Índices:

- `idx_blog_posts_published_at` (parcial `WHERE status='published'`) — lista pública;
- `idx_blog_posts_published_category` — filtro por categoria;
- `idx_blog_posts_status_updated` — listagem admin;
- `blog_posts_slug_uq` (UNIQUE) + CHECK de formato de slug (`^[a-z0-9]+(-[a-z0-9]+)*$`).

## 3. Endpoints admin (`src/modules/admin/blog/` + `admin.routes.js`)

Todos atrás de `authMiddleware` + `requireAdmin()` (anônimo → 401, user comum → 403):

| Endpoint | Função |
|---|---|
| `GET /api/admin/blog/posts?status&search&limit&offset` | lista com filtros (busca por título/slug) |
| `GET /api/admin/blog/posts/:id` | detalhe completo |
| `POST /api/admin/blog/posts` | cria DRAFT (título ≥5 obrigatório; slug derivado se ausente) |
| `PATCH /api/admin/blog/posts/:id` | edita campos (status NÃO é editável aqui); reason opcional p/ rascunho |
| `PATCH /api/admin/blog/posts/:id/publish` | draft/unpublished → published; **reason obrigatório** |
| `PATCH /api/admin/blog/posts/:id/unpublish` | published → unpublished; **reason obrigatório** |
| `PATCH /api/admin/blog/posts/:id/archive` | → archived (+`archived_at`); **reason obrigatório** |
| `PATCH /api/admin/blog/posts/:id/restore` | archived → draft/unpublished; **reason obrigatório** |
| `POST /api/admin/blog/posts/:id/cover-image` | upload multipart da capa (R2) |

Validações de publicação (no publish e em PATCH de post já publicado, sobre o estado
final mesclado): título ≥5; slug válido e único (duplicado → **409**); excerpt
obrigatório ≤240; content ≥300 chars (máx 100k); alt obrigatório quando há capa.
Posts arquivados não publicam direto (exigem restore).

## 4. Endpoints públicos (`public-blog.controller.js` + `public.routes.js`)

| Endpoint | Comportamento |
|---|---|
| `GET /api/public/blog/posts?category&limit&offset` | **somente `published`** (filtro no SQL), paginado, mais recentes primeiro, sem `content` (payload enxuto), cache 60s |
| `GET /api/public/blog/posts/:slug` | somente `published`; draft/unpublished/archived/inexistente → **404**; cache 60s |

DTO público não vaza `author_id`, `version`, `updated_by_admin_id`.

## 5. UI admin (`/admin/conteudo/blog`)

- **Listagem** (`page.tsx`): tabela (título+slug, status com badge, categoria,
  publicado em, atualizado em), filtro por status, busca, paginação, ações rápidas
  por linha (publicar/despublicar/arquivar/restaurar) com `AdminActionDialog`
  `requireReason`.
- **Novo** (`novo/page.tsx`): título + slug opcional (preview da URL) + categoria →
  cria draft → redireciona ao editor.
- **Editor** (`[id]/page.tsx`): todos os campos + seção SEO (meta title/description
  com contadores 60/160 efetivos, canonical, og_image, is_indexable), upload de capa
  + alt, tags por vírgula, abas **Editar/Pré-visualizar** (preview renderiza o
  markdown real), **checklist de publicação** (espelha o backend) e **avisos de SEO
  que não bloqueiam** (inclui aviso de slug terminando em sigla de UF — colisão com
  hub de cidade). Salvar rascunho não exige reason; salvar post publicado exige
  (modal). Publicar bloqueado com alterações não salvas ou pendências.
- Item **Blog** adicionado ao `AdminTopbar`.

## 6. UI pública

- `/blog/[cidade]` agora é **rota dual**: se o segmento for slug de post publicado,
  renderiza o **artigo completo** (atende `/blog/<slug>` global da spec — Next só
  permite um segmento dinâmico por nível e ele já era `[cidade]`); senão, hub da
  cidade com os **posts do CMS na frente dos cards** (fallback hardcoded preenche o
  layout; dedup por slug).
- `/blog/[cidade]/[slug]` tenta o CMS primeiro (artigo completo, canonical global
  `/blog/<slug>` para evitar conteúdo duplicado entre cidades); sem post no CMS,
  mantém o shell legado. **Nenhuma URL existente quebrou.**
- Artigo (`CmsBlogPostArticle`, server component): breadcrumb, categoria, título,
  data + tempo de leitura, capa (com alt e fallback), markdown renderizado com
  segurança, tags, CTA de vitrine local, relacionados (posts recentes do CMS).
- `/blog` mantém o redirect por cidade (decisão documentada): o hub destino lista os
  posts do CMS, então “/blog mostra o post” do smoke é atendido após o redirect.

## 7. Upload de capa

Pipeline R2 existente (`uploadSiteImage`): multer memória, **8 MB**, JPEG/PNG/WebP/
HEIC/HEIF, normalização para **WebP** (sharp, EXIF strip, maxDim 2048). Pasta:
`site/blog/cover/<yyyy>/<mm>/<uuid>-<stem>.webp`. URL pública via
`R2_PUBLIC_BASE_URL`. Igual à 4.1: upload devolve URL mas **só grava no banco no
salvar** (com alt obrigatório). BFF dedicado com `arrayBuffer` (o proxy genérico
corromperia multipart via `text()`).

## 8. SEO implementado

- Slug limpo (lowercase, sem acentos, validado em ambas as pontas).
- `generateMetadata` do post: meta_title/meta_description do banco com fallback
  title/excerpt; canonical = `canonical_url` do post ou `/blog/<slug>`;
  **robots index/follow somente quando `published` + `is_indexable`** (não-indexável
  → noindex/follow; não-publicado → 404); Open Graph `article` + twitter card +
  imagem (og_image → capa).
- JSON-LD **BlogPosting** com headline, description, `datePublished`,
  `dateModified`, image, articleSection, author/publisher Organization,
  mainEntityOfPage + **BreadcrumbList**.
- Limites recomendados aplicados como **alertas no admin sem bloquear publicação**
  (meta_title 60, meta_description 160, excerpt 240 — excerpt é hard limit).

## 9. Auditoria

`recordAdminAction` em **toda** mutação, `target_type='blog_post'`,
`target_id=<id>`: `create_blog_post`, `update_blog_post`, `publish_blog_post`,
`unpublish_blog_post`, `archive_blog_post`, `restore_blog_post`. Transições com
reason obrigatório (400 sem). `old_value`/`new_value` = snapshots completos (content
substituído por `content_length` para não inflar a tabela).

## 10. Revalidate/cache

- Fetches públicos do Next com `revalidate: 300` + tag **`public-blog`**.
- `/api/revalidate` ampliado: paths `/blog`, tag `public-blog` permitidos.
- BFF dispara `triggerBlogRevalidate()` (best-effort, falha-soft com warning) após
  PATCH aceito e após publish/unpublish/archive/restore.
- Fallback: TTL 60s no `cacheGet` do backend + ISR 300s nas páginas.

## 11. Testes executados (2026-06-10)

- **Backend** (`vitest`): suíte completa **131 arquivos / 1758 testes verdes**, sendo
  48 novos: `tests/admin/admin-blog-service.test.js` (29 — slugify, reading time,
  create/validações/409, PATCH com invariantes, publish/unpublish/archive/restore,
  published_at preservado, upload R2, DTO público sem campos admin, XSS em links),
  `tests/admin/admin-blog-routes.test.js` (15 — 401 anônimo, 403 user comum,
  contratos das rotas, reason propagado) e
  `tests/public/public-blog-controller.test.js` (4 — lista published, 404 detalhe).
- **Frontend** (`vitest`): suíte completa **119 arquivos / 1659 testes verdes**,
  sendo 19 novos: `lib/blog/markdown.test.tsx` (8 — blocos, inline, links seguros,
  XSS javascript:/HTML bruto escapado) e `lib/blog/blog-cms.test.ts` (11 — mapeamento
  de cards, metadata com fallbacks/robots/canonical, fetchers + degradação).
- **`tsc --noEmit`**: limpo. **Prettier**: arquivos novos formatados.

## 12. Smoke de produção (roteiro pós-deploy + migration)

A. Schema:
```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name='blog_posts' ORDER BY ordinal_position;
```
B. Criar draft no admin (`/admin/conteudo/blog/novo`): título "Como comprar um carro
usado com segurança"; slug `como-comprar-carro-usado-com-seguranca`; resumo "Veja
cuidados essenciais antes de negociar um veículo usado."; conteúdo com ≥300 chars.

C. Confirmar banco:
```sql
SELECT id, title, slug, status, published_at, updated_at
FROM blog_posts ORDER BY id DESC LIMIT 5;
```
D. Publicar com reason: `Validação Fase 4.2 — publicação inicial do blog`.

E. Confirmar público: `/blog` (via redirect, hub mostra o card);
`/blog/como-comprar-carro-usado-com-seguranca` abre o artigo; `view-source` tem
`<title>`, meta description, canonical, JSON-LD BlogPosting; banco com
`status='published'` e `published_at` preenchido;
`SELECT action, reason FROM admin_actions WHERE target_type='blog_post' ORDER BY id DESC LIMIT 5;`
mostra `publish_blog_post`.

F. Despublicar com reason `Revert validação Fase 4.2` → post some de `/blog`,
slug retorna 404, `admin_actions` registra `unpublish_blog_post`.

## 13. Limitações conhecidas

1. **Colisão slug × cidade**: a rota dual dá precedência ao post; um post com slug
   exatamente igual a `<cidade>-<uf>` sombrearia o hub daquela cidade. Mitigado com
   aviso no editor (slug terminando em sigla de UF). Não bloqueado para não impedir
   slugs legítimos.
2. **`/blog` continua redirecionando** para o hub da cidade (preserva URLs/UX
   existentes); não há página de listagem global dedicada.
3. Markdown suporta o subconjunto definido (sem imagens inline, tabelas ou HTML).
4. Sem agendamento, múltiplos autores, comentários e workflow de aprovação
   (fora de escopo da fase).
5. Smoke de produção depende do deploy + migration (roteiro acima).

## 14. Veredito

**APROVADO para deploy.** Backend, BFF, admin e público implementados seguindo os
padrões da Fase 4.1 (auditoria com reason, upload R2 desacoplado do save, revalidate
best-effort, validação dupla client/server). Suítes completas verdes nos dois
projetos, type-check limpo, zero dependências novas. Pendência única: executar a
migration (automática no boot) e o smoke de produção da seção 12.
