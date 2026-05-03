# Investigação — Sitemaps Territoriais Vazios

> **Coletado em:** 2026-05-03 contra `https://www.carrosnacidade.com` e
> `https://carros-na-cidade-core.onrender.com` (backend prod, Render).
> **Ferramentas:** `curl` + leitura de código (frontend `app/sitemaps/`,
> `lib/seo/sitemap-client.ts`; backend `src/modules/public/`,
> `src/read-models/seo/`, `src/database/migrations/`).
> **Tipo:** investigação read-only. **Zero código alterado.**

---

## 1. Veredito geral

**Causa raiz tem 3 camadas, da mais provável para a menos:**

1. **(DADOS)** Tabela `seo_cluster_plans` está **vazia em produção** —
   ou todos os registros têm `status` fora de `('planned','generated')`.
   Backend `/api/public/seo/sitemap/type/<type>` retorna `{"success":true,"data":[]}`
   HTTP 200 para os 4 tipos auditados, **sem erro de schema** — significa
   que a tabela existe e a query roda, mas o `WHERE` filtra tudo.

2. **(BACKEND)** Schema drift: o endpoint **canônico** `/api/public/seo/sitemap.json`
   retorna **HTTP 500** com `"column sp.is_indexable does not exist"`. Esse endpoint
   referencia uma coluna `is_indexable` em `seo_publications` que **NUNCA foi criada
   por migration oficial** (`grep -l is_indexable src/database/migrations/*.sql`
   retorna 0). Não afeta os 4 sitemaps territoriais auditados (eles usam outro
   repository), mas é uma bomba latente no sitemap canônico.

3. **(FRONTEND)** Falha silenciosa em camada dupla:
   - `sitemap-client.fetchPublicSitemapByType()` engole erros via `try/catch`
     em `fetchJsonSafe` → retorna `null` → caller devolve `[]`.
   - Cada `route.ts` (cities/below-fipe/brands/models) tem **outro `try/catch`
     silencioso** que devolve `<urlset></urlset>` HTTP 200 mesmo se o backend
     estiver fora.
   - Resultado: nenhum log no frontend Render denuncia que está vazio.

**Causa adicional importante:** `local-seo.xml` e `opportunities.xml` estão
vazios **POR DESIGN** — não é bug. Comentários no código explicam que essas
URLs canonicalizam para outras famílias e não devem aparecer no sitemap
durante a transição.

---

## 2. Evidência de produção

### 2.1 Frontend — sitemaps territoriais (HEAD + body)

| Sitemap | HTTP | Bytes | Content-Type | Cache-Control | Tempo | Resultado |
|---|---|---|---|---|---|---|
| `/sitemap.xml` (índice) | 200 | 1116 | application/xml | public, max-age=300, s-maxage=300 | 0.33s | Lista 8 sitemaps filhos. OK. |
| `/sitemaps/cities.xml` | 200 | **107** | application/xml | public, s-maxage=3600, swr=86400 | 0.41s | `<urlset></urlset>` vazio |
| `/sitemaps/local-seo.xml` | 200 | **107** | application/xml | public, s-maxage=3600, swr=86400 | 0.73s | `<urlset></urlset>` vazio (POR DESIGN) |
| `/sitemaps/opportunities.xml` | 200 | **107** | application/xml | public, s-maxage=3600, swr=86400 | 0.34s | `<urlset></urlset>` vazio (POR DESIGN) |
| `/sitemaps/below-fipe.xml` | 200 | **107** | application/xml | public, s-maxage=3600, swr=86400 | 0.31s | `<urlset></urlset>` vazio |
| `/sitemaps/brands.xml` | 200 | **107** | application/xml | public, s-maxage=3600, swr=86400 | 0.33s | `<urlset></urlset>` vazio |
| `/sitemaps/models.xml` | 200 | **107** | application/xml | public, s-maxage=3600, swr=86400 | 0.30s | `<urlset></urlset>` vazio |
| `/robots.txt` | 200 | 486 | text/plain | public, max-age=0, must-revalidate | 0.30s | OK. Aponta para `/sitemap.xml`. Allow `/sitemaps/`. |

