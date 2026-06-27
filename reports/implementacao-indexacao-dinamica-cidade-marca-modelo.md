# Implementação — Indexação Dinâmica de Páginas Cidade + Marca + Modelo

**Domínio:** https://www.carrosnacidade.com
**Data:** 2026-06-26
**Base:** [reports/auditoria-arquitetura-indexacao-seo-programatico.md](auditoria-arquitetura-indexacao-seo-programatico.md)
**Escopo:** SEO técnico / indexação. **Nenhuma alteração de layout, card, grid, filtro, header ou footer.**

---

## A. Sumário executivo

Endurecemos a indexação da família territorial **já existente** `/cidade/[slug]/marca/[brand]` e `/cidade/[slug]/marca/[brand]/modelo/[model]` — sem criar a rota duplicada `/comprar/[cidade]/[marca]/[modelo]`. O resultado:

- **Indexa só com estoque real:** o backend passou a decidir `robots` por `activeCount` (≥1 → `index,follow`; 0 → `noindex,follow`). Antes era `index,follow` *hardcoded* → páginas vazias eram indexáveis.
- **Resolução por slug canônico:** marca/modelo da URL são resolvidos para os valores **reais** de `ads.brand`/`ads.model` via `brandModelSlug` (NFD + hífen). Corrige `land-rover` → "Land Rover" (que nunca casava) e elimina o vazamento substring `gol` → "Golf".
- **Fallback nunca indexa nem aponta para a home:** `buildEmptyTerritorialPayload` agora emite `noindex,follow` + `canonical` self (com `noindexReason`). 404/429/5xx degradam para página vazia noindex em vez de 500 ou canonical `/`.
- **Sitemap por estoque:** `brands.xml`/`models.xml` passam a ser gerados de `ads` ativos (≥1), com `lastmod = MAX(updated_at)` e slug canônico — não mais de `seo_cluster_plans` sem validação.
- **404 real para cidade estruturalmente inválida:** o gate de middleware passou a cobrir o prefixo `/cidade/...`.
- **Defesa no frontend:** `shouldIndexTerritorialPage` nunca indexa se `hasActiveInventory===false`, `activeCount<=0`, `noindexReason` presente ou `robots` contém `noindex`.

**Testes:** 36 backend + 110 frontend novos/estendidos passando; suítes de regressão (393 frontend, read-models/seo/public backend) verdes. `tsc --noEmit` limpo; backend ESLint limpo; Prettier aplicado.

---

## B. Decisão de NÃO criar `/comprar/[cidade]/[marca]/[modelo]`

Mantida a recomendação da auditoria. A família `/cidade/.../marca/.../modelo/...` já existe e foi consolidada como a canônica. Criar `/comprar/...` seria a terceira representação da mesma busca (doorway/duplicação) e colidiria com o segmento `[slug]` em `app/comprar/*`. Se no futuro houver necessidade da URL `/comprar/...`, ela deve ser um **301** para a família canônica, em fase separada — nenhuma segunda página renderizável.

---

## C. Arquivos alterados

### Backend (`src/`)
| Arquivo | Mudança |
|---|---|
| `shared/utils/slugify.js` | + `brandModelSlug()` (fonte única de slug de marca/modelo) |
| `read-models/cities/territorial-cluster.logic.js` | **novo** — lógica pura: resolução por slug, agregação exata, `buildClusterSeo` (robots dinâmico) |
| `read-models/cities/territorial-cluster.repository.js` | **novo** — `getCityIdentity`, `getActiveBrandAggregates`, `getActiveModelAggregates` (agregados exatos por estoque ativo) |
| `read-models/cities/territorial-resolve.service.js` | **novo** — `resolveCityBrand`/`resolveCityModel` (repo + lógica) |
| `read-models/cities/city-brand.service.js` | reescrito p/ usar resolução, robots dinâmico, listagem exata (post-filtro por slug) |
| `read-models/cities/city-model.service.js` | idem |
| `read-models/cities/city-linking.service.js` | `toSlugPart` → `brandModelSlug` (links internos canônicos) |
| `read-models/cities/city-public.service.js` | slugs de marca/modelo dos links internos → `brandModelSlug` |
| `read-models/seo/territorial-inventory-sitemap.repository.js` | **novo** — queries de estoque ativo p/ sitemap brands/models |
| `read-models/seo/territorial-inventory-sitemap.service.js` | **novo** — `buildBrandEntries`/`buildModelEntries` (slug + dedupe) + loaders |
| `read-models/seo/sitemap-public.service.js` | `getPublicSitemapByType` usa estoque ativo p/ `city_brand`/`city_brand_model` |

