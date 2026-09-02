# SEO Fase 4 — Auditoria de Integridade do Motor Territorial

**Data:** 2026-08-31
**Modo:** somente leitura. Nenhum arquivo de código alterado, nenhuma migration, nenhum
threshold tocado, nenhum push/PR/merge/deploy.

---

## 1. Resumo executivo

O motor territorial **em produção está correto**. O que está errado é o **painel que o
descreve** e um conjunto de **tabelas de planejamento congeladas desde maio** que ninguém
mais lê no caminho público.

Existem **dois pipelines SEO** no repositório, e a auditoria começa por separá-los porque
quase toda a confusão relatada nasce de confundi-los:

| | Pipeline A — ESTOQUE | Pipeline B — PLANEJAMENTO |
|---|---|---|
| Fonte | `ads` (status='active') | `seo_cluster_plans` + `seo_publications` |
| Serve | gate 404, robots/canonical, TODOS os sitemaps públicos | nada no caminho público do Google |
| Estado | **vivo, correto, automático** | **dormente desde 2026-05-27** |
| Quem lê | middleware, `generateMetadata`, `/sitemaps/*.xml` | **o painel `/admin/seo`** |

O painel mostra o Pipeline B. O Google vê o Pipeline A. Daí:

- **"Cidades com anúncios = 1"** está **certo** (só Atibaia tem estoque ativo).
- As "publicações indexáveis de Bragança" são **linhas mortas de maio**. As duas URLs
  respondem **404** em produção e **não estão em sitemap nenhum**.
- **"Sitemaps detectados 2/9"** é um **erro de categoria** na métrica — o teto estrutural
  dela é 5/9. Não indica defeito.
- **brands.xml e models.xml NÃO estão vazios**: servem **3** e **1** URL. O painel os
  declara vazios porque consulta a tabela errada.
- **53 de 53 URLs** declaradas nos sitemaps respondem **200 + `index, follow`**.

**Não há achado P0.** Há 6 achados P1, sendo que os 4 mais graves **não são do motor
territorial** — são links internos quebrados que a auditoria encontrou ao percorrer a
malha (fallback global para `sao-paulo-sp`, que tem zero estoque).

---

## 2. Base auditada

```
HEAD             ba9b135a4656a8a29f02255d1d149117d7a1bf50   (main, ff-only, up to date)
Working tree     limpo, exceto os 4 arquivos protegidos conhecidos:
                   ?? frontend/public/images/lojista-detalhe-veiculo-referencia.png
                   ?? frontend/public/images/lojista-oportunidades-veiculos-referencia.png
                   ?? frontend/public/images/vender-para-loja.png
                   ?? reports/fase-4-0-auditoria-venda-para-lojas-2026-08-15.md
```

### Produção FOI consultada

**Banco** — `DATABASE_URL1` → `dpg-d61cc7q4d50c739s8c70-a.oregon-postgres.render.com /
carros_na_cidade_db`, PostgreSQL 18.3. Sessão com `SET default_transaction_read_only = on`
e `statement_timeout = 30s`. **Somente SELECT.** Nenhuma escrita, nenhum DDL.

> Cuidado registrado: `DATABASE_URL` no `.env` local aponta para `localhost:5433 /
> carros_na_cidade_test`. Produção é `DATABASE_URL1`. Todas as consultas desta auditoria
> usaram explicitamente `DATABASE_URL1`.

**HTTP** — `https://www.carrosnacidade.com` (o apex 301 para www) e o backend
`https://carros-na-cidade-core.onrender.com`, com User-Agent de navegador (o backend tem
bot-blocker por UA que rejeita `curl`).

### Ressalva de honestidade

Não foi possível provar que o build implantado do frontend é **exatamente** `ba9b135a`
(o Next 14 App Router não expõe `buildId` no HTML). O comportamento medido é **consistente**
com o código em HEAD em todos os pontos verificados. Onde a conclusão depende disso, está
sinalizado.

---

## 3. Arquitetura real (nomes do repositório, não inferidos)

### 3.1 Pipeline A — ESTOQUE (vivo)

**Ramo 1 — sitemaps territoriais**

```
ads (status='active')
  └─ src/read-models/seo/territorial-inventory-sitemap.repository.js
       listActiveCityRows / listActiveCityBelowFipeRows /
       listActiveCityBrandRows / listActiveCityBrandModelRows      [HAVING COUNT(*) >= 1]
  └─ src/read-models/seo/territorial-inventory-sitemap.service.js
       buildCityEntries / buildBelowFipeCityEntries /
       buildBrandEntries / buildModelEntries                        [slug canônico → dedup → limiar]
  └─ src/read-models/seo/sitemap-public.service.js
       getPublicSitemapByType()   ← intercepta city_home, city_below_fipe,
                                     city_brand, city_brand_model
       getPublicSitemapByRegion() ← COMPÕE os 4 acima e filtra por UF
       getPublicVehicleSitemap()  ← src/read-models/seo/sitemap-ads.repository.js
  └─ src/modules/public/public-seo.controller.js
       GET /api/public/seo/sitemap/type/:type
       GET /api/public/seo/sitemap/region/:state
       GET /api/public/seo/sitemap/vehicles      [kill switch SITEMAP_PUBLIC_ENABLED]
  └─ frontend/lib/seo/sitemap-client.ts
       fetchPublicSitemapByTypes / ByRegion / Vehicle / Blog
       4 camadas: fresh → memória do processo → snapshot Redis → 503
  └─ frontend/app/sitemaps/*.xml/route.ts   +  frontend/app/sitemaps/_lib/sitemap-response.ts
  └─ frontend/app/sitemap.xml/route.ts       (índice; FIXED_SITEMAPS + regionais detectadas)
```

**Ramo 2 — gate de existência (404 real)**

```
ads → territorial-inventory-sitemap.repository.js#listActiveCityRows
  └─ src/read-models/cities/public-city-set.service.js#getPublicCitySet
  └─ GET /api/public/cities/public-set        { cities: {slug: total}, ufs, existsMinAds, indexMinAds }
  └─ frontend/lib/middleware/city-existence-gate.ts   (Edge, fail-safe + snapshot)
  └─ frontend/middleware.ts                            → 404 real | 503 | segue
```

**Ramo 3 — indexabilidade (robots + canonical)**

```
backend territorial-public
  └─ frontend/lib/seo/local-seo-data.ts#loadLocalSeoLanding
  └─ frontend/lib/seo/local-seo-metadata.ts
       shouldIndexLocalSeo()  →  totalAds >= getSitemapMinAds()
       transitionCanonicalPath() → canonical
       + frontend/lib/seo/query-policy.ts (parâmetros de filtro/ordenação)
```

**Limiares** — `src/read-models/cities/city-thresholds.js` (backend) e o espelho
`frontend/lib/seo/sitemap-min-ads.ts` (frontend):

| | função | env | default | mede |
|---|---|---|---|---|
| EXISTIR | `getCityExistsMinAds()` | `CITY_EXISTS_MIN_ADS` | **1** | 200 vs 404 |
| INDEXAR | `getCityIndexMinAds()` | `CITY_INDEX_MIN_ADS` → fallback `SITEMAP_MIN_ADS` | **3** | index vs noindex **e** presença no sitemap |
| marca | `getSeoThreshold(BRAND)` | derivado | base = 3 | |
| modelo | `getSeoThreshold(MODEL)` | derivado | base = 3 | |
| transversal | bodyType/transmission/priceRange | derivado | base+1 = 4 | |

**Confirmado em produção**, lendo o próprio backend:

```
GET /api/public/cities/public-set
{"success":true,"data":{"cities":{"atibaia-sp":27},"ufs":{"sp":27},
 "total":1,"indexable":1,"existsMinAds":1,"indexMinAds":3}}
```

### 3.2 Pipeline B — PLANEJAMENTO (dormente)

```
city_scores  (VAZIA — 0 linhas em produção)
  └─ src/modules/seo/planner/cluster-planner.repository.js
       listTopCitiesForClusterPlanning()  → SQL_PRIMARY vazio → SQL_FALLBACK_ADS
  └─ cluster-planner.service.js  +  cluster-planner.tasks.js#buildStageClusters
  └─ src/modules/seo/planner/cluster-plan.repository.js#upsertClusterPlan → seo_cluster_plans
  └─ src/modules/seo/publishing/content-publisher.*                       → seo_publications
  └─ src/brain/engines/cluster-planner.engine.js
  └─ src/workers/seo/cluster-planner.worker.js   (setInterval 6h)
```

**Quem lê o Pipeline B hoje:**

1. `frontend/app/admin/seo/page.tsx` ← `src/modules/admin/seo/admin-seo.{service,repository}.js`
2. `src/modules/public/public-seo.service.js#listEntries`, exposto em
   `/api/public/seo/sitemap.json` e `/api/public/seo/sitemap.xml` — **ver achado P1-1**.

Nada mais. Os 4 tipos territoriais são interceptados antes por
`sitemap-public.service.js` e servidos pelo Pipeline A.

---

## 4. Fonte da verdade do estoque

**Consulta canônica** (`territorial-inventory-sitemap.repository.js#listActiveCityRows`,
espelhada aqui com os campos pedidos):