107 bytes = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>` exato — o `buildSitemapXml([])` produz isso.

### 2.2 Backend — endpoints SEO (chamados pelos sitemaps)

| Endpoint | HTTP | Bytes | Body |
|---|---|---|---|
| `/api/public/seo/sitemap/type/city_home?limit=10` | 200 | 26 | `{"success":true,"data":[]}` |
| `/api/public/seo/sitemap/type/city_below_fipe?limit=10` | 200 | 26 | `{"success":true,"data":[]}` |
| `/api/public/seo/sitemap/type/city_brand?limit=10` | 200 | 26 | `{"success":true,"data":[]}` |
| `/api/public/seo/sitemap/type/city_brand_model?limit=10` | 200 | 26 | `{"success":true,"data":[]}` |
| `/api/public/seo/sitemap.json?limit=10` | **500** | 310 | `{"success":false,"error":true,"message":"column sp.is_indexable does not exist","details":{"code":"42703","routine":"errorMissingColumn"}}` |

### 2.3 robots.txt em prod

```
User-Agent: *
Allow: /
Allow: /comprar
Allow: /cidade/
Allow: /carros-em/
Allow: /carros-baratos-em/
Allow: /carros-automaticos-em/
...
Disallow: /api/
Disallow: /dashboard
...
Sitemap: https://www.carrosnacidade.com/sitemap.xml
```

OK. `Allow` cobre todas as URLs canônicas intermediárias da Fase 1.

---

## 3. Mapa dos geradores frontend

| Sitemap | Arquivo | Handler | Função de fetch | Cache/revalidate | Comportamento em erro |
|---|---|---|---|---|---|
| `/sitemap.xml` (índice) | `frontend/app/sitemap.xml/route.ts` | `GET` | hardcoded — 8 entries com lastmod=now | `max-age=300` | n/a (estático) |
| `cities.xml` | `frontend/app/sitemaps/cities.xml/route.ts` | `GET` (`force-dynamic`, `revalidate=3600`) | `fetchPublicSitemapByTypes(["city_home"], 50000)` + `rewriteCityHomeEntries` | `s-maxage=3600, swr=86400` | **try/catch silencioso** → `buildSitemapXml([])` HTTP 200 |
| `local-seo.xml` | `frontend/app/sitemaps/local-seo.xml/route.ts` | `GET` (`force-dynamic`, `revalidate=3600`) | **HARDCODED `[]`** via `buildLocalSeoTransitionEntries()` | mesmo | n/a — nunca falha |
| `opportunities.xml` | `frontend/app/sitemaps/opportunities.xml/route.ts` | `GET` (`force-dynamic`, `revalidate=3600`) | **HARDCODED `[]`** via `buildOpportunitiesTransitionEntries()` | mesmo | n/a — nunca falha |
| `below-fipe.xml` | `frontend/app/sitemaps/below-fipe.xml/route.ts` | `GET` (`force-dynamic`, `revalidate=3600`) | `fetchPublicSitemapByTypes(["city_below_fipe"], 50000)` | mesmo | **try/catch silencioso** |
| `brands.xml` | `frontend/app/sitemaps/brands.xml/route.ts` | `GET` (`force-dynamic`, `revalidate=3600`) | `fetchPublicSitemapByTypes(["city_brand"], 50000)` | mesmo | **try/catch silencioso** |
| `models.xml` | `frontend/app/sitemaps/models.xml/route.ts` | `GET` (`force-dynamic`, `revalidate=3600`) | `fetchPublicSitemapByTypes(["city_brand_model"], 50000)` | mesmo | **try/catch silencioso** |

**`fetchPublicSitemapByType(type, limit)`** em `frontend/lib/seo/sitemap-client.ts`:
- Endpoint: `${API_URL}/api/public/seo/sitemap/type/${type}?limit=${limit}`.
- Cache `next: { revalidate: 3600 }`.
- `fetchJsonSafe()` interno tem try/catch que retorna `null` em qualquer falha (timeout 8s, abort, parse, status non-2xx).
- Se `null` ou `success!==true` ou `data` não array → `[]`.
- **Toda essa cadeia engole erros sem log.**

---

## 4. Mapa dos endpoints backend

| Endpoint | Rota (file) | Controller | Service | Repository | Tabela / SQL | Status filtrado | Comporta vazio |
|---|---|---|---|---|---|---|---|
| `GET /api/public/seo/sitemap/type/:type` | `src/modules/public/public-seo.routes.js:21,24` | `getPublicSitemapByType` (`public-seo.controller.js:233`) | `read-models/seo/sitemap-public.service.js#getPublicSitemapByType` | `read-models/seo/sitemap-public.repository.js#listSitemapByType` | `seo_cluster_plans scp JOIN cities c ON c.id=scp.city_id` | **`('planned','generated')`** + `cluster_type=$1` | retorna `data:[]` HTTP 200 (verificado) |
| `GET /api/public/seo/sitemap/region/:state` | linha 22, 25 | `getPublicSitemapByRegion` | `getPublicSitemapByRegion` | `listSitemapByRegion` | mesmo schema | mesmo | n/a (não auditado) |
| `GET /api/public/seo/sitemap.json` | linha 19 | `getPublicSitemapJson` (linha 216) | **`public-seo.service.js#listPublicSitemapEntries`** (caminho diferente!) | inline em service | `seo_cluster_plans scp LEFT JOIN seo_publications sp ON sp.cluster_plan_id=scp.id LEFT JOIN cities c ON c.id=scp.city_id` | **`('published','planned')`** + `(sp.id IS NULL OR sp.is_indexable=TRUE)` + `(sp.id IS NULL OR sp.status IN ('published','review_required'))` | **HTTP 500: `column sp.is_indexable does not exist`** |
| `GET /api/public/seo/sitemap`, `/sitemap.xml` | linha 17, 18 | `sendCanonicalSitemapXml` | mesmo (`listPublicSitemapEntries`) | mesmo | mesmo | mesmo SQL → mesmo erro 500, mas controller tem catch que devolve **fallback de 2 URLs estáticas** (`/`, `/anuncios`) HTTP 200 |