### Frontend (`frontend/`)
| Arquivo | Mudança |
|---|---|
| `lib/seo/brand-model-slug.ts` | **novo** — espelho do `brandModelSlug` backend (teste de sincronia) |
| `lib/search/territorial-public.ts` | `TerritorialSeoPayload` + campos de indexação; `buildEmptyTerritorialPayload` noindex+canonical self; `fetchTerritorialPage` degrada sem 500/sem canonical `/` |
| `lib/seo/territorial-seo.ts` | `shouldIndexTerritorialPage` defensivo; `followable` por `nofollow` |
| `lib/middleware/territory-gate.ts` | gate estrutural do prefixo `/cidade/...` (404 real p/ slug inválido) |

### Testes
`territorial-cluster.logic.test.js`, `territorial-inventory-sitemap.test.js`, `brand-model-slug.test.js` (backend); `brand-model-slug.test.ts`, `territorial-public.test.ts`, `territory-gate.test.ts` (+cidade), `territorial-seo.test.ts` (+indexação) (frontend).

**Não tocados:** componentes de UI, cards, grids, `TerritorialResultsPageClient`, páginas `page.tsx` (continuam orquestradores finos — só consomem o payload já endurecido).

---

## D. Como `robots` é decidido agora

Fonte de verdade = **backend**, via `buildClusterSeo` ([territorial-cluster.logic.js](../src/read-models/cities/territorial-cluster.logic.js)):

```
activeCount >= 1 → robots "index,follow"   | indexable: true  | noindexReason: null
activeCount  = 0 → robots "noindex,follow" | indexable: false | noindexReason: "no_active_inventory"
```

O payload `seo` carrega `activeCount`, `hasActiveInventory`, `indexable`, `noindexReason`. O **frontend reforça** ([territorial-seo.ts](../frontend/lib/seo/territorial-seo.ts) `shouldIndexTerritorialPage`): nunca indexa se `robots` contém `noindex`, `indexable===false`, `hasActiveInventory===false`, `activeCount<=0`, `noindexReason` presente, `page>1`, `sort/order` ou filtro fora do allow-list.

---

## E. Como o canonical foi corrigido

- Páginas indexáveis: `canonical` self resolvido com slug canônico — ex. `https://www.carrosnacidade.com/cidade/atibaia-sp/marca/fiat/modelo/argo`.
- `buildClusterSeo` sempre seta `canonicalPath` self; **nunca `/`**.
- Fallback (`buildEmptyTerritorialPayload`): `canonicalPath` derivado do path da API (`apiRouteToPublicPath`) → self path. Eliminado o caso `seo:{}` → canonical `/`.

> `NEXT_PUBLIC_SITE_URL`: o canonical continua derivando de `getSiteUrl()`. **Confirmar em produção que aponta para `https://www.carrosnacidade.com` (com `www`)** — não alterado nesta fase (ver Riscos).

---

## F. Como o fallback vazio/erro foi corrigido

`fetchTerritorialPage` ([territorial-public.ts](../frontend/lib/search/territorial-public.ts)) não lança mais 500:
- **404** → `buildEmptyTerritorialPayload(routePath, "not_found")`
- **429 / 5xx / payload inválido** → `buildEmptyTerritorialPayload(routePath, "backend_unavailable")`