```sql
SELECT c.id AS city_id, c.name AS city_name, c.state AS uf, c.slug,
       COUNT(*)::int AS active_public_ads,
       COUNT(*) FILTER (WHERE a.below_fipe IS TRUE)::int AS below_fipe_ads,
       MAX(a.updated_at) AS last_ad_update
  FROM ads a JOIN cities c ON c.id = a.city_id
 WHERE a.status = 'active'
 GROUP BY c.id, c.name, c.state, c.slug
 ORDER BY active_public_ads DESC;
```

**Resultado em produção (2026-09-01 02:31 UTC):**

| city_id | city_name | UF | slug | active_public_ads | below_fipe_ads |
|---|---|---|---|---|---|
| 4761 | Atibaia | SP | `atibaia-sp` | **27** | **8** |

**Uma linha. Só isso.**

Distribuição total de `ads`: `active` **27**, `deleted` **20**, `paused` **1**.
Anúncios ativos sem `city_id`: **0**.

### O que "público" significa, exatamente

O único predicado é `a.status = 'active'`. Não há join com `advertisers`, nem coluna
`deleted_at`, nem `expires_at`, nem `pending_review` nessa decisão — `deleted`, `paused`
e qualquer outro estado são valores do próprio `status` e ficam de fora por não serem
`'active'`. A elegibilidade do anunciante **não** entra aqui.

Isto é coerente com o resto da superfície pública: toda a camada de query filtra
`status='active'`.

---

## 5. Atibaia

| Pergunta | Resposta | Prova |
|---|---|---|
| Estoque ativo | 27 | consulta §4 |
| Abaixo da FIPE | 8 | consulta §4 |
| ≥ limiar de existência (1)? | sim | `public-set` → `atibaia-sp: 27` |
| ≥ limiar de indexação (3)? | sim | 27 ≥ 3 |
| `/carros-em/atibaia-sp` | **200 · `index, follow` · canonical self** | HTTP ao vivo |
| `/carros-baratos-em/atibaia-sp` | **200 · `index, follow` · canonical self** | HTTP ao vivo |
| Em `cities.xml` | sim (única URL) | HTTP ao vivo |
| Em `below-fipe.xml` | sim (única URL) | HTTP ao vivo |
| Marcas ≥ 3 | Fiat 7, Chevrolet 6, VW 4 | consulta agregada |
| Em `brands.xml` | 3 URLs, exatamente essas | HTTP ao vivo |
| Modelo comercial ≥ 3 | Onix 6 (2+2+1+1 descrições FIPE) | consulta agregada |
| Em `models.xml` | 1 URL: `/cidade/atibaia-sp/marca/chevrolet/modelo/onix` | HTTP ao vivo |

**Atibaia é coerente ponta a ponta.** Nenhuma divergência.

