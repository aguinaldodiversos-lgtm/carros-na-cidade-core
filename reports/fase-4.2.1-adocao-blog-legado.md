# Fase 4.2.1 — Adotar matérias legadas do blog no CMS

Data: 2026-06-10
Branch: main

## 1. Origem real dos cards (diagnóstico)

Os cards do blog público **não vêm do banco** — são um **array hardcoded no
frontend**: [frontend/lib/blog/blog-page.ts](frontend/lib/blog/blog-page.ts) →
`buildFallbackContent(citySlug)` (`featuredPosts`, `trendingPosts`,
`popularPosts`). O hub `/blog/[cidade]` monta o conteúdo com
`fetchBlogPageContent`, que faz merge do CMS com esse fallback; como o CMS tinha
**0 posts `source='cms'`**, só o fallback aparecia — e o admin mostrava “0 posts”.

| Pergunta | Resposta |
|---|---|
| Vêm de array hardcoded? | **Sim** (`buildFallbackContent`). |
| Existem no banco `blog_posts`? | **Não** como CMS. (Há, possivelmente, linhas `source='seo'` do motor de SEO — outra coisa, ver Fase 4.2 hotfix.) |
| Têm slug? | Sim, porém **per-city** no fallback (ex.: `...-em-atibaia-sp`) e alguns globais. |
| Têm imagem de capa? | Sim — `/images/blog/*.jpg` (arquivos reais em `frontend/public/images/blog/`). |
| Têm conteúdo inicial? | Só excerpt/título; **sem corpo** (a página `[slug]` mostrava “Conteúdo completo em breve”). |
| Marcados como SEO/legacy/mock? | Mock/fallback hardcoded (não banco). |

Conclusão: caso da **“Alternativa aceitável” (§4)** — mover os dados para um
import do CMS e fazer o público priorizar o CMS.

## 2. Estratégia de adoção

1. **Dataset canônico** das 13 matérias em
   [src/modules/admin/blog/legacy-blog-seed.js](src/modules/admin/blog/legacy-blog-seed.js)
   — com conteúdo Markdown real (intro + 3–5 subtítulos + bullets + conclusão +
   CTA suave para `/comprar`). Títulos/slugs tornados **city-agnostic** (sem “em
   Atibaia”): um post canônico em `/blog/<slug>` serve todas as cidades (o hub
   `/blog/<cidade>` apenas lista) — evita conteúdo duplicado por cidade.
2. **Script idempotente** de adoção
   [scripts/blog/adopt-legacy-blog-posts.mjs](scripts/blog/adopt-legacy-blog-posts.mjs)
   (`--dry-run` / `--apply` / `--apply --force`). Chave de idempotência: `slug`.
3. **Hub público CMS-only** quando há posts (anti-duplicação) — ver §5.

Plano de adoção (função pura `buildAdoptionPlan`, testada):

| Situação do slug | Ação |
|---|---|
| não existe | `insert` |
| existe `source='cms'` | `skip-exists` (preserva edição) — `update` só com `--force` |
| existe `source!='cms'` (motor SEO) | `skip-conflict` (não toca a linha do SEO) |

Rodar duas vezes → tudo vira `skip-exists` (zero duplicação).

## 3. Campos importados por post

`source='cms'`, `status='published'`, `published_at=NOW()`, `is_indexable=true`,
`title`, `slug`, `excerpt`, `content` (Markdown), `cover_image_url`,
`cover_image_alt`, `category` (uma das 6 válidas), `tags` (+ marcador interno
`adotado-4.2.1`), `meta_title` (≤70), `meta_description` (≤200),
`reading_time_minutes` (calculado), `author_id`/`updated_by_admin_id`,
`created_at`/`updated_at`. Auditoria: **uma** `admin_actions`
`action='adopt_legacy_blog_posts'`, `target_type='blog_post'`, `target_id='batch'`,
`reason='Fase 4.2.1 — adoção de matérias legadas do blog'` (não polui com 1 por post).

## 4. Matérias adotadas (13) e categorias