**Inserção de dados em `seo_cluster_plans`:**
- Único caller: `src/modules/seo/planner/cluster-plan.repository.js#upsertClusterPlan` (status default = `'planned'`).
- Acionado pelo worker `src/workers/seo/cluster-planner.worker.js#startClusterPlannerWorker`, que chama `runClusterPlannerEngine(200)`.
- Worker só roda se `process.env.RUN_WORKERS === "true"` (ver `src/index.js`). Sem essa env, planner nunca executa.

---

## 5. Dados e tabelas

| Tabela | Existe em migration oficial? | Existe em prod? | Tem dados? | Observações |
|---|---|---|---|---|
| `seo_cluster_plans` | **NÃO** — `grep -l seo_cluster_plans src/database/migrations/*.sql` → 0 matches em 21 migrations | **SIM** (a query roda sem erro de relation) | **APARENTEMENTE VAZIA** ou todos os registros estão fora de `('planned','generated')` | Criada out-of-band (não há `CREATE TABLE` em migration). Coluna `payload` é `jsonb`. |
| `seo_publications` | **NÃO** | **SIM** (erro do 500 é "column does not exist", não "relation does not exist") | desconhecido | Falta a coluna `is_indexable` que `public-seo.service.js` referencia. |
| `cities` | **SIM** (001_baseline_cities.sql) | SIM | SIM (5570 municípios IBGE esperados) | `JOIN c.id = scp.city_id` funciona — `cities` está populada. |
| `seo_city_metrics` | SIM (015_seo_city_metrics_canonical.sql) | SIM | desconhecido | Não usada pelos sitemaps territoriais; só pela engine de scoring. |

