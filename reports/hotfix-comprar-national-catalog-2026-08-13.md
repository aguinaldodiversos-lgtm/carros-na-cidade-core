# Hotfix P0 — `/comprar` volta a ser catálogo nacional

**Data de execução:** 2026-08-13
**Branch:** `codex/hotfix-comprar-national-catalog`
**Base:** `main` @ `0af847d6` (merge da Fase 3)
**Veredito:** **GO**

---

## 1. Causa raiz

`frontend/app/comprar/page.tsx` renderizava um **diretório territorial**, não um catálogo.

A rota chamava apenas:

```
fetchPublicCitySet()  →  buildNationalDirectory()
```

e imprimia dois blocos de links ("Estados com anúncios ativos" / "Cidades com anúncios ativos").
Ela **nunca** montava `BuyMarketplacePageClient` nem chamava `fetchAdsSearch`/`fetchAdsFacets`.
Resultado: HTTP 200, canonical correta, zero veículos — com 28 anúncios ativos no banco.

Isto é a **segunda volta** de um problema em duas etapas:

| Volta | Comportamento | Problema |
|---|---|---|
| 1ª | `/comprar` era redirector (cookie → UF → 307/meta-refresh) | mesma URL, destino diferente por visitante; não canonicalizável; sem cookie caía em SP |
| 2ª | `/comprar` virou diretório 200 autocanônico | matou o redirect, mas **tirou os carros da tela** |

A correção da 1ª volta estava certa no eixo SEO e errada no eixo de produto: trocou um
redirect por um menu. No celular — onde "Comprar" é item da bottom nav — o visitante
tocava em Comprar e precisava de **dois cliques territoriais** (estado → cidade) antes do
primeiro veículo.

### Por que os testes não pegaram

`app/comprar/page.test.ts` cobria canonical, título/descrição e "não lança NEXT_REDIRECT".
Nenhuma asserção dizia **"a rota mostra carros"**. A suíte ficou verde durante todo o
período do defeito. Este hotfix acrescenta exatamente essa asserção — em unitário e em E2E.

---

## 2. Arquitetura

### Antes

```
/comprar  →  diretório nacional (estados + cidades)
              ↓ clique
          /carros-usados/[uf]  ou  /carros-em/[cidade-uf]
              ↓
          primeiro carro
```

### Depois

```
/comprar            = CATÁLOGO NACIONAL   (vitrine, esta correção)
/carros-usados/[uf] = catálogo estadual canônico    (intocado)
/carros-em/[slug]   = catálogo municipal canônico   (intocado)
```

`/comprar` agora entrega, na ordem: H1 nacional → busca → action bar mobile / sidebar
desktop → contagem + ordenação → cards → paginação → diretório territorial compacto.

### Nenhum sistema paralelo

O catálogo é o **mesmo componente** das páginas territoriais:

```tsx
<BuyMarketplacePageClient variant="nacional" … />
```

`variant="nacional"` já existia em `CatalogPageHeader` (H1 "Carros usados no Brasil",
subtítulo "Refine por estado ou cidade", placeholder "…no Brasil", breadcrumb Home ›
Comprar, pill "Brasil") e em `VehicleGrid` (empty state). Nada de `NationalVehicleGrid`,
`NationalCatalog` ou `NationalFilters` foi criado. Cards, busca, filtros, action bar,
paginação, sidebar e responsividade são compartilhados.

---

## 3. Arquivos

| Arquivo | Mudança |
|---|---|
| `frontend/app/comprar/page.tsx` | reescrita: monta o catálogo; diretório desce para depois da paginação; `generateMetadata({searchParams})` pela política central |
| `frontend/lib/buy/national-catalog-loader.ts` | **novo** — loader SSR (irmão de `state-catalog-loader` / `city-catalog-loader`) |
| `frontend/lib/buy/territory-variant.ts` | **novo** `normalizeNationalFilters`; comentário desatualizado de `ComprarVariant` corrigido |
| `frontend/lib/middleware/canonical-redirects.ts` | `/comprar` entra em `CATALOG_PATHS` (normalização de query) |
| `frontend/app/comprar/page.test.ts` | reescrita ampliada (28 casos) |
| `frontend/lib/buy/national-catalog-loader.test.ts` | **novo** (11 casos) |
| `frontend/lib/buy/territory-variant.test.ts` | + bloco `normalizeNationalFilters` (6 casos) |
| `frontend/lib/middleware/canonical-redirects*.test.ts` | + `/comprar` como vitrine, normalização e alcance |
| `frontend/e2e/comprar-national-catalog.spec.ts` | **novo** (12 casos, desktop + mobile + 5 viewports) |

---

## 4. SSR