Em todos os casos: `robots: "noindex,follow"`, `canonicalPath` self, `indexable:false`, `activeCount:0`, `noindexReason`. A página renderiza vazia (sem mudança visual) e fora do índice.

---

## G. Como o sitemap brands/models foi filtrado

`getPublicSitemapByType` passou a gerar `city_brand`/`city_brand_model` de **estoque ativo** ([territorial-inventory-sitemap.service.js](../src/read-models/seo/territorial-inventory-sitemap.service.js)):
- Fonte: `ads JOIN cities`, `status='active'`, `GROUP BY` cidade+marca[+modelo], `HAVING COUNT(*) >= 1`.
- `loc` com slug canônico (`brandModelSlug`); `lastmod = MAX(ads.updated_at)`; dedupe por `loc` (soma total, mantém lastmod mais recente).
- Nenhuma página vazia/noindex entra. Demais tipos (`city_home`, `city_below_fipe`, …) seguem em `seo_cluster_plans`.

> **Atenção — `SITEMAP_PUBLIC_ENABLED` (default `false`).** Os endpoints `/api/public/seo/sitemap/*` continuam atrás do kill switch ([public-seo.controller.js](../src/modules/public/public-seo.controller.js)). **Não alteramos o default** (fora de escopo, exige autorização). Enquanto `false`, o backend responde 503 e o frontend serve `brands.xml`/`models.xml` **vazios**. Para emitir em produção: `SITEMAP_PUBLIC_ENABLED=true`. A geração já está correta para quando a flag subir.

---

## H. Como o matching marca/modelo foi padronizado

Antes: snapshot usava `LOWER(brand)=LOWER(slug)` (falhava p/ multi-palavra/acento) e a listagem usava `ILIKE '%termo%'` (vazava "Golf" p/ "gol") — fontes divergentes.

Agora, fonte única por **slug canônico**:
1. **Resolução** (`matchRowsBySlug`): entre os valores reais de `ads.brand`/`ads.model` da cidade, seleciona os cujo `brandModelSlug` é exatamente igual ao slug da URL. `slugify("Golf")="golf" ≠ "gol"`.
2. **Contagem/estatística** (`aggregateMatchedRows`): exata sobre os valores resolvidos; `avgPrice` ponderado por `sum_price/total`.
3. **Listagem**: `adsService.search` recebe o **valor real** resolvido e o resultado é **pós-filtrado** por `brandModelSlug(ad.brand)===brandSlug` (e modelo) — defesa final contra o ILIKE substring. Cabeçalho e lista deixam de divergir.

Sem migration de `brand_slug`/`model_slug`: a derivação é em runtime pelo helper único (espelhado backend/frontend, com teste de sincronia por fixtures).

---

## I. Como páginas SEM estoque se comportam

- **Cidade inexistente (estrutural):** 404 real no middleware (`territory-gate` prefixo `/cidade/...`).
- **Cidade inexistente (formato válido):** backend 404 → frontend degrada para 200 noindex,follow vazio (não indexa).
- **Cidade válida, marca/modelo sem anúncio ativo:** HTTP 200 `noindex,follow`, `noindexReason: "no_active_inventory"`, canonical self, **fora do sitemap**, estado vazio (sem mudança visual).

## J. Como páginas COM estoque se comportam

HTTP 200, `index,follow`, canonical self, JSON-LD `CollectionPage + ItemList` (inalterado), listagem exata por slug, e entram em `brands.xml`/`models.xml` (quando `SITEMAP_PUBLIC_ENABLED=true`).

---

## K. Testes executados

```
# Backend (vitest)
npx vitest run src/read-models src/modules/seo src/modules/public src/shared
→ 95 passed (inclui 36 novos: territorial-cluster.logic, territorial-inventory-sitemap, brand-model-slug)

# Frontend (vitest)
npx vitest run lib/seo lib/search lib/middleware
→ 393 passed (inclui brand-model-slug, territorial-public, territory-gate +cidade, territorial-seo +indexação)

# Tipos + formatação
(frontend) npx tsc --noEmit            → OK
(backend)  npx eslint <arquivos>       → OK
npx prettier --check <arquivos>        → OK (após --write)
```