**Status que o planner grava:** default `'planned'` (ver `cluster-plan.repository.js#upsertClusterPlan` linha 11).
**Status que o repository público filtra:** `('planned','generated')`.
**Status que o service canônico filtra:** `('published','planned')`.

⚠️ **Divergência:** `'generated'` é aceito em um caminho mas não no outro. `'published'` é exigido em um caminho mas não emitido pelo planner. Se o planner gravar `'planned'` e nunca for promovido a `'published'` ou `'generated'`, ambos os caminhos exibem o registro... mas só se houver registro.

`cluster_type` esperado pelos sitemaps:
- `cities.xml` → `city_home`
- `below-fipe.xml` → `city_below_fipe`
- `brands.xml` → `city_brand`
- `models.xml` → `city_brand_model`

(Convenção confirmada em `src/modules/public/public-seo.service.js#buildPriority/buildChangefreq` que enumera esses 5 cluster_types.)

**Sem acesso direto ao DB de prod nesta investigação** — recomendo SELECTs read-only:

```sql
-- Confirma se a tabela existe e quantos registros tem (deve falhar se relation não existir)
SELECT COUNT(*) FROM seo_cluster_plans;

-- Confirma o filtro do repository público
SELECT cluster_type, status, COUNT(*)
FROM seo_cluster_plans
GROUP BY cluster_type, status
ORDER BY cluster_type, status;

-- Confirma seo_publications + ausência de is_indexable
\d seo_publications

-- Verifica se cities está populada (sanity check do JOIN)
SELECT COUNT(*) FROM cities;
```

---

## 6. Feature flags e variáveis de ambiente

### 6.1 Frontend (`frontend/lib/seo/sitemap-client.ts`)

| Variável | Required? | Fallback | Observação |
|---|---|---|---|
| `API_URL` | **opcional** | `NEXT_PUBLIC_API_URL` → vazio | Se ambas vazias, `getApiBaseUrl()` retorna `""` → fetch nem acontece → `[]`. **Sem warn, sem erro.** |
| `NEXT_PUBLIC_API_URL` | opcional | "" | Mesmo. |

⚠️ **Divergência crítica com o resto do frontend:** `frontend/lib/env/backend-api.ts` lê `AUTH_API_BASE_URL`, `BACKEND_API_URL`, `CNC_API_URL`, `API_URL`, `NEXT_PUBLIC_API_URL` (5 chaves, nessa ordem). Se o Render tiver só `BACKEND_API_URL` configurada, **todo o resto do frontend funciona menos os sitemaps**.

### 6.2 Backend

| Variável | Required? | Onde | Comportamento se ausente |
|---|---|---|---|
| `RUN_WORKERS` | opcional | `src/index.js` | `false` por default → **cluster-planner.worker NUNCA roda** → `seo_cluster_plans` nunca é populado |
| `CLUSTER_PLANNER_WORKER_INTERVAL_MS` | opcional | `cluster-planner.worker.js` | default `6h` |
| `SITE_URL` / `FRONTEND_URL` / `PUBLIC_SITE_URL` | opcional | `public-seo.controller.js#getSiteUrl` | fallback `https://carrosnacidade.com` |

Setup típico Render: web service ≠ worker dyno. Se o time não tem worker dyno separado **e** `RUN_WORKERS` não está `true` no web service, o planner nunca executa.

### 6.3 Sem segredos expostos

Não inspecionei valores de envs. Apenas indiquei quais o código requer/aceita.

---

## 7. Cache e revalidação