Nota: `models.xml` deixou de estar vazio. O comentário em
`frontend/app/sitemap.xml/route.ts` ("medido em 2026-08-07: o modelo mais frequente tem 2
anúncios e o limiar é 3") **está desatualizado** — com a taxonomia de modelo comercial
(`src/shared/vehicle/commercial-model.js`), as 4 descrições FIPE do Onix agregam em
`onix` e somam 6. Ver P2-8.

---

## 6. Bragança Paulista — o caso, resolvido

### 6.1 Quantos anúncios públicos ativos existem?

**Zero.**

```sql
SELECT a.status, COUNT(*)::int FROM ads a JOIN cities c ON c.id=a.city_id
 WHERE c.slug ILIKE '%braganca%' GROUP BY a.status;
--  deleted | 3
```

Três anúncios, **todos `deleted`**. Nenhum `active`.

### 6.2 Qual `city_id` a publicação usa?

`4800` = `Bragança Paulista / SP / braganca-paulista-sp`. **É a cidade certa.** Não há
confusão de cidade: existem `braganca-pa` (id 2444) e `braganey-pr` (id 2833) no catálogo,
mas nenhuma publicação aponta para elas.

### 6.3 A rota consulta Bragança ou uma cidade de fallback?

Consulta Bragança e **é barrada antes de chegar à página**. Medido:

```
GET https://www.carrosnacidade.com/carros-em/braganca-paulista-sp          → 404
GET https://www.carrosnacidade.com/carros-baratos-em/braganca-paulista-sp  → 404
GET https://www.carrosnacidade.com/comprar/cidade/braganca-paulista-sp     → 404
```

O gate é `frontend/lib/middleware/city-existence-gate.ts`, executado no Edge por
`frontend/middleware.ts:343-357`. Ele lê o conjunto inteiro de cidades públicas
(`/api/public/cities/public-set`), que hoje contém **só `atibaia-sp`**, e
`decideCityExistenceAction` devolve `block-not-found`.

### 6.4 Existe fallback para Atibaia?

**Não.** Verificado por conteúdo: nenhuma ocorrência de `atibaia` em caminho de runtime
do frontend ou do backend — só em testes, e2e, scripts de smoke e comentários. As rotas
territoriais não têm fallback de cidade.

**Existe, porém, um fallback global para `sao-paulo-sp`** — e São Paulo também tem zero
estoque. Não afeta Bragança nem as rotas territoriais, mas quebra links internos em toda
a malha. Ver **P1-2**.

### 6.5 Existe região sendo confundida com cidade?

Não neste caso. `/carros-usados/regiao/[slug]` recebe slug de **cidade-âncora** e está em
`CITY_PREFIX_PATTERNS` (gate de cidade). `/carros-usados/regiao/braganca-paulista-sp`
segue a mesma regra e é barrado.

### 6.6 Existe publicação antiga não removida? Cluster stale? Snapshot antigo?

**Sim — é exatamente isto, e é a resposta da pergunta 1 do briefing.**

`seo_publications` (4 linhas no total):

| id | path | type | status | is_indexable | city | content_length | published_at | updated_at (cru) |
|---|---|---|---|---|---|---|---|---|
| 1 | `/carros-em/atibaia-sp` | city_home | published | **true** | Atibaia | 539 | 2026-05-27 | `2026-05-28 23:58:34` |
| 2 | `/carros-em/braganca-paulista-sp` | city_home | published | **true** | **Bragança** | 559 | 2026-05-27 | `2026-05-28 23:58:34` |
| 3 | `/carros-baratos-em/atibaia-sp` | city_below_fipe | published | **true** | Atibaia | 675 | 2026-05-27 | `2026-05-31 01:51:49` |
| 4 | `/carros-baratos-em/braganca-paulista-sp` | city_below_fipe | published | **true** | **Bragança** | 685 | 2026-05-27 | `2026-05-28 23:58:34` |

`seo_cluster_plans` (4 linhas, todas `status='published'`, `stage='seed'`,
`created_at = 2026-05-04`, `last_generated_at = updated_at = 2026-05-27 01:40:58`),
com os mesmos 4 paths.

Todas as 4 têm `content_provider = 'bootstrap-factual-v1'` — foram escritas pelo
bootstrap (`scripts/seo/bootstrap-publications.mjs` / `bootstrap-cluster-plans.mjs`),
quando Bragança ainda tinha anúncios ativos. Desde então os 3 anúncios de Bragança
viraram `deleted` e **nada apagou as publicações**, porque o pipeline que as escreve
está desligado (§9).

### 6.7 Existe anúncio expirado/deletado que ainda conta?

Não. Nenhuma consulta do Pipeline A conta `deleted`. Bragança sai de
`listActiveCityRows` por `WHERE a.status='active'`.

### 6.8 Existe problema de cache?

Não neste caso. As duas URLs de Bragança respondem 404 **agora**, e não constam de
nenhum sitemap servido ao Google. O cache do Pipeline A tem janela de ~60s no gate
(§17). O que existe é o **congelamento das tabelas de plano**, que não é cache — é
ausência de execução.

### 6.9 Veredito

> As publicações de Bragança são **artefatos mortos de 2026-05-27**. Não têm efeito
> nenhum no que o Google vê: as URLs são **404** e estão **fora de todos os sitemaps
> públicos**. A única superfície que ainda as expõe é o endpoint legado
> `/api/public/seo/sitemap.{json,xml}` do backend — contido por `robots.txt: Disallow: /`
> e `X-Robots-Tag: noindex` naquele host. Ver **P1-1**.

---

## 7. Publicações × estoque real

### 7.1 Tabela de divergência

| URL | tipo | published | is_indexable (DB) | estoque ativo | HTTP real | robots real | em sitemap? | deveria existir? | divergência |
|---|---|---|---|---|---|---|---|---|---|
| `/carros-em/atibaia-sp` | city_home | sim | true | 27 | **200** | index,follow | `cities.xml`, `regiao/sp.xml` | **sim** | — |
| `/carros-baratos-em/atibaia-sp` | city_below_fipe | sim | true | 8 (below-FIPE) | **200** | index,follow | `below-fipe.xml`, `regiao/sp.xml` | **sim** | — |
| `/carros-em/braganca-paulista-sp` | city_home | sim | true | **0** | **404** | — | **não** | **não** | **linha órfã (P1-1)** |
| `/carros-baratos-em/braganca-paulista-sp` | city_below_fipe | sim | true | **0** | **404** | — | **não** | **não** | **linha órfã (P1-1)** |

Não existem publicações de tipo `brand`, `model`, `region` ou `opportunity`: a tabela tem
exatamente 4 linhas, todas `city_home` ou `city_below_fipe`.

### 7.2 Páginas derivadas — `/carros-baratos-em/[cidade]` (§7 do briefing)

**A regra de elegibilidade é diferente da `city_home` no DADO, e idêntica no LIMIAR.**

| | dataset | limiar | onde |
|---|---|---|---|
| `city_home` | `COUNT(*) WHERE status='active'` | `getSitemapMinAds()` = **3** | `listActiveCityRows` + `buildCityEntries` |
| `city_below_fipe` | `COUNT(*) WHERE status='active' AND below_fipe = true` | `getSitemapMinAds()` = **3** | `listActiveCityBelowFipeRows` + `buildBelowFipeCityEntries` |

"Barato" = a coluna `ads.below_fipe = true` do backend. **Não** é um cálculo de preço na
hora nem uma faixa arbitrária.

Na indexação, `frontend/lib/seo/local-seo-metadata.ts#shouldIndexLocalSeo` compara
`model.totalAds >= getSitemapMinAds()`, e para a variante `baratos` `totalAds` **é** a
contagem do recorte abaixo-da-FIPE (`local-seo-data.ts`, ramo `variant === "baratos"`).
Ou seja: sitemap e robots usam a mesma contagem. **Coerente.**

**Duplicação quase total?** Não hoje: 8 de 27 (30%). Os datasets são genuinamente
diferentes. Além disso `/carros-baratos-em/` tem canonical própria (self) e BreadcrumbList
próprio (`buildBaratosBreadcrumbJsonLd`), enquanto `/cidade/[slug]/abaixo-da-fipe`
canonicaliza **para ela** — medido: 200 `noindex, follow` → canonical
`/carros-baratos-em/atibaia-sp`. A hierarquia está limpa.

| cidade | total ads | below_fipe eligible | limiar | publication state |
|---|---|---|---|---|
| Atibaia-SP | 27 | **8** | 3 | 200 · index · em `below-fipe.xml` |
| Bragança Paulista-SP | 0 | 0 | 3 | **404** · fora do sitemap · linha morta no DB |

---

## 8. Cluster plans

`sitemapCounts()` real em produção (query idêntica à de `admin-seo.repository.js`):

| cluster_type | total | eligible (`planned`/`published`/`generated`) | last_update |
|---|---|---|---|
| `city_below_fipe` | 2 | 2 | `2026-05-27 01:40:58` |
| `city_home` | 2 | 2 | `2026-05-27 01:40:58` |

**Duas linhas.** Zero de `city_brand`, `city_brand_model`, `city_opportunities`.

Isto é o numerador do "2 / 9" (§12) e a causa dos 3 buckets marcados "vazios" (§13).

`city_scores`: **0 linhas** — a fonte primária do planner nunca foi alimentada. Se o
planner rodasse hoje, cairia sempre em `SQL_FALLBACK_ADS` com `stage='seed'`
(→ brandLimit 5, modelLimit 3).

---

## 9. Jobs / scheduler — **o motor NÃO roda automaticamente**

### 9.1 O que existe

Não há BullMQ, não há cron, não há Redis nesse caminho. Os workers SEO são
**`setInterval` dentro do processo do backend**, registrados em
`src/workers/bootstrap/bootstrap.registry.js` e ligados por
`src/workers/bootstrap/bootstrap.service.js#startWorkersBootstrap`, chamado por
`src/index.js:143` (`runStartupWorkers`).

### 9.2 A cadeia de flags

```
src/index.js:18     RUN_WORKERS = env.RUN_WORKERS === "true"      default "false"
src/index.js:143    if (!RUN_WORKERS) return;                     ← porta 1
bootstrap.service   isEnabled("RUN_WORKERS", "false")             ← porta 2
bootstrap.registry  cada worker tem env própria + defaultValue    ← porta 3
```

Defaults de **todos** os workers SEO em `bootstrap.registry.js`:

| worker | env | default |
|---|---|---|
| SEO Worker | `RUN_WORKER_SEO` | **false** |
| Money Pages | `RUN_WORKER_MONEY_PAGES` | **false** |
| Cluster Executor | `RUN_WORKER_CLUSTER_EXECUTOR` | **false** |
| SEO Publishing | `RUN_WORKER_SEO_PUBLISHING` | **false** |
| Sitemap | `RUN_WORKER_SITEMAP` | **false** |
| SEO Queue | `RUN_WORKER_SEO_QUEUE` | **false** |
| Refresh Planner | `RUN_WORKER_REFRESH_PLANNER` | **false** |
| Internal Linking | `RUN_WORKER_INTERNAL_LINKING` | **false** |
| **Cluster Planner** | `RUN_WORKER_CLUSTER_PLANNER` | **false** |

Intervalo do cluster planner, se ligado: `CLUSTER_PLANNER_WORKER_INTERVAL_MS`, default 6h.

### 9.3 Prova indireta de que estão desligados

`render.yaml` versiona **um único serviço** (`carros-na-cidade-portal`, o frontend). O
serviço de **backend não está no `render.yaml`** — toda a env dele mora só no dashboard
do Render, invisível ao repositório.

Portanto não é possível ler as flags de produção do código. Mas a evidência de
comportamento é conclusiva:

- `seo_cluster_plans.updated_at` e `last_generated_at` de **todas** as 4 linhas:
  `2026-05-27 01:40:58` — **96 dias** sem escrita.
- Se o Cluster Planner estivesse rodando a cada 6h, `upsertClusterPlan` faria
  `ON CONFLICT (path) DO UPDATE SET … updated_at = NOW()` — os timestamps seriam de hoje.
- Além disso, com Atibaia em `stage='seed'` (brandLimit 5, modelLimit 3), o planner teria
  criado clusters `city_brand` e `city_brand_model` — que **não existem**.
- `seo_publication_audits`: **0 linhas**, nunca.

**Resposta: NÃO.** O motor de planejamento/publicação não roda. A parte que roda
sozinha — o Pipeline A — não precisa de job nenhum: é consulta ao vivo sobre `ads`.

---

## 10. As datas de maio — explicadas com prova

### 10.1 O que os valores são

`updated_at` **reais** de linhas reais (colunas `timestamp without time zone`, lidas como
texto cru, sem conversão):

| origem | valor armazenado (cru) | linhas |
|---|---|---|
| `seo_cluster_plans.updated_at` / `last_generated_at` | `2026-05-27 01:40:58` | 4 |
| `seo_publications.updated_at` | `2026-05-28 23:58:34` | 3 |
| `seo_publications.updated_at` | `2026-05-31 01:51:49` | 1 |

### 10.2 Por que o painel mostra 26/05, 28/05 e 30/05

As colunas são `timestamp without time zone`. O backend (Render, TZ=UTC) as serializa
como se fossem UTC (`2026-05-27T01:40:58Z`), e o navegador em `America/Sao_Paulo` (UTC−3)
renderiza **três horas antes**:

| armazenado | serializado | exibido no painel |
|---|---|---|
| `2026-05-27 01:40:58` | `2026-05-27T01:40:58Z` | **26/05/2026** 22:40 |
| `2026-05-28 23:58:34` | `2026-05-28T23:58:34Z` | **28/05/2026** 20:58 |
| `2026-05-31 01:51:49` | `2026-05-31T01:51:49Z` | **30/05/2026** 22:51 |

Os três valores do briefing batem exatamente. **Não é cache do admin, não é seed, não é
fixture, não é resposta stale.**

### 10.3 Conclusão

São mudanças reais, e a última foi há 96 dias. A UI não está mentindo sobre a data —
está mostrando um dado que **de fato** não muda desde maio, porque o job que o escreveria
está desligado (§9). A única imprecisão é o deslocamento de −3h (P2-6).

---

## 11. Sitemap index

**Rota real:** `/sitemap.xml` → `frontend/app/sitemap.xml/route.ts`
(`runtime = "nodejs"`, `dynamic = "force-dynamic"`, `Cache-Control: public, max-age=300, s-maxage=300`).
Sem `lastmod` nos filhos, por decisão documentada no próprio arquivo.

**Medido ao vivo — 9 filhos declarados:**

| # | Sitemap | Admin conhece | Index declara | Existe | HTTP | content-type | `<url>` |
|---|---|---|---|---|---|---|---|
| 1 | `core.xml` | sim | **sim** | sim | 200 | application/xml | **5** |
| 2 | `content.xml` | sim | **sim** | sim | 200 | application/xml | **2** |
| 3 | `cities.xml` | sim | **sim** | sim | 200 | application/xml | **1** |
| 4 | `brands.xml` | sim | **sim** | sim | 200 | application/xml | **3** |
| 5 | `models.xml` | sim | **sim** | sim | 200 | application/xml | **1** |
| 6 | `below-fipe.xml` | sim | **sim** | sim | 200 | application/xml | **1** |
| 7 | `blog.xml` | **não** | **sim** | sim | 200 | application/xml | **13** |
| 8 | `vehicles.xml` | **não** | **sim** | sim | 200 | application/xml | **27** |
| 9 | `regiao/sp.xml` | sim (agrupado) | **sim** | sim | 200 | application/xml | **6** |
| — | `opportunities.xml` | sim | **não** (por design) | sim | 200 | application/xml | 0 |
| — | `local-seo.xml` | sim | **não** (por design) | sim | 200 | application/xml | 0 |
| — | `regiao/rj.xml` (e demais UF sem estoque) | — | não | sim | 200 | application/xml | 0 |

Total de `<sitemap>` no índice: **9**. XML válido em todos.

**Duas assimetrias com o painel** (nenhuma é defeito funcional):

- `blog.xml` e `vehicles.xml` são servidos e declarados, mas **não existem** na lista
  `SITEMAP_INDEX` de `admin-seo.service.js`. O painel não os conhece.
- `opportunities.xml` e `local-seo.xml` **existem no painel** e são deliberadamente
  **excluídos** do índice.

Ou seja, os "9" do painel e os "9" do índice **são conjuntos diferentes** que por
coincidência têm o mesmo tamanho.

---

## 12. robots.txt

```
User-Agent: *
Allow: /
Disallow: /api/
Disallow: /dashboard
Disallow: /dashboard-loja
Disallow: /login
Disallow: /pagamento
Disallow: /impulsionar

Sitemap: https://www.carrosnacidade.com/sitemap.xml
```

- Serve em `https://www.carrosnacidade.com/robots.txt` → **200 `text/plain`**.
- Declara **o índice**, não os filhos. Correto — é o padrão recomendado.
- Domínio: **www**, https, batendo com o host canônico (o apex 301 para www; verificado).
- Sem `Host:` (removido na limpeza de 2026-07-26), sem `Allow` redundantes.
- `/simulador-financiamento` continua **não bloqueado** de propósito (fase 1 de
  desindexação — o `noindex` precisa ser rastreado para limpar o índice).

**Nenhum problema.** O backend (`carros-na-cidade-core.onrender.com`) serve um robots.txt
próprio com `User-agent: * / Disallow: /` — o que é a contenção do achado P1-1.

---

## 13. "Sitemaps detectados 2 / 9" — a função, rastreada

**Código exato** — `src/modules/admin/seo/admin-seo.service.js`:

```js
export async function getOverview() {
  const sitemaps = await repo.sitemapCounts();          // linha 38
  const detectedSitemapBuckets = sitemaps.length;       // linha 40   ← NUMERADOR
  ...
  sitemaps: {
    total_buckets:    SITEMAP_INDEX.length,             // linha 66   ← DENOMINADOR = 9
    detected_buckets: detectedSitemapBuckets,
```

E `repo.sitemapCounts()` (`admin-seo.repository.js`) é:

```sql
SELECT cluster_type, COUNT(*), COUNT(*) FILTER (...) AS eligible, MAX(updated_at)
  FROM seo_cluster_plans GROUP BY cluster_type ORDER BY cluster_type
```

### O que "detectado" significa

**Nenhuma das hipóteses do briefing.** Não é "o sitemap existe", nem "está no index", nem
"está no robots", nem "tem URLs". É:

> **o número de valores DISTINTOS de `cluster_type` presentes na tabela
> `seo_cluster_plans`.**

### Por que é 2

Porque a tabela tem exatamente dois: `city_home` e `city_below_fipe` (§8). Medido.

### Por que 9/9 é impossível

O denominador conta **arquivos de sitemap**. Dos 9 itens de `SITEMAP_INDEX`:

- 3 são `fixed_paths: true` → `cluster_type: null` (core, content, local_seo)
- 1 é `dynamic: true` → `cluster_type: null` (regiao)
- **5** têm `cluster_type` (cities, brands, models, below_fipe, opportunities)

Logo o numerador **não pode passar de 5**, e só chegaria a 5 se o Pipeline B — que está
desligado — voltasse a escrever as 5 famílias. **O teto real da métrica é 5/9.**

É um **erro de categoria**: numerador em "grupos de cluster_type no banco", denominador em
"arquivos de sitemap no disco". As duas grandezas não são comparáveis. → **P2-1**.

---

## 14. Buckets vazios — classificação

O painel usa `SITEMAP_BUCKET_TO_CLUSTER_TYPE` (5 entradas) e marca vazio quando não há
cluster elegível daquele tipo. Isso produz hoje 3 avisos: **brands, models, opportunities**.

**Mas o painel está medindo a tabela errada para 4 dos 5 buckets.** Desde a correção de
2026-07-04/05, `sitemap-public.service.js#getPublicSitemapByType` intercepta `city_home`,
`city_below_fipe`, `city_brand` e `city_brand_model` e os serve do **estoque ativo** —
`seo_cluster_plans` não participa.

### Confronto: o que o painel diz × o que o sitemap serve

| bucket | eligible clusters (painel) | severidade do painel | URLs REAIS servidas | classificação correta |
|---|---|---|---|---|
| `cities` | 2 | — | **1** | ok |
| `below_fipe` | 2 | — | **1** | ok |
| `brands` | **0** | **ALTO** | **3** | **(B) vazio incorreto — o bucket NÃO está vazio** |
| `models` | **0** | **ALTO** | **1** | **(B) vazio incorreto — o bucket NÃO está vazio** |
| `opportunities` | **0** | **ALTO** | **0** | **(A) vazio legítimo** |
| `local_seo` (sem cluster_type) | n/a | — | **0** | **(A) vazio legítimo** |

**Prova de (A) para `opportunities`:** `/cidade/atibaia-sp/oportunidades` responde
**200 `noindex, follow`** com canonical `https://www.carrosnacidade.com/carros-baratos-em/atibaia-sp`.
Publicar essa URL seria publicar uma duplicata que aponta para outra. `local-seo.xml`
segue a mesma lógica (`buildLocalSeoTransitionEntries()` retorna `[]` por design).

**Prova de (B) para `brands`/`models`:** medido ao vivo —

```
/sitemaps/brands.xml → 200, 3 <url>:
   /cidade/atibaia-sp/marca/fiat        (7 anúncios)
   /cidade/atibaia-sp/marca/chevrolet   (6)
   /cidade/atibaia-sp/marca/volkswagen  (4)
/sitemaps/models.xml → 200, 1 <url>:
   /cidade/atibaia-sp/marca/chevrolet/modelo/onix   (6)
```

E as 4 URLs respondem **200 `index, follow` com canonical self**.

Nenhum bucket é "(C) impossível determinar".

### Severidade (§16 do briefing)

`admin-seo.repository.js#listIssues`, bloco 3:

```js
for (const [bucket, clusterType] of Object.entries(SITEMAP_BUCKET_TO_CLUSTER_TYPE)) {
  const eligible = countsByType[clusterType] || 0;
  if (!eligible) {
    issues.push({ severity: "high", kind: "empty_sitemap_bucket", ... });
  }
}
```

`severity: "high"` é **literal e incondicional**. Não há ramo que considere se
`eligible_clusters === 0` é o estado esperado. Confirmado: `urls = 0 → ALTO`, sempre.
→ **P2-2**.

### §17 — o índice inclui bucket vazio?

**Não.** Os únicos vazios (`opportunities`, `local-seo`) já estão fora do índice
deliberadamente, e todos os 9 filhos declarados hoje têm ≥ 1 URL. **Nada a corrigir aqui.**

---

## 15. Sitemap × indexabilidade

### 15.1 INDEXÁVEL MAS AUSENTE DO SITEMAP

Interpretando "indexável" como a marca no banco (`seo_publications.is_indexable = true`):

| URL | ausente do sitemap? | é problema? |
|---|---|---|
| `/carros-em/braganca-paulista-sp` | sim | **não** — a URL é 404. A ausência está certa; **a linha do banco é que está errada** |
| `/carros-baratos-em/braganca-paulista-sp` | sim | idem |

Interpretando "indexável" como o comportamento em runtime (`meta robots = index`):
**nenhuma URL indexável ficou de fora**. As páginas `noindex` de transição
(`/carros-automaticos-em/[slug]`, `/cidade/[slug]`, `/cidade/[slug]/abaixo-da-fipe`,
`/cidade/[slug]/oportunidades`) estão fora por design, canonicalizando para as canônicas
que **estão** no sitemap.

### 15.2 NOINDEX MAS PRESENTE NO SITEMAP

**Nenhuma.** Varredura completa de **53 URLs únicas** (core 5, content 2, cities 1,
brands 3, models 1, below-fipe 1, blog 13, vehicles 27, regiao/sp 6 — com sobreposição):

```
53 / 53  →  HTTP 200
53 / 53  →  meta robots "index, follow"
52 / 53  →  canonical == self
```

### 15.3 A única exceção

| URL | status | robots | canonical | sitemap |
|---|---|---|---|---|
| `https://www.carrosnacidade.com/tabela-fipe` | 200 | index, follow | **`https://www.carrosnacidade.com`** (a home) | `core.xml` |

→ **P1-3**.

---

## 16. Canonicals territoriais

| URL | canonical | veredito |
|---|---|---|
| `/carros-em/atibaia-sp` | self | **OK** |
| `/carros-baratos-em/atibaia-sp` | self | **OK** |
| `/cidade/atibaia-sp/marca/{fiat,chevrolet,volkswagen}` | self | **OK** |
| `/cidade/atibaia-sp/marca/chevrolet/modelo/onix` | self | **OK** |
| `/cidade/atibaia-sp` | `/carros-em/atibaia-sp` | OK (transição documentada) |
| `/cidade/atibaia-sp/abaixo-da-fipe` | `/carros-baratos-em/atibaia-sp` | OK (transição documentada) |
| `/cidade/atibaia-sp/oportunidades` | `/carros-baratos-em/atibaia-sp` | OK (transição documentada) |
| `/carros-em/braganca-paulista-sp` | — (404) | OK — **não canonicaliza para Atibaia** |
| `/carros-baratos-em/braganca-paulista-sp` | — (404) | OK — idem |

**Zero canonical cruzando cidade.** Bragança não aponta para Atibaia, nem o contrário.
A política vive em `frontend/lib/seo/local-seo-metadata.ts#transitionCanonicalPath` e é
puramente função do próprio slug — não há caminho de código onde uma cidade sem estoque
canonicalize para outra cidade.

A única canonical cruzada encontrada em todo o conjunto é `/tabela-fipe` → home, que é
**não-territorial** (P1-3).

---

## 17. Cache — timeline real do estoque até o índice

| camada | política | onde |
|---|---|---|
| gate de existência (404) | `next: { revalidate: 60, tags:["public-city-set"] }` | `city-existence-gate.ts#fetchPublicCitySet` |
| snapshot do gate | memória do processo, TTL `getSnapshotMaxAgeMs()` | `gate-snapshot.ts` |
| página de cidade | `dynamic = "force-dynamic"` + `fetchAdsSearch` `revalidate: 60` | `carros-em/[slug]/page.tsx` |
| backend sitemap | `public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800` | `public-seo.controller.js` |
| data cache do Next | `next: { revalidate: 3600, tags:[PUBLIC_ADS_CACHE_TAG] }` | `sitemap-client.ts` |
| rota do sitemap | `s-maxage=3600` (ok) / `s-maxage=300` (vazio ou degradado) | `_lib/sitemap-response.ts` |
| snapshot do sitemap | Redis, best-effort | `sitemap-snapshot.ts` |
| índice `/sitemap.xml` | `max-age=300, s-maxage=300` | `sitemap.xml/route.ts` |
| invalidação por tag | `revalidateTag("public-ads")` | `frontend/app/api/revalidate/route.ts` |

**Quando um anúncio muda de estado:**

| superfície | latência típica | pior caso |
|---|---|---|
| 404/200 da cidade (gate) | **≤ 60 s** | 60 s + idade do snapshot |
| catálogo e contagens da página | **≤ 60 s** | 60 s |
| `meta robots` / canonical | **≤ 60 s** | 60 s |
| `/sitemaps/*.xml` | **~1 h** | **~24 h** se um edge cache segurar a resposta do backend (`s-maxage=86400`), e até 7 d de `stale-while-revalidate` para intermediários |
| `/sitemap.xml` (índice) | ≤ 5 min | 5 min |

**Observação importante:** `revalidateTag("public-ads")` limpa o *data cache do Next*, mas
**não** invalida o `s-maxage=86400` da resposta do backend. Um sitemap pode, portanto,
ficar até ~1 dia atrás do estoque mesmo com a revalidação disparada. Não é um defeito
ativo hoje (o estoque é estável), mas é a assimetria a considerar na Fase 4.1.

### §25 — congelamento em build-time

**Já foi identificado e corrigido no ponto crítico.** `frontend/lib/middleware/gate-runtime-env.ts`
lê env por acesso **dinâmico** (`process.env[nome]`) exatamente porque o Next inlina
`process.env.NOME` no bundle do middleware Edge em tempo de build — o incidente de
2026-08-06, em que a presença de `INTERNAL_API_TOKEN` no ambiente de **build** decidia se
`/carros-em/<cidade-sem-anúncio>` respondia 404 ou 200.

Os limiares (`getCityIndexMinAds`) são lidos em Server Components / route handlers Node,
onde `process.env` é resolvido em runtime — sem congelamento. **Risco remanescente:** ver
P1-6 (dois processos, dois namespaces de env, um invariante).

---

## 18. HEALTH — por que mostra "—"

Três causas somadas, todas verificadas:

**1. A coluna não existe em produção.** `seo_publications` tem exatamente 17 colunas:

```
id, cluster_plan_id, path, title, content, excerpt, city_id, brand, model,
publication_type, content_provider, content_stage, is_money_page, status,
published_at, updated_at, is_indexable
```

**`health_status` não está entre elas.** Nem `created_at`. A tabela foi criada
out-of-band em produção (a migration `022_seo_publications_is_indexable.sql` documenta
isso: só adicionou `is_indexable`).

**2. O admin é defensivo por construção.** `admin-seo.repository.js#getSeoPublicationColumns()`
introspecciona `information_schema` em runtime e `colExpr()` emite
`NULL::text AS health_status` quando a coluna falta. A UI então mostra "—". Sem erro 500,
sem log — por decisão de projeto.

**3. Nenhum scanner jamais rodou.** `seo_publication_audits`: **0 linhas**, `MAX(audited_at)`
**null**.

**Veredito:** não é erro, não é dado que não persiste, não é o admin deixando de ler.
É uma **feature nunca implementada ponta a ponta** — a coluna, o scanner e a UI existem
em pedaços que nunca se encontraram. → **P2-4**.

---

## 19. CONTEÚDO (539 / 559 / 675 / 685) — o que é

**Cálculo exato** (`admin-seo.repository.js#listPublications`):

```sql
COALESCE(LENGTH(sp.content), 0) AS content_length
```

`LENGTH()` em `text` no PostgreSQL conta **caracteres**, não bytes.

**Confirmação direta no banco** — os quatro valores do briefing são exatamente as quatro
linhas da tabela:

| publicação | content_length |
|---|---|
| `/carros-em/atibaia-sp` | **539** |
| `/carros-em/braganca-paulista-sp` | **559** |
| `/carros-baratos-em/atibaia-sp` | **675** |
| `/carros-baratos-em/braganca-paulista-sp` | **685** |

**É métrica SEO-significativa?** **Não.** É operacional, por dois motivos:

1. O texto é `content_provider = 'bootstrap-factual-v1'` — seed do bootstrap de maio.
2. **Esse texto não é renderizado em página pública nenhuma.** As landings vivas montam a
   copy a partir do inventário (`local-seo-data.ts#buildParagraphs`, `CompactCitySeoBlock`,
   `CityAuthoritySection`, `faq.ts`). `seo_publications.content` não entra no HTML.

Seu único uso real é a regra de "problema" `indexable_without_content` (`LENGTH < 100`),
que hoje não dispara para nenhuma das 4 linhas. → **P2-5**.

---

## 20. Links internos (§23) e expansão nacional (§24)

### 20.1 Não há fallback para Atibaia

Varredura por conteúdo em `src/` e `frontend/`: `atibaia` aparece **só** em testes, e2e,
scripts de smoke, fixtures e comentários. **Nenhuma ocorrência em caminho de runtime.**
Nada de `defaultCity`, `fallbackCity` ou `DEFAULT_CITY` territorial.

### 20.2 Mas há um fallback global para São Paulo — e São Paulo tem zero estoque

`frontend/lib/site/public-config.ts`:

```ts
const FALLBACK_PUBLIC_CITY: PublicCityConfig = {
  slug: "sao-paulo-sp", label: "São Paulo", name: "São Paulo", state: "SP",
};
```

Consumido por `PublicFooter.tsx:234`, `SmartVehicleSearch.tsx:77`,
`BlogPageClient.tsx`, `BlogCategoryPageClient.tsx`, `city-default.ts`,
e pelas rotas-índice `/tabela-fipe`, `/blog`, `/simulador-financiamento`.

**Medido em produção:**

```
/blog/sao-paulo-sp                     → 404
/tabela-fipe/sao-paulo-sp              → 404
/simulador-financiamento/sao-paulo-sp  → 404
/carros-em/sao-paulo-sp                → 404
/carros-baratos-em/sao-paulo-sp        → 404
/carros-usados/regiao/sao-paulo-sp     → 404
```

**Quando o fallback dispara** (contagem de links `sao-paulo-sp` distintos por página):

| página | links SP | por quê |
|---|---|---|
| `/` | **5** | sem cookie de cidade → cai no fallback |
| `/cidade/atibaia-sp/marca/chevrolet` | **5** | contexto de cidade não resolvido nessa rota |
| `/carros-em/atibaia-sp` | **0** | contexto resolvido → usa `atibaia-sp` |

**O agravante:** o Googlebot **nunca** carrega o cookie de cidade. Logo o crawler recebe
**sempre** a variante São Paulo — os 5 links mortos, em toda página onde o contexto não
é resolvido pela própria rota. → **P1-2**.

### 20.3 Varredura completa de links internos

| página | links internos distintos | problemáticos |
|---|---|---|
| `/carros-em/atibaia-sp` | 57 | 3 (todos `noindex, follow` legítimos: simulador, `/anunciar/novo`, `/carros-usados/regiao/…`) |
| `/carros-baratos-em/atibaia-sp` | 35 | 4 (todos `noindex, follow` legítimos) |
| `/cidade/atibaia-sp/marca/chevrolet` | 39 | **6 × 404 (SP)** + `/anuncios` 308 + 6 noindex |
| `/` (home) | 46 | **13**: 6 × 404 (SP) + **6 × 404 (blog)** + **1 × 404 (`/abaixo da fipe`)** |

**Links para URL não elegível:** nenhum. Nenhuma página linka para uma cidade abaixo do
limiar apresentando-a como indexável.
**Links para noindex:** vários, todos por design (transição de canonical) — não são erro,
mas diluem malha (P3-2).
**Links para 404:** 13 na home, 6 na página de marca. Todos rastreados às causas P1-2,
P1-4 e P1-5.

### 20.4 Malha de modelo — taxonomia dupla

`/cidade/atibaia-sp/marca/chevrolet` emite **5** links de modelo:

```
/modelo/onix                                    ← 200 index  (é a URL do models.xml)
/modelo/onix-hatch-1-0-12v-flex-5p-mec          ← 200 noindex
/modelo/onix-hatch-lt-1-0-12v-flex-5p-mec       ← 200 noindex
/modelo/onix-sedan-plus-lt-1-0-12v-flex-4p-mec  ← 200 noindex
/modelo/onix-sedan-plus-ltz-1-0-12v-tb-flex-aut ← 200 noindex
```

A URL canônica **está** lá (não há órfão), mas convive com 4 duplicatas noindex da
taxonomia FIPE antiga. → **P3-2**.

---

## 21. Teste de queda de estoque (§27) — **existe e funciona hoje**

Não foi preciso simular: **Bragança Paulista É o caso de queda**, executado em produção.

| etapa esperada | o que aconteceu | prova |
|---|---|---|
| cidade tinha estoque | 3 anúncios, publicações criadas em 2026-05-27 | `seo_publications` ids 2 e 4 |
| anúncios deixam de ser publicáveis | os 3 viraram `status='deleted'` | `SELECT status, COUNT(*)` |
| `active_public_ads = 0` | sim | consulta §4 |
| sai de `public-city-set` | sim — o conjunto só tem `atibaia-sp` | resposta do endpoint |
| rota aplica política adequada | **404 real** nas 3 famílias | HTTP ao vivo |
| deixa de ser listada no sitemap | sim — ausente de `cities.xml`, `below-fipe.xml`, `regiao/sp.xml` | HTTP ao vivo |

**Automático, sem job, sem intervenção.** Cadeia: `listActiveCityRows` (`WHERE
status='active'`) → `buildPublicCitySet` → gate Edge → 404; e a mesma consulta →
`buildCityEntries` → sitemap.

**O que NÃO acontece automaticamente:** as linhas de `seo_publications` e
`seo_cluster_plans` **permanecem** marcadas `published` + `is_indexable = true`. Nenhum
caminho de código as arquiva quando o estoque zera. É a origem do achado P1-1 e da
pergunta 1 do briefing.

---

## 22. Teste de retorno de estoque (§28) — automático

Análise lógica sobre o mesmo caminho:

1. Um anúncio entra com `status='active'` e `city_id = X`.
2. `listActiveCityRows` tem `HAVING COUNT(*) >= 1` — a cidade reaparece **na consulta
   seguinte**, sem job.
3. `getPublicCitySet` aplica `existsMinAds = 1` → a cidade entra no conjunto →
   **o gate para de dar 404** (≤ 60 s, TTL do fetch).
4. `shouldIndexLocalSeo` compara com `getSitemapMinAds() = 3`: com 1–2 anúncios a página
   é **200 `noindex, follow`**; com 3 vira **`index, follow`**.
5. `buildCityEntries(rows, 3)` a inclui em `cities.xml` no mesmo momento em que ela vira
   indexável — **mesma contagem, mesma função, mesmo limiar**.
6. `detectAvailableStates()` lê `type/city_home` e passa a declarar `regiao/<uf>.xml`
   no índice, se for UF nova.

**Nenhuma etapa depende de `seo_cluster_plans`, de `seo_publications` ou de worker.**
A latência é só de cache (§17).

Cobertura de teste dessa transição: `tests/seo/territorial-existence-rule.test.js`,
`src/read-models/seo/territorial-inventory-sitemap.test.js`,
`frontend/lib/middleware/city-existence-gate.test.ts`.

---

## 23. Testes existentes (§31)

**45 arquivos** cobrindo a área. Inventário:

**Gates de middleware (13)** — `frontend/lib/middleware/`:
`city-existence-gate`, `city-gate-reachability`, `uf-existence-gate`, `territory-gate`,
`ad-detail-gate`, `dealer-gate`, `blog-gate`, `bot-guard`, `gate-fail-safe`,
`host-redirect`, `canonical-redirects`, `canonical-redirects-reachability`, `bandwidth-log`.

**Sitemaps — frontend (9)**: `app/sitemaps/sitemap-index.test.ts`,
`sitemap-transition.test.ts`, `sitemap-ttl-guard.test.ts`, `regional-route.test.ts`,
`lib/seo/sitemap-client.test.ts`, `sitemap-static.test.ts`, `sitemap-snapshot.test.ts`,
`sitemap-xml-images.test.ts`, `blog-sitemap.test.ts`.

**Sitemaps — backend (5)**: `tests/seo/regional-sitemap-inventory.test.js`,
`tests/seo/vehicle-sitemap-images.test.js`,
`src/read-models/seo/territorial-inventory-sitemap.test.js`,
`tests/public/public-seo-sitemap-cache.test.js`,
`tests/public/public-seo-sitemap-killswitch.test.js`.

**Canonical / indexabilidade (8)**: `territorial-canonical-contract.test.ts`,
`territorial-canonical-transition.test.ts`, `local-seo-metadata.test.ts`,
`local-seo-breadcrumb.test.ts`, `local-seo-route-integration.test.ts`,
`canonical-city-path.test.ts`, `query-policy.test.ts`, `app/robots.test.ts`.

**Regra de existência / limiares (2)**: `tests/seo/territorial-existence-rule.test.js`,
`src/modules/seo/planner/cluster-planner.repository.test.js`.

**Admin SEO (6)**: `tests/admin/admin-seo-mutation.test.js`, `seo-ai-audit.test.js`,
`seo-ai-health.test.js`, `seo-metrics-canonical.test.js`, `ad-seo-ai-score.test.js`,
`tests/modules/seo/seo-status.test.js`.

**E2E (3)**: `frontend/e2e/seo-canonical.spec.ts`, `seo-jsonld.spec.ts`, `seo-sitemap.spec.ts`.

**Malha interna (3)**: `internal-links-sweep.test.ts`, `local-authority-linking.test.ts`,
`territorial-seo.test.ts`.

### Lacuna observada

`frontend/lib/seo/internal-links-sweep.test.ts` **existe** e mesmo assim os 13 links
quebrados da home passaram. Motivo: é uma varredura unitária sobre **construtores de
link**, não sobre **HTML renderizado**. Nenhum teste hoje afere "toda página renderizada
não linka para 404" — que é exatamente o que a auditoria fez à mão e que deveria virar
teste na Fase 4.1 (não implementar agora, conforme §32).

---

## 24. Achados P0

**Nenhum.**

Registrado explicitamente: o invariante territorial está **provado íntegro em produção**.
Nenhuma URL sem estoque está indexável, nenhum `noindex` está em sitemap, nenhuma canonical
cruza cidade, e o gate de 404 funciona nos três formatos de rota testados.

---

## 25. Achados P1

### P1-1 · Endpoint público serve URLs 404 a partir da tabela congelada

- **Evidência:**
  ```
  GET https://carros-na-cidade-core.onrender.com/api/public/seo/sitemap.xml → 200 application/xml
    <loc>…/carros-baratos-em/atibaia-sp</loc>
    <loc>…/carros-baratos-em/braganca-paulista-sp</loc>   ← 404 no site
    <loc>…/carros-em/atibaia-sp</loc>
    <loc>…/carros-em/braganca-paulista-sp</loc>           ← 404 no site
  ```
  O `.json` do mesmo endpoint devolve as mesmas 4 URLs.
- **Causa:** `public-seo.controller.js#loadCanonicalEntries` chama
  `public-seo.service.js#listEntries`, que lê `seo_cluster_plans LEFT JOIN seo_publications`
  **sem nenhuma validação de estoque**. É o último sobrevivente do caminho antigo —
  `getPublicSitemapByType` foi migrado para o estoque em 2026-07-04/05,
  `getPublicSitemapByRegion` em 2026-08-07, e o `sitemap.json`/`.xml` canônico ficou.
- **Impacto:** **contido, não nulo.** O host do backend serve
  `robots.txt: User-agent: * / Disallow: /` e a resposta traz `X-Robots-Tag: noindex`, então
  o Googlebot não rastreia. Mas: (a) qualquer consumidor que não respeite robots lê a
  lista errada; (b) o `lastmod` publicado é de maio; (c) `loadCanonicalEntries` cai em
  `buildFallbackEntries()` (home + `/anuncios`) se a tabela esvaziar, mascarando o vazio;
  (d) o código está a **um `if`** de voltar ao sitemap público — que é literalmente o
  defeito que os comentários de `sitemap-public.repository.js` e `sitemap-public.service.js`
  já descrevem tendo acontecido **duas vezes**.
- **Arquivos:** `src/modules/public/public-seo.service.js`,
  `src/modules/public/public-seo.controller.js` (`loadCanonicalEntries`,
  `sendCanonicalSitemapXml`, `getPublicSitemapJson`), `src/modules/public/public.routes.js`.
- **Correção recomendada:** apontar `listPublicSitemapEntries` para
  `sitemap-public.service.js` (composição dos 4 tipos de estoque, como
  `getPublicSitemapByRegion` já faz), **ou** aposentar as rotas. E arquivar as 2 linhas
  órfãs de Bragança. Decidir na Fase 4.1.

### P1-2 · Fallback global `sao-paulo-sp` produz 5 links 404 em toda página sem contexto de cidade

- **Evidência:** §20.2 — 6 URLs de São Paulo medidas em 404; home e página de marca com
  5 links distintos cada; página de cidade com 0.
- **Causa:** `FALLBACK_PUBLIC_CITY.slug = "sao-paulo-sp"` em
  `frontend/lib/site/public-config.ts`, um valor escolhido antes do invariante
  "cidade existe se tem anúncio". São Paulo tem **zero** anúncios ativos, logo o gate a
  404a — o fallback aponta para fora do conjunto público.
- **Impacto:** o Googlebot, que nunca tem cookie de cidade, recebe **sempre** a variante
  com os links mortos. Desperdício de crawl budget, 404s no GSC e links quebrados para o
  usuário no rodapé de todo o site.
- **Arquivos:** `frontend/lib/site/public-config.ts:29-34`,
  `frontend/components/shell/PublicFooter.tsx:234`,
  `frontend/components/search/SmartVehicleSearch.tsx:77`,
  `frontend/components/blog/BlogPageClient.tsx:19,325,467`,
  `frontend/components/blog/BlogCategoryPageClient.tsx:18,281`,
  `frontend/lib/city/city-default.ts`, `frontend/app/{tabela-fipe,blog,simulador-financiamento}/page.tsx`.
- **Correção recomendada:** o fallback tem de sair do **conjunto público real**
  (`/api/public/cities/public-set`, a cidade com mais estoque) em vez de um literal — ou,
  se não houver cidade, não emitir o link. Nunca um slug fixo que o gate rejeita.

### P1-3 · `/tabela-fipe` está no `core.xml`, canonicaliza para a home e leva a um 404

- **Evidência:**
  ```
  GET /tabela-fipe → 200
    <title>Carros na Cidade | Marketplace automotivo regional</title>   ← título do layout raiz
    <link rel="canonical" href="https://www.carrosnacidade.com">        ← a HOME
    <meta name="robots" content="index, follow">
    corpo contém NEXT_REDIRECT → /tabela-fipe/sao-paulo-sp              ← que é 404
  ```
- **Causa:** `frontend/app/tabela-fipe/page.tsx` é uma rota-índice que só faz
  `redirect('/tabela-fipe/' + (cookie ?? DEFAULT_PUBLIC_CITY_SLUG))`. Sem cookie, o destino
  é `sao-paulo-sp` → 404 (P1-2). Como o `redirect()` acontece após o shell do layout ter
  sido emitido, a resposta sai **200** com a metadata **default do `app/layout.tsx`**
  (`alternates: { canonical: "/" }`, linha 84-85) — daí a canonical apontar para a home.
- **Impacto:** uma URL do sitemap que (a) não é auto-canônica, (b) não tem conteúdo
  próprio e (c) despacha o visitante para um 404. É a única violação em 53 URLs.
- **Arquivos:** `frontend/app/tabela-fipe/page.tsx`, `frontend/app/layout.tsx:84-85`,
  `frontend/lib/seo/sitemap-static.ts` (que a inclui em `core.xml`).
- **Correção recomendada:** decidir se `/tabela-fipe` é landing própria (então dar-lhe
  metadata e conteúdo) ou redirect (então **tirar de `core.xml`** e usar 307/308 de
  verdade). As irmãs `/blog` e `/simulador-financiamento` têm o mesmo padrão de redirect e
  merecem a mesma decisão — `/blog` hoje já emite canonical self e está correta.

### P1-4 · Home linka 6 posts de blog inexistentes

- **Evidência:** `/blog/compra-usado`, `/blog/tabela-fipe`, `/blog/financiamento`,
  `/blog/checklist`, `/blog/vender-rapido`, `/blog/carro-cidade` → **todos 404**.
  `blog_posts` em produção tem **13** posts publicados, e nenhum desses slugs está entre eles.
- **Causa:** `frontend/components/home/sections/ContentCardsSection.tsx:46-76` — seis
  `href` **hardcoded**, escritos antes do CMS existir e nunca reconciliados com os slugs reais.
- **Impacto:** 6 links 404 na página de maior autoridade do site.
- **Arquivos:** `frontend/components/home/sections/ContentCardsSection.tsx`.
- **Correção recomendada:** derivar os cards de `blog_posts` publicados (o `blog.xml` já
  lê a fonte certa), ou apontar para as 6 URLs reais.

### P1-5 · Banner do hero com `cta_url` inválido → 404 no link mais visível do site

- **Evidência:**
  ```
  GET /api/public/home/hero
    "key":"home_hero_3", "cta_url":"/abaixo da fipe", "image_alt":"Oportunidade"
  HTML da home:  <a aria-label="Oportunidade" … href="/abaixo da fipe">   → 404
  ```
- **Causa:** `frontend/components/home/sections/HomeHero.tsx:393-396` faz
  `offersHref = overrideCtaUrl ?? buildCanonicalCityHref(...)` e usa o valor **cru**. Um
  administrador digitou um **rótulo** ("abaixo da fipe") no campo de URL do banner e
  **não há validação** em ponto nenhum do caminho — nem no admin, nem no backend, nem no
  componente.
- **Impacto:** o banner principal do carrossel da home leva a um 404. Defeito de dado
  (corrigível no admin agora) **somado** a um defeito de código (ausência de validação).
- **Arquivos:** `frontend/components/home/sections/HomeHero.tsx:393-412,520`,
  `frontend/lib/home/public-home.ts`, mais o endpoint de admin que grava `cta_url`.
- **Correção recomendada:** validar `cta_url` na escrita (caminho interno começando com
  `/` e sem espaço, ou URL absoluta http(s)) e descartar/ignorar valor inválido na
  leitura. E corrigir o dado do `home_hero_3`.

### P1-6 · O invariante tem duas implementações em dois processos, com env não versionada

- **Evidência:** `src/read-models/cities/city-thresholds.js` (backend) e
  `frontend/lib/seo/sitemap-min-ads.ts` (frontend) implementam a **mesma** política —
  mesmos defaults (3 / 1), mesma precedência `CITY_INDEX_MIN_ADS` → `SITEMAP_MIN_ADS`,
  mesma derivação de família. Mas rodam em **processos diferentes**, com **env
  diferentes**. `render.yaml` versiona **só** o serviço `carros-na-cidade-portal`; o
  serviço de backend não está no arquivo, então `SITEMAP_MIN_ADS` / `CITY_INDEX_MIN_ADS` /
  `SITEMAP_PUBLIC_ENABLED` / `RUN_WORKER_*` vivem apenas no dashboard.
- **Estado hoje:** **coerente.** O backend reporta `indexMinAds: 3` e `existsMinAds: 1`
  via `/api/public/cities/public-set`, e `SITEMAP_PUBLIC_ENABLED` está `true` (o endpoint
  responde 200, não o 503 do kill switch). Não foi possível ler a env do **frontend** —
  com estoque 27 e limiar 3, nenhum experimento observável discrimina o valor.
- **Impacto:** latente. Setar `SITEMAP_MIN_ADS` em um serviço e não no outro produziria
  exatamente a incoerência que os dois arquivos declaram existir para evitar: sitemap
  incluindo uma cidade que a página marca `noindex`, ou o contrário. Sem alarme.
- **Arquivos:** `render.yaml`, `src/read-models/cities/city-thresholds.js`,
  `frontend/lib/seo/sitemap-min-ads.ts`.
- **Correção recomendada:** versionar as envs de ambos os serviços no `render.yaml`
  (valores não-secretos) e adicionar uma asserção de arranque, ou expor o par
  `indexMinAds/existsMinAds` do frontend num healthcheck para poder comparar.

---

## 26. Achados P2 (observabilidade)

### P2-1 · `detected_buckets` compara grandezas incomparáveis
Numerador = grupos distintos de `cluster_type` em `seo_cluster_plans`; denominador =
arquivos em `SITEMAP_INDEX`. Teto estrutural **5/9**. `admin-seo.service.js:38-44,64-69`.
**Correção:** contar só os buckets com `cluster_type` (denominador 5), ou trocar o
numerador por "buckets que efetivamente servem ≥1 URL" — medindo a fonte real.

### P2-2 · Severidade de bucket vazio é `high` incondicional
`admin-seo.repository.js#listIssues`, bloco 3: `if (!eligible) push({severity:"high"})`,
sem considerar se zero é o esperado. **Correção (para o plano):**
`eligible = 0 && urls = 0 → INFO`; `eligible > 0 && urls = 0 → ALTO/CRÍTICO`.

### P2-3 · O painel inteiro lê o pipeline errado — o achado-mãe
`sitemapCounts()` / `sitemapRegionCounts()` / `overviewSummary()` leem
`seo_cluster_plans` + `seo_publications`, enquanto 4 dos 5 buckets territoriais são
servidos do estoque desde 2026-07-04. **Consequência medida:** brands e models declarados
vazios enquanto servem 3 e 1 URLs; `sitemap_eligible_clusters = 4` enquanto os sitemaps
publicam 53 URLs. **Correção:** as contagens do painel devem vir de
`territorial-inventory-sitemap.service.js`, a mesma fonte dos sitemaps.

### P2-4 · HEALTH nunca existiu ponta a ponta
Coluna `health_status` ausente do schema real (17 colunas enumeradas);
`seo_publication_audits` com 0 linhas. Ver §18.

### P2-5 · CONTEÚDO mede um texto que nenhuma página renderiza
`LENGTH(sp.content)` em caracteres, de um seed `bootstrap-factual-v1` de maio. Ver §19.
**Correção:** rotular como "chars (seed)" ou remover da grade.

### P2-6 · Deslocamento de −3 h nas datas do painel
`seo_publications.updated_at` e `seo_cluster_plans.updated_at` são
`timestamp without time zone`; serializadas como UTC e renderizadas em UTC−3. Ver §10.2.

### P2-7 · `/sitemaps/regiao/<uf>.xml` afirma 200 para UF sem estoque
Medido: `regiao/rj.xml` → 200 com `<urlset>` vazio (TTL curto, 300 s, por
`shouldUseLongTtl`). Só UF **não brasileira** recebe 404. Nenhuma UF vazia está no índice,
então não há custo de crawl — mas 200 vazio é uma afirmação onde 404 seria a verdade.

### P2-8 · Comentário desatualizado sobre `models.xml`
`frontend/app/sitemap.xml/route.ts` afirma que `models.xml` está vazio por falta de
estoque ("o modelo mais frequente tem 2 anúncios"). Após a taxonomia de modelo comercial,
Onix agrega 6 e `models.xml` **tem 1 URL**. Comentário engana quem for auditar depois.

---

## 27. Achados P3

- **P3-1 · Código legado com peso:** `src/modules/public/public-seo.service.js` e
  `sitemap-public.repository.js#listSitemapByRegion` (já marcado `@deprecated`, sem
  chamador). `frontend/lib/seo/sitemap-client.ts#fetchPublicSitemap` **não tem consumidor**
  — só a própria definição. Candidatos a remoção após P1-1.
- **P3-2 · Malha de modelo com taxonomia dupla:** 4 links noindex de descrição FIPE ao
  lado da URL canônica de modelo comercial (§20.4). Diluição, não ruptura.
- **P3-3 · `city_scores` vazia (0 linhas):** o `SQL_PRIMARY` do planner nunca produz
  resultado; o caminho real é sempre `SQL_FALLBACK_ADS` com `stage='seed'`. Se o planner
  for religado, é isto que vai rodar.
- **P3-4 · Um salto de redirect na malha:** a home linka `/anuncios` → 308 → `/comprar`.
- **P3-5 · Dívida estrutural (registrada, sem migration):** `seo_publications` não tem
  `health_status` nem `created_at`. **Nenhuma migration criada nesta fase**, conforme §30
  do briefing.

---

## 28. Plano de correção (proposto — NÃO executado)

Ordenado por risco decrescente e por independência entre itens.

**Bloco A — fonte de verdade (fecha P1-1, P2-3, P3-1)**
1. Apontar `listPublicSitemapEntries` para `sitemap-public.service.js`, ou aposentar
   `/api/public/seo/sitemap.{json,xml}`.
2. Arquivar as 2 publicações e os 2 cluster plans de Bragança (`status='archived'`),
   com `reason` registrada em `admin_actions`.
3. Reapontar `sitemapCounts()` do painel para `territorial-inventory-sitemap.service.js`.

**Bloco B — links quebrados (fecha P1-2, P1-4, P1-5)**
4. Fallback de cidade derivado de `/api/public/cities/public-set`, nunca literal.
5. `ContentCardsSection` derivado de `blog_posts` publicados.
6. Validação de `cta_url` na escrita e na leitura + correção do dado `home_hero_3`.

**Bloco C — sitemap × canonical (fecha P1-3)**
7. Decidir `/tabela-fipe` (landing própria **ou** fora do `core.xml` com 308 real);
   aplicar a mesma decisão a `/blog` e `/simulador-financiamento`.

**Bloco D — observabilidade (fecha P2-1, P2-2, P2-4…P2-8)**
8. Corrigir denominador/numerador de "detectados".
9. Severidade condicional para bucket vazio.
10. Rotular ou remover HEALTH e CONTEÚDO; normalizar fuso das datas.

**Bloco E — configuração (fecha P1-6)**
11. Versionar o serviço de backend no `render.yaml`; asserção de coerência de limiares.

**Bloco F — testes (§32 — propostos, não implementados)**
`city with stock` · `city without stock` · `stale publication` · `empty sitemap legitimate`
· `eligible cluster missing sitemap` · `noindex in sitemap` · `indexable absent from
sitemap` · `canonical mismatch` · `job stale` · `scheduler unavailable`
· **`rendered page has no link to a 404`** (a lacuna que deixou passar P1-2/4/5).

---

## 29. GO / NO-GO

| domínio | veredito | justificativa |
|---|---|---|
| **Invariante territorial em runtime** | **GO** | 53/53 URLs 200+index; Bragança 404; zero canonical cruzada; queda e retorno de estoque automáticos |
| **Sitemaps públicos** | **GO** | índice coerente, 9 filhos, todos com URLs, TTL assimétrico correto, robots correto |
| **Tabelas de plano/publicação como fonte de verdade** | **NO-GO** | congeladas há 96 dias, 2 de 4 linhas apontam para 404 |
| **Endpoint legado `/api/public/seo/sitemap.*`** | **NO-GO** | publica URLs 404; contido por robots do backend |
| **Painel `/admin/seo` como instrumento de decisão** | **NO-GO** | mede o pipeline errado; métrica com teto impossível; severidade incondicional |
| **Malha de links internos** | **NO-GO** | 13 links 404 na home, 6 na página de marca |
| **Expansão nacional** | **GO com ressalva** | nenhum hardcode de Atibaia; mas o fallback global `sao-paulo-sp` precisa sair antes de escalar |

---

## 30. Matriz final obrigatória (§36)

| CHECK | RESULTADO | EVIDÊNCIA |
|---|---|---|
| Cidade com estoque controla publicação | **SIM** | `listActiveCityRows` → `buildCityEntries`/`buildPublicCitySet`; `cities.xml` = 1 URL = a única cidade com estoque |
| City sem estoque não indexa | **SIM** | Bragança e São Paulo: 404 no gate, ausentes de todo sitemap |
| Bragança coerente | **SIM em runtime / NÃO no banco** | 404 nas 3 rotas e fora dos sitemaps; mas 2 linhas `published + is_indexable=true` sobrevivem em `seo_publications` (P1-1) |
| Atibaia coerente | **SIM** | 27 ativos; city/below-fipe/3 marcas/1 modelo, todos 200 + index + canonical self, todos no sitemap |
| Jobs ativos | **NÃO** | todos `RUN_WORKER_*` SEO default `false`; `RUN_WORKERS` default `false`; sem cron/BullMQ; sem escrita há 96 dias |
| Último job recente | **NÃO** | `seo_cluster_plans` `last_generated_at = 2026-05-27 01:40:58` (96 dias) |
| Sitemap index correto | **SIM** | `/sitemap.xml` 200, 9 `<sitemap>`, todos 200 com ≥1 URL, XML válido |
| robots correto | **SIM** | 200 `text/plain`, `Allow: /`, declara o índice, host www/https, sem `Host:` |
| 9/9 ou explicação comprovada | **EXPLICADO** | "2/9" = grupos de `cluster_type` (2) ÷ arquivos de sitemap (9); teto estrutural 5/9 — `admin-seo.service.js:40,66` |
| Buckets vazios legítimos | **PARCIAL** | `opportunities` e `local_seo`: legítimos (canonicalizam para outras famílias). `brands` e `models`: **não estão vazios** (3 e 1 URLs) — o painel mede a tabela errada |
| Indexable presente em sitemap | **SIM** | toda URL 200+index das famílias territoriais está no sitemap; as 2 ausentes são as de Bragança, que são 404 |
| Noindex ausente de sitemap | **SIM** | 53/53 URLs do sitemap são `index, follow` |
| Canonical territorial correto | **SIM** | todas as territoriais são auto-canônicas ou canonicalizam para a canônica da própria cidade; **zero** cruzamento entre cidades |
| Cache coerente | **SIM com ressalva** | gate/página ≈ 60 s; sitemap ≈ 1 h típico, até ~24 h se um edge cache segurar `s-maxage=86400`; `revalidateTag` não alcança o cache do backend |
| Health operacional | **NÃO** | coluna `health_status` inexistente no schema real; `seo_publication_audits` com 0 linhas |
| Zero fallback Atibaia | **SIM** | nenhuma ocorrência em runtime. **Mas existe fallback global `sao-paulo-sp` (0 estoque) gerando 5 links 404 por página** (P1-2) |

---

## 31. Regra de parada

**DIAGNÓSTICO CONCLUÍDO — aguardando autorização para correção.**

Nada foi corrigido. Nenhuma migration criada. Nenhum threshold alterado. Nenhuma landing
gerada. Nenhuma copy SEO tocada. Nenhum layout ou UI de admin modificado. Nenhum push,
PR, merge ou deploy.

A próxima fase — **SEO 4.1 — Correções de integridade territorial** — deve ter escopo
construído exclusivamente a partir dos achados P1/P2 acima, todos com evidência medida.
