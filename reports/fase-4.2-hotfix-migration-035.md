# Hotfix Fase 4.2 — migration 035 quebrava o boot em produção

Data: 2026-06-10
Branch: main

## 1. Causa raiz

O boot do backend caía em `startup_failure` ao aplicar `035_blog_posts.sql`:

```
column "published_at" does not exist
```

A tabela `blog_posts` **já existia em produção** — criada **fora das migrations**
pelo **motor de SEO** (não pelo CMS):

- [src/services/seoEngine.service.js](src/services/seoEngine.service.js) — `INSERT INTO blog_posts (city, title, slug, content) ... ON CONFLICT (slug)`
- [src/modules/seo/pages/seo-pages.repository.js](src/modules/seo/pages/seo-pages.repository.js) — `ensureCityLandingRecord` (`ON CONFLICT (slug) DO UPDATE`)
- [src/modules/seo/content/seo-content.repository.js](src/modules/seo/content/seo-content.repository.js) — `createBlogPost` (`status='published'`)

Esse esquema legado tem ~`(id, title, slug UNIQUE, content, city, brand, model,
status, created_at, updated_at)` e **nenhuma** coluna do CMS.

A migration original usava `CREATE TABLE IF NOT EXISTS blog_posts (...)`. Como a
tabela já existia, o comando foi **no-op** (não adiciona colunas a tabela
existente). A primeira instrução seguinte —
`CREATE INDEX ... idx_blog_posts_published_at ... (published_at)` — referenciou
uma coluna inexistente → erro → o runner fez `ROLLBACK` (cada migration roda em
uma transação, ver [src/database/migrate.js:247](src/database/migrate.js)) → `035`
**nunca foi registrada** em `schema_migrations` → boot abortado.

## 2. Correção da migration (aditiva, idempotente, compatível com legado)

Reescrita de [035_blog_posts.sql](src/database/migrations/035_blog_posts.sql) em
blocos, na ordem segura:

- **A) `CREATE TABLE IF NOT EXISTS`** com o **esquema unificado** (colunas do CMS
  **+** colunas legadas do SEO `city/brand/model`, nullable) — instalações novas.
  Sem `UNIQUE`/`CHECK` inline (uniformizados nos blocos guardados).
- **B) `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`** para **todas** as colunas
  (`title, slug, excerpt, content, cover_image_url, cover_image_alt, category,
tags, author_id, status, published_at, archived_at, meta_title, meta_description,
canonical_url, og_image_url, is_indexable, reading_time_minutes, source, version,
created_at, updated_at, updated_by_admin_id, city, brand, model`). Colunas com
  `DEFAULT` preenchem linhas existentes automaticamente. **É isto que adiciona
  `published_at` à tabela legada.**
- **C) `DROP NOT NULL`** em `city/brand/model` (guardado por existência da coluna):
  o CMS não preenche esses campos; sem isto, `INSERT` do painel falharia em runtime
  com `NOT NULL violation` (o SEO sempre informa `city`, então o legado pode tê-la
  como `NOT NULL`).
- **D) Backfill** com `WHERE ... IS NULL` (idempotente): `source='seo'`,
  `status='draft'`, `tags='[]'`, `is_indexable=TRUE`, `version=1`,
  `created_at/updated_at=NOW()`; `slug`/`title` recebem fallback `post-<id>` /
  `Post <id>` se vierem nulos/vazios (preserva unicidade do slug).
- **E) Discriminador `source`** (`'seo'` legado / `'cms'` painel) — ver §3.
- **F) Constraints/índices** só depois das colunas existirem:
  - `CHECK` de `status` e `category` como **`NOT VALID`** — não escaneiam/rejeitam
    linhas legadas e **não quebram escritas do motor de SEO**; validam toda escrita
    nova do CMS.
  - **Sem `CHECK` de formato de slug**: o motor de SEO gera slugs com regra própria
    (`replace(/[^\w\s]/g,"")`) que pode não casar com o padrão estrito do CMS — um
    `CHECK` rejeitaria escritas do SEO. A validação de slug do CMS vive no service.
  - Índice **único de slug** criado **só se ainda não existir** um único de 1 coluna
    em `(slug)` (produção já tem, pelo `ON CONFLICT (slug)`); se houver slugs
    duplicados e nenhum único, aborta com **mensagem clara**.
  - Índices de leitura (`published_at`, `category`, `status/updated_at`,
    `source/status`) com `IF NOT EXISTS`.