| Camada | Configuração | Risco de servir vazio cacheado |
|---|---|---|
| Next.js `route.ts` | `export const dynamic = "force-dynamic"` + `revalidate = 3600` | Conflito: `force-dynamic` desabilita ISR mas `revalidate` sugere ISR. Comportamento prático: regenera a cada request (force-dynamic vence). |
| `fetchJsonSafe` | `next: { revalidate: 3600 }` no fetch | Backend response cacheada por 1h no Next data cache. Se backend respondeu vazio, fica vazio até próxima revalidação. |
| Headers HTTP | `Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400` | Cloudflare segura por 1h + serve stale por 24h durante revalidação. **Resposta vazia fica cacheada.** |
| Cloudflare CDN | `Server: cloudflare` + `x-render-origin-server: Render` | Honra os headers do origin. Sem `Age:` no HEAD → não dá pra confirmar cache hit em CDN, mas tempo de 0.3-0.7s sugere edge cache OU origin rápido. |
| Backend Redis | nenhum mencionado em `sitemap-public.repository.js` | Sem cache backend para esse endpoint. |

**Risco real:** se a causa raiz for corrigida, **invalidar cache CDN** + esperar revalidação Next data cache (~1h) ou rodar `revalidatePath('/sitemaps/cities.xml')` (não há endpoint pra isso atualmente).

---

## 8. Divergência com política de canonical (Fase 1)

A Fase 1 (commit `24009155`, 2026-05-03) consolidou canonicals em:
- `/carros-em/[slug]` → canônica intermediária de "comprar carros na cidade"
- `/carros-baratos-em/[slug]` → canônica intermediária de "barato/abaixo-da-fipe"

**Os geradores de sitemap atuais NÃO refletem isso:**

| Sitemap | URL que tenta gerar | Canônica Fase 1 | Divergência |
|---|---|---|---|
| `cities.xml` | `/comprar/cidade/[slug]` (rewrite de `/cidade/[slug]`) | **`/carros-em/[slug]`** | Sim. `rewriteCityHomeEntries()` aponta para a canônica **antiga**. Se o pipeline for corrigido sem ajustar isso, sitemap vai expor `/comprar/cidade/[slug]` que internamente canonicaliza para `/carros-em/[slug]` → loop de canonical. |
| `local-seo.xml` | (vazio por design) | `/carros-em/[slug]` e `/carros-baratos-em/[slug]` agora **são as canônicas indexáveis** | Sim. Comentário do arquivo diz "canonicalizam para outra família" — após Fase 1 elas canonicalizam para si mesmas. **Deveriam aparecer no sitemap.** |
| `opportunities.xml` | (vazio por design) | `/cidade/[slug]/oportunidades` canonicaliza para `/carros-baratos-em/[slug]` | Não. Continua correto ficar vazio (variante noindex que canonicaliza para outra). |
| `below-fipe.xml` | `/cidade/[slug]/abaixo-da-fipe` (rewrite implícito do path do backend) | **`/carros-baratos-em/[slug]`** | Sim. Mesma canônica antiga. |
| `brands.xml` | `/cidade/[slug]/marca/...` | n/a (Fase 1 não tocou marca) | Não — fora do escopo da Fase 1. |
| `models.xml` | `/cidade/[slug]/marca/.../modelo/...` | n/a | Não. |

⚠️ Os comentários nos arquivos `cities.xml/route.ts`, `local-seo.xml/route.ts`, `opportunities.xml/route.ts` **estão desatualizados** vs Fase 1. Antes de mexer no pipeline, esses comentários precisam ser revisados (qualquer mudança que popule sem revisar pode introduzir os canonicals antigos no sitemap).

---

## 9. Hipóteses ranqueadas