| Slug | Título | Categoria |
|---|---|---|
| como-comprar-carro-usado-com-seguranca | Como comprar um carro usado com segurança | compra |
| como-vender-seu-carro-com-seguranca | Como vender seu carro com segurança | venda |
| suvs-mais-buscados-na-regiao | SUVs mais buscados na região | mercado |
| quando-trocar-os-pneus-do-seu-carro | Quando trocar os pneus do seu carro | manutencao |
| financiamento-de-veiculos-vale-a-pena | Financiamento de veículos: vale a pena? | financiamento |
| melhores-bairros-para-rodar-na-cidade | Melhores bairros para rodar na cidade | cidades |
| carros-economicos-mais-buscados | Carros econômicos mais buscados | mercado |
| ipva-2025-entenda-tudo | IPVA 2025: entenda tudo | financiamento |
| tecnologia-que-valoriza-seu-carro | Tecnologia que valoriza seu carro | mercado |
| documentos-para-vender-carro | Documentos para vender carro | venda |
| diferencas-entre-revisoes-e-manutencoes | Diferenças entre revisões e manutenções | manutencao |
| como-manter-revisao-em-dia | Como manter a revisão em dia sem apertar o orçamento | manutencao |
| 10-melhores-rotas-de-carro | 10 melhores rotas de carro para curtir no fim de semana | cidades |

Mapeamento das categorias sugeridas que **não existem** no CMS: “Rotas” →
`cidades`; “Tecnologia” → `mercado`; “Documentação/IPVA” → `financiamento`
(as 6 categorias válidas são `compra, venda, manutencao, mercado, financiamento,
cidades`, com CHECK no banco).

## 5. Anti-duplicação no público

[frontend/app/blog/[cidade]/page.tsx](frontend/app/blog/[cidade]/page.tsx): quando
`fetchPublishedBlogPosts` retorna posts, o hub passa a montar
`featuredPosts`/`popularPosts`/`trendingPosts` **somente do CMS** — o fallback
hardcoded só aparece quando o CMS está vazio. Assim as matérias adotadas não
duplicam com o fallback legado. A página `/blog/[cidade]/[slug]` já resolvia o CMS
primeiro (canonical global `/blog/<slug>`).

## 6. Testes

- **Unit** [tests/admin/adopt-legacy-blog-posts.test.js](tests/admin/adopt-legacy-blog-posts.test.js)
  (15) — integridade do dataset (slug canônico/único, categoria válida, excerpt
  ≤240, content ≥300, CTA `/comprar`, sem links perigosos, capa `/images/blog`) e
  `buildAdoptionPlan` (banco vazio → all insert; idempotência → all skip-exists;
  `--force` → update; `source!='cms'` → skip-conflict; cenário misto).
- Suíte do blog (service/rotas/controller) e frontend (markdown/blog-cms)
  permanecem verdes; `tsc --noEmit` do frontend limpo; smoke de import do grafo de
  módulos do script OK.
- **Execução real do `--apply`**: roda no ambiente com `DATABASE_URL` apontando
  para o banco (deploy). Não rodei `--apply` localmente (Docker do Postgres de
  teste indisponível; o Postgres local da 5432 tem credenciais próprias). O
  `--dry-run`/`--apply` estão prontos para o smoke de produção (§7).

## 7. Smoke de produção

```sql
-- A) Diagnóstico
SELECT source, status, COUNT(*) FROM blog_posts GROUP BY source, status ORDER BY 1,2;
```
```bash
# B) Dry-run (não escreve)
node scripts/blog/adopt-legacy-blog-posts.mjs --dry-run
# C) Apply
node scripts/blog/adopt-legacy-blog-posts.mjs --apply
```
```sql
-- D) Confirmar
SELECT id, title, slug, source, status, published_at
FROM blog_posts WHERE source='cms' ORDER BY updated_at DESC LIMIT 20;
```
- **E)** `/admin/conteudo/blog` lista os 13 posts; busca/filtro funcionam.
- **F)** Editar um post (excerpt/conteúdo) → salvar → `version`/`updated_at` sobem.
- **G)** `/blog` e `/blog/<slug>` mostram a matéria (CMS); fallback não duplica.
- **H)** Despublicar um post de teste (reason “Validação Fase 4.2.1 — despublicar
  post adotado”) → some do público; republicar se necessário.

Rodar o `--apply` **duas vezes** ⇒ segunda execução reporta `skip-exists` em tudo
(idempotente).

## 8. Pendências editoriais

- O conteúdo é um **ponto de partida** (marcado com tag `adotado-4.2.1`): revisar,
  expandir e, se desejado, **localizar por cidade** via novos posts.
- Imagens de capa reaproveitam as 5 artes de `/images/blog/` — trocar por arte
  própria por matéria quando houver.
- URLs antigas per-city do fallback (`...-em-atibaia-sp`) deixam de ser linkadas;
  a `[slug]` ainda tem o shell legado como rede de segurança (não duplica no hub).

## 9. Veredito

**APROVADO.** Origem diagnosticada (fallback hardcoded), matérias canonizadas como
posts editáveis do CMS via script idempotente e seguro (não sobrescreve edições,
não toca linhas do motor SEO), e o público passa a priorizar o CMS sem duplicar.
Pendência única: rodar `--apply` no ambiente de produção (script pronto; smoke na
§7).