```
searchParams
    ↓ normalizeNationalFilters()   (apaga todo território)
    ↓ Promise.allSettled([ fetchAdsSearch, fetchAdsFacets ])   ← paralelo
    ↓ hasRealPrice + normalizePublicAd                          ← sanitização pública
    ↓ BuyMarketplacePageClient
```

A página roda `Promise.all([ loadNationalCatalogData, fetchPublicCitySet ])` — catálogo e
diretório são independentes e não somam latência. `export const dynamic = "force-dynamic"`.

**Prova de SSR:** o E2E faz `request.get("/comprar")` (HTTP cru, sem JS) e exige
`href="/veiculo/…"` no HTML. Um teste que só esperasse hidratação não distinguiria a
correção do defeito.

**Contagem:** vem de `pagination.total` da resposta. Nenhum `28` hardcodado — há teste
específico com `total: 7`.

---

## 5. Território

| Item | Valor |
|---|---|
| `filters.state` | ausente |
| `filters.city_slug` | ausente |
| `filters.city_slugs` | ausente |
| `filters.city_id` | ausente |
| `filters.city` | ausente |
| fallback por cookie | nenhum |
| fallback geo / `GeoToCityRedirect` | **não montado** (`enableGeoRedirect` omitido) |
| fallback SP | nenhum |
| fallback Atibaia / "primeira cidade" | nenhum |

`normalizeNationalFilters` **apaga** os cinco campos territoriais em vez de apenas não
preenchê-los: `parseAdsSearchFiltersFromSearchParams` os lê da query, e sem o delete
`/comprar?state=SP` renderizaria o catálogo de SP sob a URL nacional — a mesma doorway
page que `/comprar/cidade` já custou para remover.

O contexto sintético passado ao catálogo é `{ name: "Brasil", state: "", slug: "" }`.
`state` e `slug` vazios são deliberados: `FilterSidebar` deriva o select de Estado de
`filters.state || city.state` (vazio ⇒ "Todos os estados") e o link "Apenas <cidade>" de
`filters.city_slug || city.slug` (vazio ⇒ não renderiza).

**Estoque não redefine a rota.** Com 100% do acervo numa cidade, o H1 continua "Carros
usados no Brasil" e a consulta continua sem recorte. Coberto por teste dedicado.

As grafias legadas com território na query continuam saindo com **308 real no middleware**
(`decideComprarLegacyQueryRedirect`, passo 0c), antes de qualquer HTML:
`/comprar?state=sp → /comprar/estado/sp` e `/comprar?city_slug=X → /carros-em/X`.
Comportamento **preservado**, não alterado.

---

## 6. SEO

| URL | HTTP | canonical | robots |
|---|---|---|---|
| `/comprar` | 200 | `/comprar` | `index, follow` |
| `/comprar?page=2` | 200 | `/comprar?page=2` | `index, follow` |
| `/comprar?page=1` | 308 → `/comprar` | `/comprar` | `index, follow` |
| `/comprar?brand=Honda` | 200 | `/comprar` | `noindex, follow` |
| `/comprar?sort=price_asc` | 200 | `/comprar` | `noindex, follow` |
| `/comprar?sort=relevance` | 308 → `/comprar` | — | — |
| `/comprar?xpto=1` | 200 | `/comprar` | `noindex, follow` |
| `/comprar?utm_source=x` | 200 | `/comprar` | `index, follow` |

Nenhuma dessas linhas foi decidida aqui. `generateMetadata` usa
`decideSeoQueryPolicy` + `buildCanonicalUrlWithPolicy` + `buildRobotsWithPolicy` de
`lib/seo/query-policy.ts` — a **mesma** tabela de `/carros-em`, `/carros-usados/[uf]` e
`/comprar/estado/[uf]`. Há teste que compara a decisão da rota com a da política central
parâmetro a parâmetro, justamente para impedir que alguém escreva uma lista própria aqui.

`lib/seo/query-policy.ts` **não foi alterado** — nenhuma regressão possível nas outras
vitrines por esse eixo.

### Única mudança em helper compartilhado

`/comprar` entrou em `CATALOG_PATHS` (`lib/middleware/canonical-redirects.ts`). Necessário
porque a rota passou a ter a navegação interna do catálogo, que emite
`?sort=relevance&limit=50` a cada clique de filtro — sem normalização, cada clique
publicaria uma grafia nova da porta de entrada. O regex é `^\/comprar\/?$`: não toca
`/comprar/estado/*` (que já estava na lista por conta própria) nem nenhuma outra rota.
Testes de regressão das demais famílias continuam passando.

---

## 7. Catálogo