| # | Hipótese | Probabilidade | Evidência a favor | Evidência contra | Como validar | Correção provável (sem implementar) |
|---|---|---|---|---|---|---|
| 1 | `seo_cluster_plans` está vazia em prod (worker nunca rodou) | **MUITO ALTA** | Backend `/api/public/seo/sitemap/type/<type>` retorna HTTP 200 com `data:[]` para 4 tipos diferentes — query roda mas filtra tudo. Sem migration cria a tabela → criada out-of-band → sem garantia de seed inicial. Worker do planner depende de `RUN_WORKERS=true`. | nenhuma | `SELECT COUNT(*), MAX(created_at) FROM seo_cluster_plans` no DB de prod (read-only) | Rodar o cluster-planner manualmente uma vez (script `npm run seo:plan` ou similar — verificar se existe; se não, criar invocação manual de `runClusterPlannerEngine`). |
| 2 | `RUN_WORKERS` não está `true` no web service de prod | **ALTA** | Worker só roda nesse env. Setup Render típico: web ≠ worker dyno. Sem worker dyno separado E sem env, planner nunca executa. | Se houver worker dyno separado, planner roda lá. | Conferir variáveis no painel Render do service `carros-na-cidade-core` (web). | Configurar `RUN_WORKERS=true` no web OU criar worker dyno separado no Render. |
| 3 | Migration ausente para `is_indexable` em `seo_publications` quebra `/sitemap.json` | **CONFIRMADA** | HTTP 500 com mensagem PostgreSQL "column sp.is_indexable does not exist" código 42703. `grep is_indexable src/database/migrations/*.sql` → 0 matches. | nenhuma | `\d seo_publications` no DB de prod. | Adicionar migration: `ALTER TABLE seo_publications ADD COLUMN IF NOT EXISTS is_indexable BOOLEAN DEFAULT TRUE`. |
| 4 | Schema drift entre `('planned','generated')` (repository público) vs `('published','planned')` (service canônico) | **MÉDIA-ALTA** | Dois caminhos backend usam SQL diferentes com filtros de status diferentes. Planner grava `'planned'` por default. `'published'` exige promotion via `seo-publishing.worker.js`. `'generated'` ninguém grava (não encontrei referência). | Filtro `'planned'` é comum aos dois → cobertura mínima existe. | `SELECT DISTINCT status FROM seo_cluster_plans` no DB. | Padronizar para um único conjunto de status — proposta: `('published','planned')` em ambos, e fazer planner promover para `'generated'` apenas se for um estado real do pipeline. |
| 5 | `API_URL` env não configurada no frontend Render | **MÉDIA** | `frontend/lib/seo/sitemap-client.ts#getApiBaseUrl()` lê só `API_URL` ou `NEXT_PUBLIC_API_URL`, divergindo de `lib/env/backend-api.ts` (que aceita 5 chaves). Se Render tem apenas `BACKEND_API_URL`, sitemaps falham silenciosamente sem afetar resto do frontend. | Outros módulos do frontend funcionam (auth, ads, regions). Mas eles usam `getBackendApiBaseUrl` (5 chaves), não o getter local do sitemap. | Listar envs no Render frontend (sem expor valores) — `Render Dashboard → frontend → Environment`. | Migrar `sitemap-client.ts` para usar `getBackendApiBaseUrl()` (helper compartilhado). |
| 6 | Cache CDN serviu `urlset` vazio que ficou stuck | **BAIXA-MÉDIA** | Cloudflare s-maxage=3600 + swr=86400 honra resposta. Se algum dia rodou vazio, fica cacheado por até 24h. | Mesmo com `purge` CDN, próxima request volta `data:[]` do backend. Cache não é a causa raiz, no máximo prolonga sintoma. | Forçar `curl -H "Cache-Control: no-cache" ...` ou `?nocache=$(date +%s)` para bypassar CDN. | Após corrigir #1/#2, purge Cloudflare. |
| 7 | Erro silencioso em `fetchJsonSafe` mascara timeout/rede | **BAIXA** | `fetchJsonSafe` engole tudo retornando `null`. `route.ts` engole de novo retornando `[]`. | Backend respondeu HTTP 200 nos 4 endpoints — não há timeout/rede. Falha silenciosa dobrada está mascarando dados vazios, não erro de rede. | Reproduzir o fetch local com mesma URL e logar payload. Se vier `data:[]`, confirma #1. | Adicionar log estruturado quando `data:[]` for retornado por `fetchPublicSitemapByType` (causa raiz fica visível). |
| 8 | `local-seo.xml` e `opportunities.xml` vazios são bug | **NULA** — POR DESIGN | Comentários explícitos no código (`buildLocalSeoTransitionEntries()`, `buildOpportunitiesTransitionEntries()`). Tests cobrem em `app/sitemaps/sitemap-transition.test.ts`. | n/a | n/a | Reavaliar se deveriam ser populados após Fase 1 (ver §8). |