Cobertura por critério: estoque≥1 indexa (B/territorial-seo), sem estoque noindex (logic/seo), inválido 404 (territory-gate), `gol`≠`Golf` (logic/slug/sitemap), fallback noindex+canonical self (territorial-public/seo), sitemap só com estoque + lastmod (sitemap), acentos (slug).

---

## L. Smoke recomendado (pós-deploy)

```bash
# 1. Identificar combinação com estoque (Render Shell)
#    SELECT c.slug, a.brand, a.model, COUNT(*) FROM ads a JOIN cities c ON c.id=a.city_id
#    WHERE a.status='active' GROUP BY 1,2,3 HAVING COUNT(*)>=1 ORDER BY 4 DESC LIMIT 20;

# 2. Página COM estoque → 200, canonical self, index,follow
curl -sSL https://www.carrosnacidade.com/cidade/{cidade}/marca/{marca}/modelo/{modelo} \
  | grep -iE '<link rel="canonical"|name="robots"'

# 3. Combinação SEM estoque → noindex,follow, canonical NÃO é home
curl -sS -o /dev/null -w "%{http_code}\n" \
  https://www.carrosnacidade.com/cidade/atibaia-sp/marca/ferrari/modelo/enzo
curl -sSL https://www.carrosnacidade.com/cidade/atibaia-sp/marca/ferrari/modelo/enzo \
  | grep -iE 'name="robots"|rel="canonical"'

# 4. Cidade estruturalmente inválida → 404 real
curl -sS -o /dev/null -w "%{http_code}\n" https://www.carrosnacidade.com/cidade/foo/marca/fiat

# 5. Sitemap (requer SITEMAP_PUBLIC_ENABLED=true) → só combinações com estoque
curl -sSL https://www.carrosnacidade.com/sitemaps/models.xml | head -40
```

Depois: Search Console → inspecionar uma URL válida, solicitar indexação, monitorar "comprar fiat argo em atibaia".

---

## M. Riscos remanescentes

1. **`SITEMAP_PUBLIC_ENABLED=false` (default):** `brands.xml`/`models.xml` servem vazio em prod até a flag subir. Decisão consciente fora desta fase.
2. **`NEXT_PUBLIC_SITE_URL` (www):** canonical depende da env; confirmar `https://www.carrosnacidade.com`. Não há enforcement de host.
3. **Cidade válida-mas-inexistente:** vira 200 noindex (soft-404) em vez de 404 real — aceitável (não indexa). 404 real exigiria checagem de existência no middleware (chamada de rede), evitada por custo/risco.
4. **Sitemap sem split 50k:** combinações cidade×marca×modelo podem crescer; ainda não há split spec-compliant por arquivo (herdado).
5. **`avgPrice` ponderado** assume `sum_price` confiável; outliers de preço não são tratados (fora de escopo).
6. **Conteúdo ainda template-based:** o texto por combinação é gerado por template; diferenciação real (estatística local no corpo) é a Fase 5 sugerida para evitar thin/doorway em escala.

---

## N. Próximas fases sugeridas

- **Fase 5 — Conteúdo diferenciado + JSON-LD enriquecido:** texto único por combinação (preço médio, nº ofertas, faixa de ano) e `Car`/`Offer` por item no ItemList.
- **Fase 6 — Monitoramento:** registrar a família como `publication_type` e adicionar ao smoke público; ativar UI `ai-health`.
- **Higiene SEO (auditoria seção 7):** canonical das 8 páginas institucionais; `limit` do `blog.xml`; revisão do `content.xml` (126 URLs incondicionais); confirmar noindex de `/admin` e `/painel`.
- **Decisão de produto:** ligar `SITEMAP_PUBLIC_ENABLED` quando quiser indexação ampla.

**Fim. Nenhuma alteração visual nas páginas publicadas.**