| Item | Estado |
|---|---|
| cards | `CatalogVehicleCard` compartilhado; link `/veiculo/[slug]` inalterado |
| busca | `SearchBar` do header, placeholder "…no Brasil"; `?q=` nacional |
| filtros | `FilterSidebar` (desktop) + gaveta mobile; nenhuma arquitetura nova |
| Estado (sidebar) | comportamento **preservado**: navega para `/carros-usados/[uf]`; "Todos os estados" → `/comprar` |
| Cidade | continua indo para a canônica `/carros-em/[slug]`; nenhum `?city_slug=` gerado |
| paginação | `CatalogPagination` + `buildPageHref` (href real, via política central) |
| diretório | preservado, **abaixo** da paginação, compacto (chips, sem stats/FAQ/segundo rodapé) |
| empty state | canônico do catálogo (`variant="nacional"`) |

O select de Estado da sidebar **já** navegava para `/carros-usados/[uf]` e usava `/comprar`
como "todos" — a decisão arquitetural existente confirma `/comprar` como a vitrine
nacional. Nada foi mudado ali.

---

## 8. Falha de backend ≠ Brasil vazio

`fetchAdsSearch` nunca lança: em erro devolve `{ok:false, data:[]}`. O loader expõe
`resultsOk` / `facetsOk` para que indisponibilidade não seja lida como "não há anúncios" —
o mesmo mecanismo que já escondeu uma queda de backend por semanas atrás de uma lista
vazia cacheada.

- facets quebradas **não** derrubam os resultados (política igual à das páginas
  estadual/municipal: facets vazias ⇒ sidebar sem números);
- conjunto público de cidades indisponível ⇒ o diretório **some**, em vez de afirmar
  "nenhuma cidade";
- as duas falhas são independentes: uma não derruba a outra nem a página.

Coberto por 4 testes.

---

## 9. Mobile

Validado em `390×844` (referência), `360×640`, `412×915`, `768×1024`, `1440×900`.

| Viewport | Overflow horizontal | Observação |
|---|---|---|
| 360×640 | não | — |
| 390×844 | não | fluxo alvo confirmado |
| 412×915 | não | — |
| 768×1024 | não | — |
| 1440×900 | não | layout sidebar + grid |

Fluxo medido em 390×844 (screenshot):

```
HEADER
Carros usados no Brasil
Refine por estado ou cidade
[ Buscar marca, modelo ou versão no Brasil ]
[ Ver perto ] [ Ordenar ] [ Filtrar ]
3 ofertas encontradas          Mais relevantes ⌄
[ CARRO ] [ CARRO ] [ CARRO ]
───────────────
Explore carros por localização
```

Nenhum clique territorial prévio. **Bottom nav:** `BuyPageShell` reserva `pb-20 md:pb-0`
internamente e o wrapper pós-catálogo replica o mesmo padding (padrão de
`/carros-em/[slug]`). Teste E2E mede a sobreposição real do último card contra o
`boundingBox` da nav — não confia no CSS.

Desktop 1440×900 (screenshot): H1 + busca no topo, sidebar de filtros à esquerda, contagem
+ grid de cards à direita, diretório compacto abaixo, footer.

> Screenshots capturados localmente (`comprar-desktop-1440x900.png`,
> `comprar-mobile-390x844.png`) contra a stack local com mock backend. Não versionados —
> `reports/` é markdown-only neste repositório.

---

## 10. Testes

### Baseline (antes da alteração, em `main`)

| Suíte | Resultado |
|---|---|
| frontend vitest | **5 falhas** / 2925 passes / 194 arquivos |
| — `app/seguranca/page.copy.test.ts` | 2 falhas (pré-existentes) |
| — `app/carros-usados/regiao/[slug]/page.config.test.ts` | 3 falhas (pré-existentes) |
| frontend typecheck | ✅ 0 |
| frontend lint | ✅ 0 |
| frontend build | ✅ 0 |

### Depois

| Suíte | Resultado |
|---|---|
| frontend vitest | **as MESMAS 5 falhas** / 2972 passes / 195 arquivos — **zero regressão nova** |
| frontend typecheck | ✅ 0 |
| frontend lint | ✅ 0 (`--max-warnings 0`) |
| frontend build | ✅ 0 (standalone verificado) |
| E2E `comprar-national-catalog.spec.ts` | ✅ 12/12 |
| backend vitest | ✅ 192 arquivos, 2841 passes, 1 skip |
| backend lint | 11 erros + 222 warnings — **baseline intocado** (nenhum arquivo backend alterado) |

### Cobertura nova (+47 casos unitários, +12 E2E)

