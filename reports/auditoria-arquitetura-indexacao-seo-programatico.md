# Auditoria de Arquitetura de Indexação & SEO Programático — Carros na Cidade

**Domínio:** https://www.carrosnacidade.com
**Data:** 2026-06-26
**Tipo:** Auditoria técnica read-only. Nenhuma rota, sitemap, canonical, robots ou código de produção foi alterado.
**Objetivo:** Mapear a arquitetura atual de indexação/SEO antes de decidir como implementar páginas programáticas do tipo cidade + marca + modelo.

> Convenção de caminhos: tudo relativo à raiz do repo `carros-na-cidade-core`. O frontend Next.js 14 (App Router) vive em `frontend/`; o backend (Node/Express ESM) vive em `src/`; migrations em `src/database/migrations/`.

---

## A. Sumário executivo

### A.0 A descoberta central

**A rota que se quer "criar" já existe — só que sob `/cidade/`, não sob `/comprar/`.**

O projeto já tem, em produção, a família territorial completa:

- `/cidade/[slug]` — [frontend/app/cidade/[slug]/page.tsx](frontend/app/cidade/[slug]/page.tsx)
- `/cidade/[slug]/marca/[brand]` — [frontend/app/cidade/[slug]/marca/[brand]/page.tsx](frontend/app/cidade/[slug]/marca/[brand]/page.tsx)
- `/cidade/[slug]/marca/[brand]/modelo/[model]` — [frontend/app/cidade/[slug]/marca/[brand]/modelo/[model]/page.tsx](frontend/app/cidade/[slug]/marca/[brand]/modelo/[model]/page.tsx)

Essas páginas já consomem o backend (`/api/public/cities/:slug/brand/:brand/model/:model`), já geram `generateMetadata` com canonical+robots via `buildTerritorialMetadata`, e já emitem JSON-LD `CollectionPage + ItemList` via `TerritorialSeoJsonLd`. **"Comprar Fiat Argo em Atibaia" hoje tem como URL canônica `/cidade/atibaia-sp/marca/fiat/modelo/argo`** — não `/comprar/atibaia/fiat/argo`.

**Consequência para a tarefa:** criar uma nova família `/comprar/[cidade]/[marca]/[modelo]` seria a **terceira** representação da mesma intenção de busca (somando-se a `/cidade/.../marca/.../modelo/...` e ao catálogo filtrado `/comprar/cidade/[slug]?brand=&model=`). Isso é exatamente o cenário de conteúdo duplicado / doorway pages que a tarefa pede para evitar. A recomendação (seção M) é **consolidar e endurecer a família `/cidade/...` existente**, não criar uma nova.

### A.1 Estado de saúde — o que está bom

- **Infra territorial madura e centralizada:** helpers únicos para metadata (`buildTerritorialMetadata`), JSON-LD (`buildTerritorialJsonLd`), fetch (`territorial-public.ts`), card (`AdCard`) e listagem (`fetchAdsSearch`). Reuso é trivial.
- **Sitemap index real** com 9 sitemaps filhos + sitemaps regionais dinâmicos por estado.
- **Banco IBGE-backed:** tabela `cities` com slug único `nome-uf`, dataset IBGE dos 27 estados, `region_memberships` para raio regional.
- **Padrão anti-soft-404 deliberado:** middleware com gates (`territory-gate`, `ad-detail-gate`, regional guard) que emitem 404/503 *reais* antes do App Router, contornando o bug conhecido do Next 14.2.35 (`notFound()` em server component vira HTTP 200).
- **Painel admin SEO** schema-driven que já detecta buckets vazios, noindex/index por publicação, thin content e sitemap eligibility.

### A.2 Riscos vivos hoje (não hipotéticos)

1. **🔴 As páginas marca/modelo já estão indexáveis e SEM trava de estoque.** O backend retorna `robots: "index,follow"` *hardcoded* para brand/model ([src/read-models/cities/city-brand.service.js:67-72](src/read-models/cities/city-brand.service.js), [city-model.service.js:78-83](src/read-models/cities/city-model.service.js)), e o frontend (`shouldIndexTerritorialPage`, [territorial-seo.ts:103-158](frontend/lib/seo/territorial-seo.ts)) só faz noindex se o backend disser `noindex,nofollow`, ou se houver `page>1`/`sort`/filtro extra. **Página vazia (zero anúncios) NÃO é noindex.** A query do backend usa `LEFT JOIN`, então qualquer marca/modelo arbitrário contra uma cidade válida devolve 200 + index,follow. Isso é doorway/soft-404 indexável em produção agora.
2. **🔴 Contradição backend ↔ política documentada.** O próprio backend documenta que `city_brand`/`city_brand_model` "estão noindex,follow em produção" e por isso os exclui do sitemap ([cluster-plan-canonical-transform.js:132-146](src/modules/seo/planner/cluster-plan-canonical-transform.js)) — mas o endpoint público devolve `index,follow`. As duas camadas discordam. Resultado: páginas fora do sitemap, porém indexáveis via crawl/links internos.
3. **🟠 Fallback de erro gera canonical errado.** `buildEmptyTerritorialPayload` ([territorial-public.ts:176-211](frontend/lib/search/territorial-public.ts)) retorna `seo: {}` em caso de 429/indisponibilidade; aí o canonical cai para `toAbsoluteUrl("/")` (homepage) e robots fica `index` (porque `seo.robots !== "noindex,nofollow"`). Páginas em erro transitório se auto-canonicalizam para a home, indexadas.
4. **🟠 Matching de marca/modelo divergente entre estatística e listagem.** Snapshot usa `LOWER(brand)=LOWER($)` (exato); os anúncios listados na página vêm de `adsService.search` com `ILIKE '%brand%'` ([ads-filter.builder.js:246-247](src/modules/ads/filters/ads-filter.builder.js)). "gol" pode puxar "Golf"; cabeçalho e lista podem divergir.
5. **🟠 Sem `brand_slug`/`model_slug` persistido e sem catálogo FIPE canônico.** `ads.brand`/`ads.model` são TEXT livre, sem allow-list na escrita. Não há tabela FIPE de marcas/modelos. Variações ("HB20", "HB 20", "HB20S") convivem.
6. **🟠 8 páginas institucionais com canonical apontando para a home.** `/sobre`, `/contato`, `/ajuda`, `/como-funciona`, `/seguranca`, `/termos-de-uso`, `/politica-de-privacidade`, `/lgpd` não sobrescrevem `alternates.canonical`, herdando o `/` do root layout.
7. **🟡 `content.xml` emite 126 URLs (42 cidades × 3) incondicionalmente**, sem checar existência/estoque — pode listar páginas thin.
8. **🟡 `blog.xml` com `limit: 50`** trunca o sitemap de blog silenciosamente acima de 50 posts.

### A.3 Veredito

A base para SEO programático cidade+marca+modelo **já está construída e é boa**. O trabalho não é "criar uma rota" — é **(a) decidir a família canônica única, (b) fechar a porteira de indexação** (trava de estoque + 404/noindex reais para combinações inexistentes), e **(c) reconciliar a contradição backend/sitemap/canonical**. Detalhe na seção M e N.

---

## B. Mapa de rotas públicas indexáveis

Modo de render: "SSR default" = sem `dynamic`/`revalidate`, render dinâmico por request. "ISR n" = `export const revalidate = n`. "force-dynamic" = `export const dynamic = "force-dynamic"`.