---

## 10. Recomendação de correção (em fases, sem implementar)

### Fase 1 — corrigir o backend / dados

1. **Adicionar migration** `022_seo_publications_is_indexable.sql` com
   `ALTER TABLE seo_publications ADD COLUMN IF NOT EXISTS is_indexable BOOLEAN DEFAULT TRUE`.
   Escopo mínimo, sem mexer em service. Resolve o HTTP 500 do `/sitemap.json`.
2. **Auditar status real** em `seo_cluster_plans`:
   `SELECT cluster_type, status, COUNT(*) FROM seo_cluster_plans GROUP BY 1,2`
   no DB de prod (read-only). Decidir baseado no resultado:
   - Se `COUNT=0` → rodar planner manualmente uma vez no Render Shell.
   - Se há registros mas status diferente → padronizar status entre os dois SQLs do backend (decisão de arquitetura, não scope creep).
3. **Configurar `RUN_WORKERS=true`** no web service do Render OU criar worker dyno separado para rodar `cluster-planner.worker` em background.

### Fase 2 — alinhar sitemap às canônicas Fase 1

4. **Atualizar `cities.xml/route.ts#rewriteCityHomeEntries`**: trocar destino
   de `/comprar/cidade/[slug]` para `/carros-em/[slug]` (canônica intermediária Fase 1).
5. **Atualizar comentário e implementação de `local-seo.xml`**: Fase 1 fez
   `/carros-em/[slug]` e `/carros-baratos-em/[slug]` virarem **canônicas para si mesmas**
   — devem aparecer no sitemap. Mudar `buildLocalSeoTransitionEntries()` para emitir essas URLs.
6. **Manter `opportunities.xml` vazio** (continua correto — variante noindex que canonicaliza
   para outra). Atualizar comentário para refletir Fase 1 (`/carros-baratos-em/[slug]`).
7. **Atualizar `below-fipe.xml`**: rewrite de `/cidade/[slug]/abaixo-da-fipe` →
   `/carros-baratos-em/[slug]`.

### Fase 3 — observabilidade no pipeline

8. **Substituir try/catch silencioso** em cada `route.ts` por log estruturado
   (mantendo fallback `[]` para não quebrar build). Sem isso, próxima regressão
   silenciosa fica meses no escuro.
9. **Adicionar log em `fetchJsonSafe`** quando retorna `null` ou `data:[]`
   inesperadamente.
10. **Migrar `sitemap-client.getApiBaseUrl()`** para usar o helper compartilhado
    `getBackendApiBaseUrl()` de `lib/env/backend-api.ts` — elimina divergência
    de leitura de env.

### Fase 4 — testes

11. **Test integração** `frontend/lib/seo/sitemap-client.test.ts`: mock do fetch,
    valida que payload válido vira entries; payload `data:[]` vira `[]` sem warn.
12. **Test integração** por route (`app/sitemaps/<x>.xml/route.test.ts`): mock
    do `fetchPublicSitemapByType` retornando entries; valida XML renderizado.
13. **Test smoke contra prod** (opcional, fora de CI): script `npm run smoke:sitemaps`
    que verifica `> 0 bytes úteis` em cada sitemap não-design-vazio.

### Fase 5 — validar produção com curl

14. Após Fase 1+2 deployadas: `curl -sSL https://www.carrosnacidade.com/sitemaps/cities.xml | wc -c`
    deve subir de 107 para milhares de bytes.
15. Search Console: enviar `sitemap.xml` para reprocessamento; monitorar
    "URLs descobertas via sitemap" por 1 ciclo de re-crawl (~7 dias).

### Fase 6 — só depois pensar em Página Regional