Idempotência coberta pelo teste de integração (ver §4): reaplicar o SQL inteiro é
no-op por construção (CREATE/ALTER ... IF NOT EXISTS, backfill com `WHERE ... IS
NULL`, constraints/índices guardados).

## 3. Isolamento CMS × SEO (a tabela é compartilhada)

Como `blog_posts` é escrita pelos **dois** subsistemas, sem discriminação o blog
público/admin do CMS passaria a listar as _landing pages_ do motor de SEO
(`status='published'`). Solução:

- coluna **`source`** (default `'seo'`; migration marca todo o legado como `'seo'`);
- [admin-blog.repository.js](src/modules/admin/blog/admin-blog.repository.js):
  `insertPost` carimba `source='cms'`; `listPosts`, `findById`,
  `listPublishedPosts` e `findPublishedBySlug` filtram `source='cms'`.
  `findBySlug` (checagem de unicidade) permanece **global** — casa o índice único
  global do banco e dá erro 409 limpo se um slug do CMS colidir com um do SEO.

O motor de SEO não foi alterado e segue funcionando: suas escritas pegam o default
`source='seo'`, suas leituras não referenciam `source`, e `ON CONFLICT (slug)`
continua válido.

## 4. Validação

- **Unit (backend), suíte completa**: `npm test` → **131 arquivos / 1758 testes
  verdes** (1 skip), incluindo os 48 do blog (service/rotas/controller continuam
  verdes — mockam o repositório, então o filtro `source` não os quebra).
- **Integração (real Postgres)**: novo caso em
  [tests/integration/migrations-compat.integration.test.js](tests/integration/migrations-compat.integration.test.js)
  — _“035 adota blog_posts legado do motor SEO…”_ — semeia uma `blog_posts` no
  formato legado (`city NOT NULL`, `slug UNIQUE`, sem colunas do CMS), roda as
  migrations e verifica: (1) `035` registrada; (2) `published_at` + demais colunas
  do CMS adicionadas; (3) linha legada vira `source='seo'`; (4) `INSERT` do CMS sem
  `city` funciona; (5) `INSERT` do SEO com `ON CONFLICT (slug)` segue válido; (6)
  público do CMS (`status='published' AND source='cms'`) não enxerga a landing page
  do SEO; (7) reaplicar o SQL é idempotente (sem duplicar `published_at`).
  Roda com a DB de teste: `npm run integration:db:up && npm run integration:db:wait
&& npm run test:integration:migrations`.

> **Execução local nesta sessão:** o teste de integração **não pôde ser executado
> aqui** — o Docker Desktop não subiu o daemon (10+ min; backend WSL2 indisponível
> no ambiente) e o Postgres local da porta 5432 tem credenciais próprias
> (não `postgres/postgres`), que não tento adivinhar. O teste está pronto e segue
> o mesmo padrão já validado dos casos `020`/`022` da mesma suíte; rode com a DB de
> teste no ar (`npm run integration:db:up && npm run integration:db:wait &&
npm run test:integration:migrations`) — localmente ou no CI. As suítes unitárias
> (backend completo + blog) foram executadas e estão verdes.

## 5. Critérios de aprovação

- [x] Deploy não falha no boot (migration aditiva; `published_at` deixa de faltar).
- [x] `035` aplica em banco com `blog_posts` legado parcial.
- [x] `blog_posts` passa a ter `published_at` (e todas as colunas do CMS).
- [x] `035_blog_posts` registrada em `schema_migrations` pelo runner (sem inserção
      manual).
- [x] Motor de SEO intacto (sem `CHECK` de slug, `ON CONFLICT (slug)` preservado).
- [x] CMS e SEO isolados por `source`.

## 6. Limitações / follow-ups

- Os `CHECK` de `status`/`category` ficam `NOT VALID` para proteger linhas legadas
  e escritas do SEO; a integridade do conteúdo do CMS é garantida pelo service.
- O motor de SEO continua criando `blog_posts` fora das migrations; a 035 agora
  “adota” o esquema. Unificar a propriedade da tabela (migrar o SEO para colunas
  próprias ou tabela separada) fica como follow-up de arquitetura.