| Rota | Arquivo | Render | generateMetadata | Canonical | Robots | JSON-LD | Flag | 404 / vazio |
|---|---|---|---|---|---|---|---|---|
| `/` | `app/page.tsx` | ISR 300 | não (herda root) | `/` (root) | index | WebSite + Organization + SearchAction | `isRegionalPageEnabled()` gateia bloco de regiões | sem 404 |
| `/comprar` | `app/comprar/page.tsx` | SSR default | não | — | — | — | — | sempre `redirect()` p/ cidade/estado |
| `/comprar/[slug]` | `app/comprar/[slug]/page.tsx` | ISR 60 | não | — | — | — | — | `redirect()` → `/veiculo/[slug]` (alias legado) |
| `/comprar/cidade/[slug]` | `app/comprar/cidade/[slug]/page.tsx` | ISR 60 | sim | **→ `/carros-em/[slug]`** | noindex se filtros restritivos | Breadcrumb + ItemList | fallback p/ cidade vizinha | `notFound()` se slug inválido |
| `/comprar/estado/[uf]` | `app/comprar/estado/[uf]/page.tsx` | ISR 60 | sim | **→ `/carros-usados/[uf]`** | noindex se filtros restritivos | Breadcrumb + ItemList | `isRegionalPageEnabled()` | `notFound()` se UF inválida |
| `/carros-em/[slug]` | `app/carros-em/[slug]/page.tsx` | force-dynamic | sim (`buildLocalSeoMetadata`) | self | index | CollectionPage + Breadcrumb + FAQ + ItemList | `isRegionalPageEnabled()` | `notFound()` (404 real); **vazio = index** |
| `/carros-usados/[uf]` | `app/carros-usados/[uf]/page.tsx` | force-dynamic | sim | self | noindex se filtros restritivos | ItemList | `isRegionalPageEnabled()` | `notFound()` |
| `/carros-usados/regiao/[slug]` | `app/carros-usados/regiao/[slug]/page.tsx` | force-dynamic | sim | flag: self **ou** `/carros-em/[citySlug]` | `shouldIndexRegionalPage()` (flag + min ads) | Place/Region + Breadcrumb + ItemList | `REGIONAL_PAGE_ENABLED`, `_INDEXABLE`, `_CANONICAL_SELF`, `_INDEX_MIN_ADS` | `notFound()` se flag off |
| `/carros-baratos-em/[slug]` | `app/carros-baratos-em/[slug]/page.tsx` | ISR 60 | sim | self | index | CollectionPage + Breadcrumb + FAQ | — | `notFound()` no loader |
| `/carros-automaticos-em/[slug]` | `app/carros-automaticos-em/[slug]/page.tsx` | ISR 60 | sim | **→ `/carros-em/[slug]`** | **noindex, follow** | CollectionPage | — | `notFound()` no loader |
| `/cidade/[slug]` | `app/cidade/[slug]/page.tsx` | SSR default | sim | **→ `/carros-em/[slug]`** (override) | `shouldIndexTerritorialPage` | CollectionPage (Territorial) | — | sem 404 — payload vazio |
| `/cidade/[slug]/abaixo-da-fipe` | `app/cidade/[slug]/abaixo-da-fipe/page.tsx` | SSR default | sim | **→ `/carros-baratos-em/[slug]`** | noindex (canonicaliza p/ fora) | CollectionPage + OfferCatalog | — | sem 404 — payload vazio |
| `/cidade/[slug]/oportunidades` | `app/cidade/[slug]/oportunidades/page.tsx` | SSR default | sim | → `/carros-baratos-em/[slug]` | noindex, follow | — | — | `permanentRedirect()` → abaixo-da-fipe |
| **`/cidade/[slug]/marca/[brand]`** | `app/cidade/[slug]/marca/[brand]/page.tsx` | SSR default | sim | `data.seo.canonicalPath` (backend) | `shouldIndexTerritorialPage` → **hoje index** | CollectionPage (mode="brand") | — | **sem 404 — payload vazio** |
| **`/cidade/[slug]/marca/[brand]/modelo/[model]`** | `app/cidade/[slug]/marca/[brand]/modelo/[model]/page.tsx` | SSR default | sim | `data.seo.canonicalPath` (backend) | `shouldIndexTerritorialPage` → **hoje index** | CollectionPage (mode="model") | — | **sem 404 — payload vazio** |
| `/[uf]/regiao/[ancora]` | `app/[uf]/regiao/[ancora]/page.tsx` | force-dynamic | não | — | — | — | — | `notFound()` ou `permanentRedirect()` |
| `/veiculo/[slug]` | `app/veiculo/[slug]/page.tsx` | force-dynamic | sim (por veículo) | self | index | **Product + Car + Offer + FAQPage + WebPage + Breadcrumb + ImageObject** | — | `notFound()` em generateMetadata (404 real) |
| `/anuncios` | `app/anuncios/page.tsx` | ISR 60 | sim | **→ `/comprar`** | noindex se filtros ativos | — | — | sem 404 |
| `/anuncios/[identifier]` | `app/anuncios/[identifier]/page.tsx` | force-dynamic | sim (noindex) | — | noindex | — | — | `notFound()` → `permanentRedirect()` → `/veiculo/[slug]` |
| `/lojas/[slug]` | `app/lojas/[slug]/page.tsx` | force-dynamic | sim (por loja) | self | **index sse `totalActiveAds>0`** | **AutoDealer** | — | `notFound()`; loja vazia = noindex |
| `/blog` | `app/blog/page.tsx` | ISR 300 | sim | `/blog` | index | — | cidade via cookie | sem 404 |
| `/blog/[cidade]` | `app/blog/[cidade]/page.tsx` | ISR 300 | sim (dual) | CMS→`/blog/[slug]`; senão `/blog/[cidade]` | CMS `is_indexable`; hub index | Article + Breadcrumb (path CMS) | precedência post CMS | sem 404 (fallback hub) |
| `/blog/[cidade]/[slug]` | `app/blog/[cidade]/[slug]/page.tsx` | ISR 300 | sim (dual) | CMS→`/blog/[slug]`; legado→self | CMS `is_indexable`; ausente→noindex,nofollow | Article / BlogPosting + Breadcrumb | precedência CMS | `notFound()` se post legado ausente |
| `/blog/[cidade]/categoria/[categoria]` | `app/blog/[cidade]/categoria/[categoria]/page.tsx` | ISR 300 | sim | self | noindex,nofollow se categoria inválida | — | — | `notFound()` se categoria inválida |
| `/tabela-fipe` | `app/tabela-fipe/page.tsx` | SSR default | não | — | — | — | cookie cidade | `redirect()` → `/tabela-fipe/[cidade]` |
| `/tabela-fipe/[cidade]` | `app/tabela-fipe/[cidade]/page.tsx` | ISR 300 | sim | self | index | — | `publicCatalogPageCopy("fipe")` | sem 404 |
| `/simulador-financiamento` | `app/simulador-financiamento/page.tsx` | SSR default | não | — | — | — | cookie cidade | `redirect()` → `[cidade]` |
| `/simulador-financiamento/[cidade]` | `app/simulador-financiamento/[cidade]/page.tsx` | ISR 300 | sim | self | index | — | `publicCatalogPageCopy("simulator")` | sem 404 |
| `/planos` | `app/planos/page.tsx` | ISR 900 | metadata estático | `/planos` | index | — | — | sem 404 |
| `/sobre`, `/contato`, `/ajuda`, `/como-funciona`, `/seguranca`, `/termos-de-uso`, `/politica-de-privacidade`, `/lgpd` | `app/<nome>/page.tsx` | estático | metadata estático | **herda `/` (BUG)** | index | — | — | sem 404 |

### B.1 Detalhe das rotas programáticas prioritárias

As páginas `marca/[brand]` e `marca/[brand]/modelo/[model]` são **orquestradores finos** (ver [page.tsx do modelo](frontend/app/cidade/[slug]/marca/[brand]/modelo/[model]/page.tsx), 51 linhas). Toda lógica SEO está em libs compartilhadas:

- **Fetch/validação:** `fetchCityModelTerritorialPage(slug, brand, model, searchParams)` → backend `GET /api/public/cities/{slug}/brand/{brand}/model/{model}` com `revalidate: 60` ([territorial-public.ts:255-296](frontend/lib/search/territorial-public.ts)). **Brand/model NÃO são validados no frontend** — passam crus. Sem `generateStaticParams`, sem `notFound()` nessas páginas.
- **Metadata:** `buildTerritorialMetadata(data, "model")` ([territorial-seo.ts:171-228](frontend/lib/seo/territorial-seo.ts)).
- **Canonical:** `alternates.canonical = toAbsoluteUrl(data.seo?.canonicalPath || "/")`. Sem override no frontend → confia no backend.
- **Robots:** `shouldIndexTerritorialPage` ([territorial-seo.ts:103-158](frontend/lib/seo/territorial-seo.ts)). Faz `index=false` apenas se `data.seo.robots === "noindex,nofollow"`, ou `page>1`, ou `sort`/`order`, ou chave de filtro fora do allow-list. **Não há trava de estoque.**
- **JSON-LD:** `<TerritorialSeoJsonLd mode="model">` → `buildTerritorialJsonLd` → `CollectionPage` com `about` Place, `isPartOf` WebSite e `mainEntity` ItemList de até 12 veículos linkando `/veiculo/{slug}`.
- **Empty/soft-404:** em 429/erro, `buildEmptyTerritorialPayload` devolve payload vazio com `seo:{}`; a página renderiza **HTTP 200 + seções vazias** com canonical→`/` e index=true. **Este é o risco de indexação nº1.**

---

## C. Mapa de sitemaps

`/sitemap.xml` ([app/sitemap.xml/route.ts](frontend/app/sitemap.xml/route.ts)) é um **sitemap index** (`<sitemapindex>`), `force-dynamic`, `Cache-Control: max-age=300, s-maxage=300`. Referencia 9 filhos fixos + um `regiao/{state}.xml` por estado detectado em runtime (`detectAvailableStates()` via BFF; fallback `[]` em erro). `lastmod` do index é sempre `new Date().toISOString()` (sintético, "agora").