- `/comprar` monta o catálogo compartilhado com `variant="nacional"`;
- anúncios vêm do SSR (unitário + HTML cru no E2E);
- total vem de `pagination.total`;
- facets repassadas;
- **sem** `state` / `city` / `city_slug` / `city_id` / `city_slugs`;
- **sem** SP, **sem** Atibaia, **sem** primeira cidade — inclusive com estoque de 1 cidade;
- território na query não recorta o SSR;
- `?q=`, `?brand=`, `?page=2`, `?page=2&brand=` nacionais;
- canonical/robots por parâmetro, comparados com a política central;
- diretório presente, com links de estado e cidade, **depois** do catálogo;
- backend indisponível não vira "Brasil vazio";
- `/comprar` é vitrine para a normalização de query, e nenhum guard o intercepta antes.

### O guard foi provado, não presumido

Restaurei a versão defeituosa da página (`git show HEAD:…/page.tsx`) e rodei o E2E contra
ela: **6 falhas, 1 skip, 5 passes** (só os testes de overflow passam — o diretório também
é responsivo). Restaurada a correção: 12/12.

Na primeira versão do spec, 3 casos **pulavam** em vez de falhar: o `test.skip` lia os
cards da própria página, então "zero cards" era interpretado como "seed vazio". Corrigido —
o skip agora consulta o **backend** (`GET /api/ads/search`), separando "ambiente sem seed"
de "página quebrada". Foi essa correção que levou o guard de 4 para 6 falhas detectadas.

---

## 11. Domínios protegidos

| Domínio | Estado |
|---|---|
| Fase 3 (`purchase_intents`, `purchase_intent_offers`) | **intocado** |
| Fase 3.1 (WhatsApp / visita) | **intocado** (nem está em `main` ainda) |
| `notifications` | intocado |
| payments / plans / subscriptions / Mercado Pago | intocado |
| `leads` | intocado |
| admin / workers / auth internals | intocado |
| Produto 2 | intocado |
| `/carros-em/[slug]` | intocado |
| `/carros-usados/[uf]` · `/carros-usados/regiao/[slug]` · `/comprar/estado/[uf]` | intocado |
| SEO local de Atibaia (`CityAuthoritySection`, `CompactCitySeoBlock`, FAQ, schema, raio, sitemaps, city gate, thresholds) | intocado |
| `lib/seo/query-policy.ts` | **não alterado** |

`git status` confirma: **7 arquivos modificados + 3 novos, todos em `frontend/`**.

---

## 12. Migrations

**Nenhuma.** Correção 100% de frontend/BFF/consulta. Nada tocou banco, schema ou
`migrations/`.

---

## 13. Pendências (fora do escopo deste hotfix)

1. **Baseline de testes vermelho.** As 5 falhas pré-existentes (`/seguranca` ×2, região
   `/carros-usados/regiao/[slug]` ×3) continuam. Não foram corrigidas aqui de propósito —
   são de outro domínio.
2. **Backend lint** com 11 erros no baseline. Idem.
3. **`?city_slugs=` em `/comprar`** não tem 308 próprio no middleware (só `city_slug` e
   `state` têm). Hoje é inofensivo — a política central o classifica como território
   (`noindex`) e o loader o apaga — mas o salto direto para a canônica seria mais limpo.
4. **Diretório limitado a 60 cidades** (`buildNationalDirectory` default). Suficiente hoje
   (1–3 cidades); quando o acervo crescer, vale revisitar o corte — o sitemap é quem
   enumera tudo.

---

## 14. Critérios de GO

| Critério | Status |
|---|---|
| `/comprar` HTTP 200 | ✅ |
| self-canonical na URL limpa | ✅ |
| identidade nacional | ✅ |
| nenhum redirect automático | ✅ |
| nenhum fallback SP / Atibaia / cookie / geo | ✅ |
| busca nacional funciona | ✅ |
| cards reais aparecem | ✅ |
| resultados via SSR | ✅ |
| só anúncios públicos elegíveis (`hasRealPrice` + `normalizePublicAd`) | ✅ |
| facets degradam sem derrubar resultados | ✅ |
| filtros / paginação / `variant="nacional"` reutilizados | ✅ |
| apenas 1 `<h1>` | ✅ |
| política SEO central usada | ✅ |
| filtros não criam indexação duplicada | ✅ |
| rotas territoriais intactas | ✅ |
| diretório secundário | ✅ |
| mobile 390 mostra carros sem clique territorial | ✅ |
| mobile sem overflow (5 viewports) | ✅ |
| bottom nav não cobre conteúdo | ✅ |
| desktop usa layout existente | ✅ |
| nenhum componente de catálogo paralelo | ✅ |
| nenhuma migration | ✅ |
| Fase 3 / 3.1 / payments / plans intactos | ✅ |
| sem regressão nova de teste | ✅ |
| typecheck / lint FE / build verdes | ✅ |

**VEREDITO: GO** para revisão e merge.