16. Página Regional (`/carros-usados/regiao/[base-slug]` ou `/regiao/[slug]`) e
    sitemap regional ficam para depois — runbook
    [regional-page-rollout.md](./regional-page-rollout.md) já define os critérios
    de roll-out. Sem sitemap territorial funcionando, sitemap regional seria
    construído sobre fundação quebrada.

---

## 11. O que NÃO alterar ainda

- ❌ **Não criar Página Regional.** Pré-requisito é sitemap territorial sólido.
- ❌ **Não alterar layout.** Esta investigação não toca UI.
- ❌ **Não alterar planos comerciais.**
- ❌ **Não mexer em ranking** (`baseCityBoostExpr` etc.).
- ❌ **Não emitir 301** das rotas atuais para as canônicas. Canonical da Fase 1 já
  consolida sinal sem custo de irreversibilidade.
- ❌ **Não adicionar URLs manualmente nos sitemaps** antes da causa raiz.
  Hardcodar entries esconde o problema (planner não rodando) e cria
  dívida — entries ficam fora de sincronia com `seo_cluster_plans`,
  novas cidades nunca aparecem.
- ❌ **Não desabilitar `force-dynamic`** dos `route.ts` para "facilitar cache" —
  isso só deslocaria o problema para o build time.
- ❌ **Não popular `seo_cluster_plans` via SQL direto** sem entender o que o
  planner faz. Pode introduzir registros com `cluster_type` errado, paths
  fora da política de canonical, etc.

---

## 12. Próximo prompt recomendado

> **Tarefa:** Implementar a **Fase 1 (backend/dados)** desta investigação.
> Mudanças:
>
> 1. **Migration nova** `src/database/migrations/022_seo_publications_is_indexable.sql`
>    com `ALTER TABLE seo_publications ADD COLUMN IF NOT EXISTS is_indexable BOOLEAN
>    NOT NULL DEFAULT TRUE`. Aplicar idempotente. Sem `DOWN` (column add é seguro).
>    Resolve o HTTP 500 do `/sitemap.json`.
>
> 2. **Auditar `seo_cluster_plans` em prod via psql read-only** (sem alterar
>    dados). Documentar resultado num apêndice em
>    [sitemap-empty-investigation.md](./sitemap-empty-investigation.md):
>    `SELECT cluster_type, status, COUNT(*) FROM seo_cluster_plans GROUP BY 1,2;`
>    e `SELECT COUNT(*), MAX(created_at) FROM seo_cluster_plans;`.
>
> 3. **Decidir e documentar**, baseado no resultado da auditoria, qual destas
>    é a ação correta:
>
>    a. Se tabela vazia → rodar `runClusterPlannerEngine(200)` uma vez no
>       Render Shell do backend (instrução documentada num runbook novo
>       `docs/runbooks/cluster-planner-bootstrap.md`).
>
>    b. Se tabela cheia mas com status fora de `('planned','generated')` →
>       fazer migration leve que padronize status; OU patch no planner para
>       gravar status compatível com ambos os caminhos do backend.
>
>    c. Se há divergência entre `'planned','generated','published'` que sugere
>       máquina de estados incompleta → escrever runbook
>       `docs/runbooks/seo-cluster-plans-state-machine.md` documentando as
>       transições antes de tocar código.
>
> 4. **NÃO alterar:** geradores frontend (`app/sitemaps/*.xml/route.ts`),
>    canonical em código, layout, components, planos, ranking, Página Regional.
>    Migration é só de coluna ausente; tudo o mais é runbook + auditoria SQL.
>
> 5. **Testes:** se a migration mexer em schema, adicionar test que verifica a
>    migration aplicada em `tests/db/migrations.test.js` (se existir). Sem novos
>    testes de frontend nesta etapa — Fase 2 vai cobrir.
>
> **Antes de implementar:** ler `src/brain/engines/cluster-planner.engine.js`
> para entender o que o planner produz, e `src/modules/seo/publishing/`
> para entender a transição planned → published. Sem entendimento da máquina
> de estados, não há como decidir status.