| Sitemap | Arquivo | Fonte | URLs | Filtros | Pode ter vazia? | lastmod | Cache |
|---|---|---|---|---|---|---|---|
| index | `app/sitemap.xml/route.ts` | estático + `detectAvailableStates` | aponta 9 filhos + regiao/* | — | — | sintético | s-maxage 300 |
| core.xml | `app/sitemaps/core.xml/route.ts` | array estático (`sitemap-static.ts`) | `/`, `/anuncios`, `/comprar`, `/blog`, `/planos`, `/simulador-financiamento`, `/tabela-fipe` | nenhum | não | sintético | revalidate 3600 |
| content.xml | `app/sitemaps/content.xml/route.ts` | `citySeeds` (42 cidades hardcoded) | `/blog/{c}`, `/tabela-fipe/{c}`, `/simulador-financiamento/{c}` = **126 URLs** | nenhum | **🟡 sim — sem checagem** | sintético | force-static, revalidate 3600 |
| cities.xml | `app/sitemaps/cities.xml/route.ts` | BFF `type=city_home` (limit 50000) | `/cidade/{slug}` reescrito → `/comprar/cidade/{slug}` | backend | depende do backend | `entry.lastmod` | force-dynamic, revalidate 3600 |
| brands.xml | `app/sitemaps/brands.xml/route.ts` | BFF `type=city_brand` | paths `city_brand` do backend | backend | depende | `entry.lastmod` | revalidate 3600 |
| models.xml | `app/sitemaps/models.xml/route.ts` | BFF `type=city_brand_model` | paths `city_brand_model` | backend | depende | `entry.lastmod` | revalidate 3600 |
| below-fipe.xml | `app/sitemaps/below-fipe.xml/route.ts` | BFF `type=city_below_fipe` | paths abaixo-da-fipe | backend | depende | `entry.lastmod` | revalidate 3600 |
| local-seo.xml | `app/sitemaps/local-seo.xml/route.ts` | `buildLocalSeoTransitionEntries()` → **`[]`** | **nenhuma (vazio intencional)** | — | n/a | — | revalidate 3600 |
| opportunities.xml | `app/sitemaps/opportunities.xml/route.ts` | `buildOpportunitiesTransitionEntries()` → **`[]`** | **nenhuma (vazio intencional)** | — | n/a | — | revalidate 3600 |
| blog.xml | `app/sitemaps/blog.xml/route.ts` | `fetchPublishedBlogPosts({limit:50})` (CMS) | `/blog/{slug}` (canonical global) | slug regex; **exclui `is_indexable=false`** | não | `updated_at`/`published_at` | revalidate 3600 |
| regiao/[state].xml | `app/sitemaps/regiao/[state].xml/route.ts` | BFF `region/{state}` (50000) | paths por estado | backend | depende | `entry.lastmod` | force-dynamic, revalidate 3600 |

**Respostas diretas:**

- **Quais existem?** 10 filhos (core, content, cities, brands, models, below-fipe, local-seo[vazio], opportunities[vazio], blog, regiao/[state] dinâmico) + index.
- **Há sitemap index?** Sim, `/sitemap.xml`.
- **O que entra no core?** Só as 7 rotas top-level estáticas. O resto é por cluster.
- **Limite de 50k?** Parcial. Passa `limit=50000` ao BFF, mas **não há split spec-compliant** se um filho passar de 50k URLs/50MB. `blog.xml` está capado em 50.
- **Cache/ISR?** Sim, `revalidate 3600` nos filhos; index com s-maxage 300.
- **Risco de sitemap incluir página noindex?** **Sim, real.** Só `blog.xml` exclui noindex (`is_indexable=false`). Os filhos BFF (cities/brands/models/below-fipe/regiao) confiam 100% no backend `seo_cluster_plans` (sem checagem de noindex no frontend). `content.xml` emite 126 URLs sem checar existência.
- **Origem dos dados BFF:** `seo_cluster_plans` (NÃO a tabela `ads` viva). URLs são o `scp.path` pré-armazenado, com status `IN ('planned','published','generated')`, **sem threshold de contagem de anúncios** ([sitemap-public.repository.js:9-59](src/read-models/seo/sitemap-public.repository.js)).
- **⚠️ Kill switch backend:** todos os endpoints `/api/public/seo/sitemap/*` são gateados por `SITEMAP_PUBLIC_ENABLED` (default **off** → 503 + `X-Robots-Tag: noindex`) ([public-seo.controller.js:48-66](src/modules/public/public-seo.controller.js)). Ou seja, hoje os sitemaps BFF (cities/brands/models/below-fipe/regiao) **provavelmente servem vazio em prod** a menos que a flag esteja ligada.
- **URL base:** `getSiteUrl()` = `NEXT_PUBLIC_SITE_URL` (fallback `https://carrosnacidade.com`), trailing slash removido. **Sem enforcement de www** e sem canonicalização de host — usa verbatim o que estiver na env.

---

## D. Mapa de robots / noindex

### robots.txt ([app/robots.ts](frontend/app/robots.ts))

- **User-agent:** `*` único.
- **Allow:** `/`, `/anuncios`, `/comprar`, `/cidade/`, `/carros-em/`, `/carros-baratos-em/`, `/carros-automaticos-em/`, `/veiculo/`, `/blog/`, `/tabela-fipe/`, `/simulador-financiamento/`, `/sitemap.xml`, `/sitemaps/`.
- **Disallow:** `/api/`, `/dashboard`, `/dashboard-loja`, `/login`, `/pagamento`, `/impulsionar`.
- **Sitemap:** `${siteUrl}/sitemap.xml`. **Host:** `siteUrl`.
- ⚠️ **`/admin` e `/painel` NÃO estão no disallow** — são crawláveis pelo robots. Verificar se carregam `noindex` via metadata (provavelmente sim, mas não confirmado nesta auditoria).
- ⚠️ `/carros-usados/regiao/` não está nem em allow nem em disallow.

### noindex aplicado (via metadata Next, NÃO via X-Robots-Tag)

**Não há nenhum `X-Robots-Tag` emitido** — nem no middleware nem no `next.config.mjs` (que só seta `Cache-Control` em `/images/*`). Todo controle de indexação é via `metadata.robots` no Next.

- **noindex condicional:** catálogo filtrado (`/comprar/cidade/[slug]`, `/comprar/estado/[uf]`, `/anuncios`) quando há filtros restritivos; territorial (`shouldIndexTerritorialPage`) com `page>1`/`sort`/filtro extra; regional sob flags; `/lojas/[slug]` vazia; blog CMS `is_indexable=false`.
- **noindex fixo:** `/carros-automaticos-em/[slug]` (`noindex,follow` — canonicaliza p/ `/carros-em`), `/cidade/[slug]/oportunidades`, `/anuncios/[identifier]`.
- **index por padrão:** home, `/carros-em/[slug]` (inclusive vazia), `/veiculo/[slug]`, `/cidade/.../marca/...` e `.../modelo/...` (**inclusive vazias — risco**).

**Conflitos identificados:**
1. **🔴 Brand/model:** backend manda `index,follow`, política de sitemap documenta `noindex,follow`, frontend obedece o backend → **indexável**, mas fora do sitemap. Contradição tripla.
2. **🟠 Institucionais indexáveis mas canonical→home** → Google pode descartá-las como duplicata de `/`.
3. **🟡 `content.xml`** lista `/blog/{cidade}`, `/tabela-fipe/{cidade}`, `/simulador/{cidade}` para 42 cidades, mesmo sem conteúdo/estoque.

---

## E. Mapa de canonical

Geração central: `getSiteUrl()` + `toAbsoluteUrl()` ([lib/seo/site.ts:5-17](frontend/lib/seo/site.ts)). Usa `NEXT_PUBLIC_SITE_URL`. **Não força www nem normaliza host.** Se a env estiver sem `www`, todos os canonicals saem sem `www` (divergente do domínio oficial `https://www.carrosnacidade.com`). **Confirmar o valor de `NEXT_PUBLIC_SITE_URL` em produção é ação prioritária** (ver seção O).

| Rota | Canonical | Aponta para |
|---|---|---|
| `/` e institucionais | `/` | self (home) / **bug nas institucionais** |
| `/cidade/[slug]` | override → `/carros-em/[slug]` | rota "vencedora" |
| `/cidade/[slug]/abaixo-da-fipe` | override → `/carros-baratos-em/[slug]` | rota "vencedora" |
| `/cidade/.../marca/[brand]` e `.../modelo/[model]` | `data.seo.canonicalPath` (backend) = `/cidade/{slug}/marca/{brand}[/modelo/{model}]` | **self** |
| `/comprar/cidade/[slug]` | override → `/carros-em/[slug]` | consolidação |
| `/comprar/estado/[uf]` | override → `/carros-usados/[uf]` | consolidação |
| `/carros-em/[slug]` | self | "vencedora" |
| `/carros-automaticos-em/[slug]` | → `/carros-em/[slug]` | consolidação |
| `/anuncios` | → `/comprar` | consolidação |
| `/veiculo/[slug]` | self | self |
| `/blog/[cidade]/[slug]` (CMS) | global `/blog/[slug]` | desacoplado da cidade |

**Estratégia de transição em curso:** `carros-em` / `carros-baratos-em` / `carros-usados/[uf]` são as URLs canônicas "vencedoras"; as famílias `cidade/*` e `comprar/*` apontam autoridade para elas (Fase 1 de uma "auditoria de canonical territorial", canonical-only, ainda sem 301). **Exceção crítica:** marca/modelo (`/cidade/.../marca/.../modelo/...`) canonicalizam para **self**, não para uma vencedora — são as únicas folhas territoriais que ainda não têm consolidação definida.

**Respostas diretas:**
- **`/comprar?cidade=...` vs rota limpa?** O catálogo filtrado faz noindex quando há filtros restritivos e canonicaliza para `/carros-em/[slug]` — mitigado.
- **`/carros-em/[slug]` vs `/comprar/cidade/[slug]`?** `/comprar/cidade/[slug]` canonicaliza → `/carros-em/[slug]`. Sem duplicidade efetiva.
- **`/blog` vs `/blog/[cidade]`?** São hubs distintos; posts CMS usam canonical global `/blog/[slug]`. Sem duplicidade direta.
- **www/non-www?** **Risco aberto** — depende exclusivamente da env. Verificar.
- **Canonical de página vazia?** **Sim, problema:** payload vazio → canonical `/` + index. E marca/modelo vazias canonicalizam para si mesmas, indexadas.

---

## F. Middleware e flags

### Middleware ([frontend/middleware.ts](frontend/middleware.ts))

Matcher: `["/((?!_next|images|favicon\\.ico|robots\\.txt|sitemap\\.xml).*)"]` — pega **tudo** menos estáticos. `/api/*` e `/sitemaps/*` (plural) **são** processados. Qualquer rota HTML nova é matchada.

Pipeline ordenado:

| # | Etapa | Arquivo | Comportamento |
|---|---|---|---|
| 0a | Host canônico 301 | `lib/middleware/host-redirect.ts` | `*.onrender.com` → `https://www.carrosnacidade.com` (301) |
| 0b | Bot guard 429 | `lib/middleware/bot-guard.ts` | UA vazio em prefixos "quentes" (`/comprar/`, `/carros-em/`, `/carros-baratos-em/`, `/carros-automaticos-em/`, `/carros-usados/regiao/`, `/cidade/`) → 429 |
| 1 | Legacy `/:uf/regiao/:ancora` | inline | 301 → `/carros-usados/regiao/{ancora}-{uf}` |
| 2 | **Regional hard gate** | `lib/regional-page-guard.ts` | Só em `/carros-usados/regiao/[slug]`. **Fail-CLOSED** (503 + Retry-After 60 se backend indisponível) |
| 2b | **Territory gate** | `lib/middleware/territory-gate.ts` | `/carros-usados/[uf]`, `/comprar/estado/[uf]`, `/carros-em/[slug]`. UF inválida → 404 real |
| 2c | **Ad-detail gate** | `lib/middleware/ad-detail-gate.ts` | `/veiculo/[id]`, `/anuncios/[id]`. **Fail-OPEN** (indisponível → passa) |
| 3 | Legacy hyphen 301s | inline | `/carros-em-x`→`/carros-em/x`, `/painel/anuncios/novo`→`/anunciar/novo`, etc. |
| fim | injeta `x-cnc-pathname` | inline | p/ RootLayout resolver cidade ativa no SSR |

**Por que middleware e não só `page.tsx`:** Next 14.2.35 devolve **HTTP 200 com corpo soft-404** quando `notFound()` roda em server component após o `<head>` ser enviado. O middleware emite 404 real antes do App Router. Headers de diagnóstico: `X-Middleware-Regional`, `X-Middleware-State`, `X-Middleware-City`, `X-Middleware-Ad`, `X-Middleware-Bot-Guard` (não há `X-Robots-Tag`).

### Flags de indexação ([frontend/lib/env/feature-flags.ts](frontend/lib/env/feature-flags.ts), `import "server-only"`, contrato estrito `=== "true"`, default `false`)

| Flag (env) | Função | Default | Gateia |
|---|---|---|---|
| `REGIONAL_PAGE_ENABLED` | `isRegionalPageEnabled()` | false | existência de `/carros-usados/regiao/[slug]` (e o middleware) |
| `REGIONAL_PAGE_INDEXABLE` | `isRegionalPageIndexable()` | false | regional emite `noindex,follow` se off |
| `REGIONAL_INDEX_MIN_ADS` | `regionalIndexMinAds()` | 0 | mínimo de anúncios p/ indexar |
| `REGIONAL_PAGE_CANONICAL_SELF` | `isRegionalPageCanonicalSelf()` | false | off → canonical regional → `/carros-em/[slug]` |
| `EVENTS_ENABLED`+`EVENTS_PUBLIC_ENABLED` | `isEventsPublicEnabled()` | false | visibilidade de eventos (não-SEO-core) |
| `SITEMAP_PUBLIC_ENABLED` (backend) | — | **off** | endpoints `/api/public/seo/sitemap/*` (503 se off) |

**Respostas diretas:**
- **Quais páginas dependem de flags?** Só a família regional (`/carros-usados/regiao/*`) e o bloco de regiões da home. **Marca/modelo NÃO dependem de flag.**
- **Uma rota nova `/comprar/[cidade]/[marca]/[modelo]` seria bloqueada pelo middleware?** **Não pelo matcher** (catch-all) e **não por flag**. Mas há **dois conflitos reais**: (1) **colisão de nome de segmento dinâmico** — não dá para ter `[cidade]` ao lado do `[slug]` existente em `app/comprar/*` (Next.js erro de build); seria preciso reusar `[slug]` ou usar prefixo estático; (2) bot-guard 429 cobre o prefixo `/comprar/` (só UA vazio — Googlebot manda UA, baixo risco).
- **Lógica regional afeta marca/modelo?** Os regexes dos gates são ancorados (`/carros-usados/...`, `/comprar/estado/...`) e **não** matcham `/cidade/.../marca/...`. Nenhum redirect/rewrite intercepta a família `/cidade/...`.
- **Redirect legado conflitante?** `/comprar/[slug]` redireciona p/ `/veiculo/[slug]` — uma URL `/comprar/atibaia` cairia nesse alias legado.

---

## G. Arquitetura de cidades / regiões

- **Tabela `cities`** ([001_baseline_cities.sql](src/database/migrations/001_baseline_cities.sql)): `id`, `name`, `state` (UF), `slug` (UNIQUE). Migrations posteriores: `latitude/longitude` (021), `is_ancora` (028), `stage/population/region`.
- **Dataset IBGE real:** [src/modules/cities/ibge-municipios.service.js](src/modules/cities/ibge-municipios.service.js) busca a API IBGE dos 27 estados. Seeds: `scripts/seed-ibge-municipios.mjs`, `import-ibge-cities.js`, `seed-cities-latlng.mjs`.
- **`region_memberships`** (021): `(base_city_id, member_city_id, distance_km, layer)`; layer 1 ≤30km, 2 30–60km. Fonte do `/api/internal/regions/:slug` usado pelo regional guard.

### Slug — normalizador canônico ([src/shared/utils/slugify.js](src/shared/utils/slugify.js))

```js
export function slugify(text) {
  return text.toString()
    .normalize("NFD").replace(/[̀-ͯ]/g, "") // strip acentos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
```

DB slug = `${slugify(nome)}-${uf.toLowerCase()}`. Validadores no frontend (todos estruturais, formato `nome-uf`):
- `isValidCitySlug()` ([lib/buy/territory-variant.ts:68](frontend/lib/buy/territory-variant.ts)) — última parte `/^[a-z]{2}$/`.
- `CITY_SLUG_REGEX = /^[a-z0-9-]+-[a-z]{2}$/` ([lib/city/city-from-pathname.ts:39](frontend/lib/city/city-from-pathname.ts)).
- `extractSlugUf()` + `isValidBrUf()` ([lib/middleware/territory-gate.ts:50](frontend/lib/middleware/territory-gate.ts)).

Existência real é confirmada pelo backend (`/api/public/cities/:slug` faz `WHERE c.slug=$1`).

**Respostas diretas:**
- **city_slug vem de onde?** Da coluna `cities.slug` (IBGE-seeded), formato `nome-uf`.
- **Tabela oficial de cidades?** Sim, `cities` (IBGE).
- **Representação:** Atibaia=`atibaia-sp`, São Paulo=`sao-paulo-sp`, Mogi Guaçu=`mogi-guacu-sp`, Belo Horizonte=`belo-horizonte-mg`, Curitiba=`curitiba-pr`.
- **Cidades fora de SP?** Sim, 27 UFs suportadas. SP é só *fallback* default quando o slug não tem UF parseável.
- **UF no banco?** Sim, `cities.state` e `ads.state`.
- **Slug duplicado entre estados?** Mitigado pelo sufixo `-uf` + UNIQUE index. **Ressalva:** migration 001 cria índice **não-único** se já houver duplicatas no momento da migração (bloco `HAVING COUNT(*)>1`). Em seed IBGE limpo, unicidade vale.
- **Acentos?** NFD strip (`ã`→`a`, `ç`→`c`).

### Colunas de localização em `ads` ([004_baseline_ads.sql](src/database/migrations/004_baseline_ads.sql))

`city_id BIGINT` (FK), `city TEXT`, `state TEXT`, `slug` (slug do anúncio), índice `(status, city_id)`. **Não há `city_slug` nem `region` em `ads`** — busca territorial filtra por `city_id`/`state`.

---

## H. Arquitetura de marca / modelo

- **Colunas:** `ads.brand TEXT NOT NULL`, `ads.model TEXT NOT NULL` ([004_baseline_ads.sql:18-19](src/database/migrations/004_baseline_ads.sql)). **Sem `brand_slug`/`model_slug` em lugar nenhum** (grep em todas as migrations: zero). `ads.version` existe como texto livre.
- **Sem catálogo FIPE canônico.** Não há tabela `fipe_brands`/`fipe_models`. FIPE aparece só como: `below_fipe BOOLEAN` e códigos opcionais de escrita (`fipe_brand_code` etc.) validados em `ads.validators.js` e enviados à API externa parallelum no *create* para scoring de preço — **não persistidos como colunas consultáveis** nem usados nas queries territoriais.
- **Validação de escrita:** `z.string().min(1)` — sem allow-list. Marca/modelo são o que o anunciante digitou.
- **Matching divergente (2 camadas):**
  - Snapshot (contagem/min/max): **exato** `LOWER(a.brand)=LOWER($2)` ([city-brand.repository.js:28](src/read-models/cities/city-brand.repository.js)).
  - Anúncios listados na página: **substring** `a.brand ILIKE '%brand%'` ([ads-filter.builder.js:246-247](src/modules/ads/filters/ads-filter.builder.js)). → cabeçalho e lista podem divergir ("gol"→"Golf").
- **Slug de facet/link interno:** `encodeURIComponent(String(brand).toLowerCase())` ([city-public.service.js:76,82](src/read-models/cities/city-public.service.js)) — **sem strip de acento nem hifenização**.

**Respostas diretas:**
- **Existe brand_slug/model_slug persistido?** Não.
- **Como derivar com segurança?** Hoje a derivação é inconsistente: `slugify()` (acento+hífen) em algumas rotas, `lowercase+encodeURIComponent` em outras. **Precisa de um único helper canônico.**
- **Acentos/espaços/compostos?** Sim, convivem ("Citroën", "Land Rover", "HB20S").
- **Como Chevrolet/VW/Hyundai/Fiat são salvos?** Texto livre como digitado — sem normalização garantida.
- **Variações do mesmo modelo?** Sim ("HB20"/"HB 20"/"HB20S" são valores distintos), porque não há catálogo.
- **FIPE como fonte canônica?** Não existe tabela FIPE local — só API externa em tempo de criação.
- **Risco de `/fiat/argo` não achar anúncio por divergência?** Sim, é o cenário mais provável de página vazia indexável.

---

## I. Listagens públicas existentes

- **Card oficial e único:** `AdCard` ([components/ads/AdCard.tsx](frontend/components/ads/AdCard.tsx)) — 8 variantes (`grid`/`featured`/`compact`/…). Tudo o mais (`CatalogVehicleCard`, `VehicleCard`, `CarCard`, `HomeVehicleCard`) é adapter que converte para `BaseAdData` e delega ao `AdCard`. Badges via `lib/ads/ad-badges.ts`, href via `lib/ads/build-ad-href.ts`.
- **Grids:** `VehicleGrid` (→ `CatalogVehicleCard`, com **empty state rico** `buildEmptyStateCopy`) e `AdGrid` (→ `AdCard` direto, empty state simples). `SearchResultsList` = wrapper de `AdGrid`.
- **Service central de listagem:** `fetchAdsSearch(filters)` ([lib/search/ads-search.ts:487-520](frontend/lib/search/ads-search.ts)) → `GET /api/ads/search`, `revalidate: 60`; `fetchAdsFacets` companheiro. Filtros: `city_slug`, `city_slugs[]` (multi-cidade regional), `brand`, `model`, preço/ano/km, `priority_tier`, `opportunity`, `seller_kind`, `sort`, `page`, `limit`. Builder central de params: `buildAdsSearchParams`.
- **Ranking:** **no backend** (SQL `commercialLayerExpr`/`baseCityBoostExpr`); o frontend lê `priority_tier` (1–4) e respeita a ordem do backend. Há um ranker client-side legado (`sortCatalogItems` em `lib/buy/catalog-helpers.ts`) **não usado** pelo `/comprar` para não divergir da paginação.
- **Paginação:** sim (`AdsPagination`). **Cache:** sim (`revalidate 60` + React `cache()`).

**Territorial vs catálogo:**

| | Territorial (`/cidade/...`) | Catálogo (`/carros-em/[slug]`, `/comprar/cidade/[slug]`) |
|---|---|---|
| Fetch | `territorial-public.ts` → `/api/public/cities/...` (payload rico: sections, stats, signals, seo, facets, internalLinks) | `fetchAdsSearch` + `fetchAdsFacets` direto em `/api/ads/search` |
| Client | `TerritorialResultsPageClient` | `BuyMarketplacePageClient` |
| Grid/card | `SearchResultsList`→`AdGrid`→`AdCard` | `VehicleGrid`→`CatalogVehicleCard`→`AdCard variant="grid"` |
| Empty state | `AdGrid` inline | `VehicleGrid` rico + `buildEmptyStateCopy` |

**Recomendação de reuso:** para a folha programática, manter o stack territorial (`territorial-public` + `TerritorialResultsPageClient` + `AdCard`), pois já alimenta `generateMetadata`+JSON-LD do mesmo fetch (React `cache()`).

---

## J. JSON-LD existente

| Tipo schema.org | Gerado em | Renderiza em |
|---|---|---|
| WebSite + SearchAction | `lib/seo/home-structured-data.ts:11-25` | `/` |
| Organization | `lib/seo/home-structured-data.ts:27-33` | `/` |
| WebPage/CollectionPage (genérico) | `lib/seo/page-structured-data.ts:21-47` | helper |
| BreadcrumbList | `lib/seo/page-structured-data.ts:8-19`; local-seo `:179-256`; region `:102-135` | catálogo, carros-em, regiões |
| CollectionPage (territorial) | `lib/seo/territorial-seo.ts:242-311` (`buildTerritorialJsonLd`) | `/cidade/[slug]`, marca, modelo, abaixo-da-fipe |
| CollectionPage (local-seo) | `lib/seo/local-seo-metadata.ts:258-306` | `/carros-em/[slug]` |
| CollectionPage (region) | `lib/seo/region-structured-data.ts:170-191` | `/carros-usados/regiao/[slug]` |
| ItemList + ListItem | territorial `:295-303`; local-seo `:296`; region `:144`; inline em carros-em/comprar | city/region/catálogo |
| Place / AdministrativeArea | territorial `about`; region `:73-95` | city/region |
| **Product + Car + Offer + ImageObject + AutoDealer/Person** | `lib/seo/vehicle-structured-data.ts:74-153` | **`/veiculo/[slug]`** |
| AutoDealer (loja) | `app/lojas/[slug]/page.tsx:96-116` | `/lojas/[slug]` |
| FAQPage | `lib/seo/faq.ts:14-28` | `/carros-em/[slug]`, abaixo-da-fipe |
| BlogPosting / Article | `lib/blog/blog-cms.ts:205-216` | `/blog/[cidade]/[slug]` |

**Respostas diretas:**
- **Schemas usados?** WebSite, Organization, SearchAction, BreadcrumbList, CollectionPage, ItemList, Place, Product, Car, Offer, ImageObject, AutoDealer, FAQPage, BlogPosting.
- **Não usados:** LocalBusiness, `Vehicle` literal, arrays `@type:["Product","Car"]` (split proposital em nós single-type para detectabilidade).
- **Duplicados/inválidos?** Não foram encontrados inválidos. ItemList aparece tanto via helper quanto inline em algumas rotas (carros-em/comprar) — consistente, não conflitante.
- **Product/Car no detalhe?** Sim, em `/veiculo/[slug]` (mais rico do app).
- **Padrão a reusar em cidade+marca+modelo:** `buildTerritorialJsonLd` via `<TerritorialSeoJsonLd mode="model">` — **já é exatamente o que a rota existente usa.** Possível melhoria: enriquecer o ItemList com `Offer`/`Car` por item (hoje é só `ListItem` linkando `/veiculo/{slug}`).

---

## K. Políticas de página vazia

Políticas **por rota, inconsistentes por design**:

| Cenário | Política atual | Evidência |
|---|---|---|
| `/carros-em/[slug]` cidade válida, 0 anúncios | **empty state + INDEX** ("cidade existe, está vazia agora") | `app/carros-em/[slug]/page.tsx:149-153` |
| `/carros-em/[slug]` slug inválido | `notFound()` 404 real (force-dynamic) | `:106` |
| `/comprar/cidade/[slug]` 0 anúncios | **fallback p/ cidade vizinha** (mesma UF), suprime ItemList | `:213-242, 260` |
| `/comprar/cidade/[slug]` slug inválido | `notFound()` | `:176` |
| `/lojas/[slug]` 0 anúncios | **empty state + NOINDEX** (`indexable = totalActiveAds>0`) | `app/lojas/[slug]/page.tsx:64` |
| **`/cidade/.../marca/...` e `.../modelo/...` 0 anúncios** | **render 200 + INDEX** (sem trava) | `shouldIndexTerritorialPage` não checa estoque |
| Backend 429/erro (qualquer territorial) | `buildEmptyTerritorialPayload` → 200, canonical `/`, INDEX | `territorial-public.ts:176-211` |
| `/veiculo/[slug]` inexistente/arquivado/vendido | `notFound()` 404 real (+ ad-detail-gate no middleware; 410→404) | `app/veiculo/[slug]/page.tsx:145` |

**Respostas diretas:**
- **404 real?** Sim para veículo, slug de cidade inválido, loja inexistente, post legado.
- **noindex?** Só loja vazia e catálogo filtrado.
- **soft-404?** Sim — marca/modelo vazias e payload de erro renderizam 200 indexável. **É a maior lacuna.**
- **Estado vazio renderizado?** Sim (rico em VehicleGrid, simples em AdGrid).
- **Entra no sitemap mesmo vazia?** O frontend não empurra páginas vazias ao sitemap; o gate é o backend `seo_cluster_plans` (que não tem threshold de contagem). `content.xml` é exceção (126 URLs incondicionais).
- **Risco de indexar página sem valor?** **Sim, vivo:** marca/modelo vazias.

---

## L. Riscos para `/comprar/[cidade]/[marca]/[modelo]` (e para a família atual)

| # | Risco | Severidade | Situação |
|---|---|---|---|
| 1 | **Terceira família duplicada** da mesma intenção (`/cidade/.../marca/.../modelo/...` já existe; catálogo filtrado também) | 🔴 | Criar `/comprar/...` seria doorway/duplicação |
| 2 | **Colisão de segmento dinâmico** `[cidade]` vs `[slug]` em `app/comprar/*` | 🔴 | Erro de build do Next.js |
| 3 | **Páginas vazias indexáveis** (marca/modelo sem estoque) | 🔴 | **Já acontece hoje** |
| 4 | **Contradição index,follow (backend) × noindex,follow (política sitemap) × canonical self** | 🔴 | **Já acontece hoje** |
| 5 | **Sem `brand_slug`/`model_slug` e sem catálogo** → divergência de texto, página vazia, slugs inconsistentes | 🟠 | `/fiat/argo` pode não achar anúncio |
| 6 | **Matching exato (stat) × substring (lista)** diverge | 🟠 | Cabeçalho ≠ lista |
| 7 | **Canonical→home em payload de erro** | 🟠 | Fallback 429 |
| 8 | **www/non-www** depende da env, sem enforcement | 🟠 | Verificar prod |
| 9 | **Filtros client-side** que o Google não lê (se a folha depender de JS para listar) | 🟡 | Territorial já faz SSR — ok se mantido |
| 10 | **Soft-404 do Next 14.2.35** se usar `notFound()` em server component sem gate de middleware | 🟡 | Mitigado nas rotas que usam gate; marca/modelo **não** têm gate |
| 11 | **Sitemap pode listar noindex** (filhos BFF confiam no backend) | 🟡 | `SITEMAP_PUBLIC_ENABLED` off mitiga por ora |
| 12 | **Conteúdo repetitivo** (template idêntico cidade×marca×modelo) → thin/doorway | 🟡 | Precisa de conteúdo diferenciado por combinação |

---

## M. Arquitetura recomendada

### M.0 Decisão de rota — NÃO criar `/comprar/[cidade]/[marca]/[modelo]`

**Consolidar na família existente `/cidade/[slug]/marca/[brand]/modelo/[model]`.** Justificativa: já existe, já tem fetch+metadata+JSON-LD prontos, já está no `robots.txt` allow (`/cidade/`), já tem sitemaps dedicados (`brands.xml`/`models.xml`) e já aparece (estruturalmente) no painel admin SEO. Criar `/comprar/...` adicionaria uma terceira URL para a mesma busca, com colisão de segmento e custo de canonical/301.

> Se houver razão de marketing forte para a URL `/comprar/...` (ex.: match de keyword exata), a alternativa segura é **301 de `/comprar/{cidade}/{marca}/{modelo}` → `/cidade/{cidade}/marca/{marca}/modelo/{modelo}`** num route group estático, nunca uma segunda página renderizável.

### M.1 Especificação da família consolidada

| Dimensão | Recomendação |
|---|---|
| **Rota** | Manter `/cidade/[slug]/marca/[brand]/modelo/[model]` (e `.../marca/[brand]`). |
| **Fonte de dados** | Manter `territorial-public.ts` → backend `/api/public/cities/:slug/brand/:brand/model/:model`. |
| **Validação de cidade** | Backend `WHERE cities.slug=$1` (já existe). Adicionar um **middleware gate `territory-brand-gate`** espelhando `territory-gate.ts` para emitir 404 real quando a cidade não existe (evita soft-404). |
| **Validação de marca/modelo** | **Trava de estoque:** indexar **somente se houver ≥ N anúncios ativos** da combinação. Backend deve retornar `seo.robots = "noindex,follow"` (ou `404` se a combinação nunca existiu) quando `activeCount < N`. Criar **um helper canônico único** `brandModelSlug()` (reusar `slugify()`), aplicado tanto na geração de link/sitemap quanto na resolução. |
| **Index/noindex/404** | • Cidade inexistente → **404 real** (gate). • Combinação com `activeCount ≥ N` → **index,follow**. • `activeCount` entre 1 e N-1 → **noindex,follow** (estado vazio honesto). • `activeCount = 0` / marca-modelo nunca vista → **404** (ou noindex,follow + canonical p/ `/cidade/{slug}/marca/{brand}`). • Filtros/sort/page>1 → noindex (já implementado). |
| **Canonical** | Self (`/cidade/{slug}/marca/{brand}/modelo/{model}`) quando indexável. Variações de filtro canonicalizam para a folha limpa. Corrigir o fallback de erro para **não** cair em `/`. |
| **Sitemap** | Incluir no `models.xml`/`brands.xml` **apenas combinações com `activeCount ≥ N`** (gerar do `ads` vivo ou de `seo_cluster_plans` com threshold). Ligar `SITEMAP_PUBLIC_ENABLED` conscientemente. |
| **JSON-LD** | Reusar `buildTerritorialJsonLd` (CollectionPage + ItemList). Enriquecer cada `ListItem` com `Car`/`Offer` (preço, ano) para rich results. |
| **Componentes** | `AdCard` + `TerritorialResultsPageClient` (já em uso). |
| **Cache/ISR** | Manter `revalidate: 60` do fetch. |
| **Fallback sem estoque** | noindex,follow + estado vazio + links internos para `/cidade/{slug}/marca/{brand}` e `/carros-em/{slug}` (não canonical→home). |
| **Links internos** | Da página de marca, linkar só modelos **com estoque**; da cidade, linkar marcas com estoque. Nunca gerar links para combinações vazias (evita descoberta de doorways). |
| **Monitoramento** | Registrar a família como `publication_type` no backend `seo_cluster_plans`; aparece automaticamente no painel admin SEO (overview/issues/sitemaps). Ativar a aba `ai-health` (hoje sem UI). |

### M.2 Correção de fundo (pré-requisito)

Antes de escalar conteúdo programático, resolver a **contradição tripla** (risco #4): definir **uma** fonte de verdade para index/noindex de marca/modelo. Recomendado: **o backend decide** (`seo.robots`) com base em `activeCount` e threshold, e o frontend continua só obedecendo `data.seo.robots`. Isso alinha endpoint público, política de sitemap e canonical de uma vez.

---

## N. Plano de implementação em fases

**Fase 0 — Verificação de produção (read-only, sem deploy).** Rodar os comandos da seção O. Confirmar: valor de `NEXT_PUBLIC_SITE_URL` (www?), `SITEMAP_PUBLIC_ENABLED`, quantas combinações cidade×marca×modelo têm estoque, e se URLs de `brands.xml`/`models.xml` batem com o formato da rota.

**Fase 1 — Fechar a porteira (correção de bug, sem novas rotas).**
1. Backend: trocar `robots: "index,follow"` hardcoded de brand/model por decisão baseada em `activeCount` + threshold `N` ([city-brand.service.js](src/read-models/cities/city-brand.service.js), [city-model.service.js](src/read-models/cities/city-model.service.js)).
2. Frontend: corrigir `buildEmptyTerritorialPayload` para emitir `seo.robots="noindex,follow"` e **não** canonicalizar para `/` ([territorial-public.ts](frontend/lib/search/territorial-public.ts)).
3. Unificar matching de marca/modelo (exato vs substring) — escolher um e aplicar nas duas camadas.

**Fase 2 — 404 real para combinações inexistentes.** Adicionar gate de middleware `territory-brand-gate` (espelho de `territory-gate.ts`) para `/cidade/[slug]/marca/[brand][/modelo/[model]]`, emitindo 404 quando a cidade não existe (e opcionalmente quando a combinação nunca teve anúncio).

**Fase 3 — Slug canônico de marca/modelo.** Criar helper único `brandModelSlug()` (sobre `slugify()`), espelhado backend/frontend com teste de sincronia (padrão já usado em `vehicle-options`). Padronizar geração de link interno, canonical e sitemap.

**Fase 4 — Sitemap com threshold.** Gerar `brands.xml`/`models.xml` só com combinações `activeCount ≥ N`. Decidir `SITEMAP_PUBLIC_ENABLED`. Adicionar `lastmod` real (de `MAX(ads.updated_at)`).

**Fase 5 — Conteúdo diferenciado + JSON-LD enriquecido.** Texto único por combinação (estatística local: preço médio, nº de ofertas, faixa de ano) para fugir de thin/doorway. `Car`/`Offer` no ItemList.

**Fase 6 — Monitoramento.** Registrar `publication_type` da família; ativar UI `ai-health`; adicionar a família ao smoke público (`scripts/smoke/public-contract-smoke.mjs`).

**Fase 7 — (opcional) Higiene geral.** Corrigir canonical das 8 páginas institucionais; subir `limit` do `blog.xml`; rever `content.xml` (126 URLs incondicionais); confirmar noindex de `/admin` e `/painel`.

---

## O. Comandos read-only para validar em produção (Render Shell)

> Adaptados aos nomes reais: `ads.brand`, `ads.model`, `ads.city_id`, `ads.city`, `ads.state`, `ads.status='active'`, join em `cities (id, slug)`. **Não há `ads.city_slug` nem `brand_slug`/`model_slug`.**

```sql
-- O.1 Slugs de cidade com anúncios ativos (top 50)
SELECT c.slug AS city_slug, c.name AS city, c.state, COUNT(*) AS ativos
FROM ads a JOIN cities c ON c.id = a.city_id
WHERE a.status = 'active'
GROUP BY c.slug, c.name, c.state
ORDER BY ativos DESC
LIMIT 50;
```

```sql
-- O.2 Combinações cidade + marca + modelo com anúncios ativos (com volume e frescor)
SELECT c.slug AS city_slug, a.brand, a.model,
       COUNT(*) AS ativos, MAX(a.updated_at) AS ultima_atualizacao
FROM ads a JOIN cities c ON c.id = a.city_id
WHERE a.status = 'active'
GROUP BY c.slug, a.brand, a.model
HAVING COUNT(*) >= 1
ORDER BY ativos DESC
LIMIT 100;
```

```sql
-- O.3 Existe Fiat Argo em Atibaia? (case-insensitive, como o snapshot do backend)
SELECT a.id, a.slug, a.brand, a.model, a.version, a.city, c.state, a.price, a.status, a.updated_at
FROM ads a JOIN cities c ON c.id = a.city_id
WHERE a.status = 'active'
  AND c.slug = 'atibaia-sp'
  AND LOWER(a.brand) = LOWER('Fiat')
  AND LOWER(a.model) = LOWER('Argo');
```

```sql
-- O.4 Variações de texto do mesmo modelo (detecta "HB20" vs "HB 20" vs "HB20S")
SELECT a.brand, a.model, COUNT(*) AS ocorrencias
FROM ads a
WHERE a.status = 'active' AND a.brand ILIKE '%hyundai%'
GROUP BY a.brand, a.model
ORDER BY a.brand, ocorrencias DESC;
```

```sql
-- O.5 Quantas combinações cruzariam um threshold de indexação N=3
SELECT COUNT(*) AS combinacoes_indexaveis FROM (
  SELECT c.slug, a.brand, a.model
  FROM ads a JOIN cities c ON c.id = a.city_id
  WHERE a.status = 'active'
  GROUP BY c.slug, a.brand, a.model
  HAVING COUNT(*) >= 3
) t;
```

```sql
-- O.6 Conferir se existem colunas de slug persistidas (esperado: nenhuma linha de brand_slug/model_slug)
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'ads' AND column_name IN ('brand','model','version','city','state','city_id','slug','status','updated_at')
ORDER BY column_name;
```

```sql
-- O.7 Status distintos em uso (entender vendido/arquivado/bloqueado)
SELECT status, COUNT(*) FROM ads GROUP BY status ORDER BY 2 DESC;
```

```sql
-- O.8 Higiene de slug de cidade duplicado entre estados (deve voltar vazio)
SELECT slug, COUNT(*) FROM cities GROUP BY slug HAVING COUNT(*) > 1;
```

```sql
-- O.9 O que o sitemap BFF realmente serviria (cluster plans elegíveis por tipo)
SELECT scp.cluster_type, COUNT(*) AS planos, MIN(scp.path) AS exemplo_path
FROM seo_cluster_plans scp
WHERE scp.status IN ('planned','published','generated')
GROUP BY scp.cluster_type
ORDER BY planos DESC;
```

**Checagens de borda (HTTP, read-only):**
```bash
# Canonical/robots reais servidos (confirma www e index/noindex)
curl -sSL https://www.carrosnacidade.com/cidade/atibaia-sp/marca/fiat/modelo/argo \
  | grep -iE '<link rel="canonical"|name="robots"'

# Sitemap index e um filho de marcas
curl -sSL https://www.carrosnacidade.com/sitemap.xml | head -40
curl -sSL https://www.carrosnacidade.com/sitemaps/models.xml | head -20

# Status real de uma combinação sem estoque (404 vs 200 soft)
curl -sS -o /dev/null -w "%{http_code}\n" https://www.carrosnacidade.com/cidade/atibaia-sp/marca/ferrari/modelo/enzo
```

---

## Apêndice — Critério de aprovação (respostas resumidas)

| Pergunta | Resposta |
|---|---|
| Quais páginas públicas são indexáveis hoje? | Seção B (tabela). Destaque: família `/cidade/.../marca/.../modelo/...` **já indexável**. |
| Como os sitemaps são gerados? | Sitemap index → 9 filhos (estáticos + BFF `seo_cluster_plans`) + regiao/* dinâmico. Seção C. |
| Como canonical é definido? | `getSiteUrl()`+`toAbsoluteUrl()`, sem enforcement www; família territorial usa `data.seo.canonicalPath` (backend) ou override p/ rota "vencedora". Seção E. |
| Como robots/noindex é aplicado? | Via `metadata.robots` do Next (sem X-Robots-Tag); `shouldIndexTerritorialPage` + flags regionais. Seção D. |
| Como cidade/região é validada? | Slug `nome-uf` (IBGE), validação estrutural no frontend + existência no backend; região via `region_memberships`. Seção G. |
| Como marca/modelo é armazenada? | `ads.brand`/`ads.model` TEXT livre, sem slug persistido, sem catálogo FIPE. Seção H. |
| Quais componentes de listagem reaproveitar? | `AdCard` (card único) + `fetchAdsSearch`/`territorial-public` + `TerritorialResultsPageClient`. Seção I. |
| Quais riscos existem? | Seção L (12 riscos; 4 críticos vivos). |
| Arquitetura mais segura p/ cidade+marca+modelo? | Consolidar na família `/cidade/...` existente + fechar porteira de indexação (trava de estoque, 404/noindex reais, canonical correto). Seções M/N. |

**Fim da auditoria. Nenhuma alteração de produção foi realizada.**
