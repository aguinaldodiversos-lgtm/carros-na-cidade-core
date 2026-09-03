# Fase 5.0 — Auditoria da Estrutura do Catálogo Territorial

**Data:** 2026-09-02
**Modo:** somente leitura. Nenhum arquivo de código alterado, nenhum limit tocado,
nenhum bloco removido, nenhum CSS, nenhuma migration, nenhum push.

---

## 1. Resumo executivo

As duas percepções do usuário estão corretas nos sintomas, mas as causas são
diferentes do que parecem:

**A paginação não está faltando — ela existe e está funcionando.** O componente
`CatalogPagination` é bem construído (links `<a href>` reais, `rel=prev/next`,
funciona sem JS). Ele não aparece porque `27 ÷ 50 = 1 página`, e a linha 114 diz
`if (safeTotalPages <= 1) return null`. **Comportamento intencional, não bug.**

**A sensação de "área técnica/SEO" é real e mensurável.** Medido em produção a
1440×900: os blocos pós-catálogo ocupam **1704px** (de 4979 a 6683), quase
**duas telas inteiras** de rolagem depois do último carro. No mobile são
**2509px = 3 rolagens completas**. E esse espaço todo produz apenas **5 links
internos**.

**Três defeitos concretos foram encontrados**, nenhum deles causado pelo volume
de conteúdo:

1. **Duas datas contraditórias na mesma página**, com 26 dias de diferença — uma
   é o timestamp real do inventário, a outra é `new Date()` do momento do render.
2. **Métricas duplicadas** entre `MarketOverview` e `CompactCitySeoBlock`: o
   número 27 e o "8 abaixo da FIPE" aparecem duas vezes, com rótulos diferentes;
   e dois preços diferentes (mediana R$ 72.500 vs média R$ 73.856) sem nenhuma
   explicação da diferença.
3. **O docstring do `CompactCitySeoBlock` contradiz o próprio código** — ele
   afirma "NÃO renderiza Stats (dl…)" e o componente renderiza exatamente isso.

O grid tem **3 colunas** no desktop (não 4), então o limit de 50 gera **17
linhas** de cards. Esse é o número que sustenta a sensação de "rolagem infinita
antes do conteúdo".

**Nada foi alterado.** As três arquiteturas propostas estão na §26–§28.

---

## 2. HEAD

```
main
190df7a59c3d6d091497d11a2307b222a222ea59   ✓ confere com o esperado

git status --short  → apenas os 4 arquivos protegidos:
  ?? frontend/public/images/lojista-detalhe-veiculo-referencia.png
  ?? frontend/public/images/lojista-oportunidades-veiculos-referencia.png
  ?? frontend/public/images/vender-para-loja.png
  ?? reports/fase-4-0-auditoria-venda-para-lojas-2026-08-15.md
```

Nenhuma branch criada. Produção consultada apenas por HTTP GET.

---

## 3. Rota real da captura — PROVADA

**É `/carros-em/atibaia-sp`.** Não é `/comprar`.

### Prova 1 — só uma página monta esses componentes

```
grep -rl "CityAuthoritySection|CompactCitySeoBlock" app/ --include=*.tsx
→ app/carros-em/[slug]/page.tsx        (resultado único)
```

### Prova 2 — os H2 batem exatamente

Medido em produção (`GET https://www.carrosnacidade.com/carros-em/atibaia-sp`):

```
H2 (7):
   1. Filtros
   2. O mercado de carros usados em Atibaia
   3. Marcas com carros à venda em Atibaia
   4. Modelos mais anunciados em Atibaia
   5. Quem está anunciando em Atibaia
   6. Sobre carros usados em Atibaia
   7. Perguntas frequentes sobre comprar carro usado em Atibaia
```

Os seis títulos da captura, na ordem da captura.

### Prova 3 — as outras rotas não têm nada disso

| rota | HTTP | canonical | robots | H2 | cards | tem "O mercado"? |
|---|---|---|---|---|---|---|
| **`/carros-em/atibaia-sp`** | 200 | self | index,follow | **7** | 27 | **SIM** |
| `/comprar` | 200 | self | index,follow | 2 | 27 | não |
| `/cidade/atibaia-sp` | 200 | → `/carros-em/atibaia-sp` | **noindex**,follow | 1 | 12 | não |
| `/carros-usados/sp` | 200 | self | index,follow | 2 | 27 | não |
| `/carros-baratos-em/atibaia-sp` | 200 | self | index,follow | — | — | não |
| `/carros-automaticos-em/atibaia-sp` | 200 | → `/carros-em/…` | noindex,follow | — | — | não |

`/comprar` tem só "Filtros" e "Explore carros por localização". **Mexer em
`/comprar` não mexeria em nada do que o usuário viu.**

---

## 4. `/comprar` × `/carros-em/[slug]`

| recurso | `/comprar` | `/carros-em/[slug]` |
|---|---|---|
| H1 | "Carros usados no Brasil" | "Carros usados em Atibaia - SP" |
| filtros | ✅ (mesmo componente) | ✅ (mesmo componente) |
| grid | ✅ (mesmo componente) | ✅ (mesmo componente) |
| paginação | ✅ (mesmo componente) | ✅ (mesmo componente) |
| SEO local | ❌ | ✅ `CompactCitySeoBlock` |
| autoridade local | ❌ | ✅ `CityAuthoritySection` (4 sub-blocos) |
| FAQ | ❌ | ✅ `FaqBlock` |
| nearby (raio) | ❌ | ✅ `NearbyRadiusSection` |
| JSON-LD | BreadcrumbList + ItemList | **CollectionPage + BreadcrumbList + FAQPage** |
| canonical | self, com política de query | self, com política de query |
| robots | index,follow | index,follow (≥3 anúncios) |
| HTML | 242 KB | **298 KB** (+23%) |
| TTFB medido | ~253 ms | **~1447 ms** (5,7×) |

O que difere é exclusivamente **o que vem depois do catálogo**. O topo é
literalmente o mesmo componente.

---

## 5. Component tree real (ordem de renderização)

`app/carros-em/[slug]/page.tsx` — `dynamic = "force-dynamic"`

```
page.tsx  (Server Component)
 ├─ <script ld+json>  CollectionPage (+ mainEntity ItemList)   ← jsonLd
 ├─ <script ld+json>  BreadcrumbList                            ← breadcrumbJsonLd
 ├─ <script ld+json>  FAQPage                                   ← faqJsonLd
 │
 ├─ BuyMarketplacePageClient          "use client"  ⚠ COMPARTILHADO (5 rotas)
 │   ├─ CatalogPageHeader             (H1, breadcrumb, busca)
 │   ├─ FilterSidebar                 (H2 "Filtros")
 │   ├─ CatalogActionBar
 │   ├─ VehicleGrid                   grid-cols-1 sm:2 lg:3
 │   └─ CatalogPagination             ← retorna null se totalPages <= 1
 │
 └─ <div className="bg-cnc-bg pb-20 md:pb-0">
     ├─ NearbyRadiusSection           (não renderizou em Atibaia)
     ├─ CityAuthoritySection          server, condicional a `overview`
     │   ├─ MarketOverview            H2 "O mercado…"        355px
     │   ├─ BrandDiscovery            H2 "Marcas…"           119px
     │   ├─ ModelDiscovery            H2 "Modelos…"          154px
     │   ├─ DealerDiscovery           H2 "Quem está…"        132px
     │   └─ NearbyCityDiscovery       (não renderizou)
     ├─ CompactCitySeoBlock           H2 "Sobre…"            241px
     │   └─ CityInventoryStats        ⚠ COMPARTILHADO
     └─ FaqBlock                      H2 "Perguntas…"        702px  ← maior bloco
```

`PublicFooter` vem do `app/layout.tsx`, fora desta página.

### Por componente

| componente | tipo | arquivo | dados | reutilizado em | removível isolado? |
|---|---|---|---|---|---|
| `BuyMarketplacePageClient` | client | `components/buy/` | `initialResults`, `initialFacets`, `initialFilters` | **5 rotas** | ❌ é o catálogo |
| `VehicleGrid` | client | `components/buy/` | props do pai | dentro do client | ❌ |
| `CatalogPagination` | client | `components/buy/` | `page`, `totalPages`, `buildHref` | dentro do client | ❌ |
| `NearbyRadiusSection` | server | `components/buy/` | `loadNearbyRadiusAds` | **só aqui** | ✅ |
| `CityAuthoritySection` | server | `components/seo/` | `loadCitySeoOverview` | **só aqui** | ✅ |
| `CompactCitySeoBlock` | server | `components/seo/` | `loadLocalSeoLanding` | **só aqui** | ✅ |
| `CityInventoryStats` | server | `components/seo/` | `LocalSeoLandingModel` | + `LocalSeoLanding` → `/carros-baratos-em`, `/carros-automaticos-em` | ⚠ cuidado |
| `FaqBlock` | server | `components/seo/` | `faqEntries` | **só aqui** | ⚠ ver §16 |

---

## 6. Data flow — as quatro cargas paralelas

```ts
const [model, catalog, nearbyResult, overviewResult] = await Promise.all([
  loadSeoModel(slug),                                    // → CompactCitySeoBlock
  loadCityCatalogData(slug, searchParams, {...}),        // → catálogo
  loadNearbyRadiusAds(slug, { radiusKm }),               // → NearbyRadiusSection
  loadCitySeoOverview(slug),                             // → CityAuthoritySection
]);
```

| loader | endpoint | cache frontend | cache backend | alimenta |
|---|---|---|---|---|
| `loadCityCatalogData` | `/api/ads/search` | `revalidate: 60`, tag `public-ads` | `cacheGet` 30 s | grid + paginação |
| `loadCitySeoOverview` | `/api/public/cities/[slug]/seo-overview` | `revalidate: 60`, tag `public-ads` | `cacheGet` 60 s | `CityAuthoritySection` |
| `loadNearbyRadiusAds` | `/api/public/cities/[slug]/radius` | `revalidate: 300`, tag `public-ads` | `cacheGet` 300 s | `NearbyRadiusSection` |
| `loadSeoModel` | territorial-page + `/api/ads/search` | herda dos fetches | — | `CompactCitySeoBlock` |

`loadSeoModel` é o mais caro: faz **2 fetches territoriais + 1 busca extra** para
calcular `avgPrice`.

---

## 7. Catálogo

- 27 anúncios ativos em Atibaia; **27 cards no DOM** e no HTML de SSR.
- Fonte: `/api/ads/search?city_slug=atibaia-sp&limit=50&page=1&sort=relevance`.
- `applyTerritoryFallback: false` — só anúncios da própria cidade (0 km).
- Defesa em profundidade: `normalizePublicAd` descarta ad sem slug ou preço 0.

---

## 8. Grid — medido, não inferido

`components/buy/VehicleGrid.tsx:183`

```
grid grid-cols-1 gap-3  sm:grid-cols-2 sm:gap-4  lg:grid-cols-3 lg:gap-5
```

| viewport | colunas | verificação |
|---|---|---|
| 1440 | **3** | `getComputedStyle(grid).gridTemplateColumns` → 3 valores ✓ |
| 1280 | 3 | mesmo breakpoint `lg` (≥1024) |
| 1024 | 3 | limiar `lg` |
| 768 | 2 | `sm` (≥640) |
| 390 | **1** | verificado: 1 coluna ✓ |

**Não existe breakpoint de 4 colunas.** O grid mede 4523px de altura para 27
cards (9 linhas × ~502px).

---

## 9. Paginação — existe e funciona

### Por que não aparece

`components/buy/CatalogPagination.tsx:114`

```ts
if (safeTotalPages <= 1) return null;
```

Backend: `totalPages = Math.max(1, Math.ceil(total / limit))` →
`ceil(27 / 50) = 1`.

Verificado no DOM de produção: `paginacaoNoDom: "AUSENTE"`, e **zero links
`?page=N`** no HTML.

> **Classificação: COMPORTAMENTO ATUAL INTENCIONAL. Não é bug.**

### Qualidade do componente (auditado, não alterado)

| aspecto | estado |
|---|---|
| links reais `<a href>` | ✅ usa `<Link>` do Next com `href` |
| `rel="prev"` / `rel="next"` | ✅ presentes |
| página 1 = URL limpa | ✅ nunca emite `?page=1` |
| `page` fora de `[1, totalPages]` | ✅ não vira link (`clampPage`) |
| funciona sem JS | ✅ por construção (documentado no próprio arquivo) |
| preserva filtros/raio | ✅ `buildHref` fica no caller, que conhece os filtros |
| janela de páginas | ✅ `buildPageSequence`, máx. visível com deslocamento |

O docstring do arquivo registra que a versão anterior era `<button onClick>` sem
`href` — "para o Googlebot, a página 2 não existia". Já foi corrigido.

---

## 10. Limit atual

**50.** Cadeia completa:

```
lib/search/ads-search-url.ts:4   PUBLIC_ADS_SEARCH_LIMIT_MAX = 50
lib/search/ads-search-url.ts:7   DEFAULT_COMPRAR_CATALOG_LIMIT = PUBLIC_ADS_SEARCH_LIMIT_MAX
lib/buy/territory-variant.ts:210 limit: parsed.limit ?? DEFAULT_COMPRAR_CATALOG_LIMIT
lib/buy/city-catalog-loader.ts:74 limit: filters.limit ?? DEFAULT_COMPRAR_CATALOG_LIMIT
```

### Respostas objetivas

| # | pergunta | resposta |
|---|---|---|
| 1 | page size real | **50** |
| 2 | onde é definido | `lib/search/ads-search-url.ts:4` |
| 3 | frontend e backend concordam? | **sim** — 50 é o default do front e o **teto** do back |
| 4 | é 50? | sim |
| 5 | existe override? | sim, `?limit=` na URL, mas **não há controle na UI** |
| 6 | existe env? | **não** |
| 7 | existe query `limit`? | sim, aceita e é clampada |
| 8 | controle de limit na UI? | **não** (verificado em `components/buy/`) |
| 9 | backend tem cap? | **sim**, `ADS_FILTER_LIMITS.LIMIT_MAX = 50`; default próprio 20; `PAGE_MAX = 1000` |
| 10 | SSR já retorna só uma página? | **sim** — sempre `page=1, limit=50` no primeiro render |

### ⚠️ Dívida encontrada: o 50 está escrito duas vezes

```
lib/search/ads-search-url.ts:4   PUBLIC_ADS_SEARCH_LIMIT_MAX = 50
lib/seo/query-policy.ts:59       DEFAULT_CATALOG_LIMIT = 50      ← cópia literal
```

O comentário em `query-policy.ts` diz "Espelha `DEFAULT_COMPRAR_CATALOG_LIMIT`",
mas **não importa** o valor. Mudar um sem o outro faz o `?limit=` deixar de ser
removido da URL normalizada — e a política de canonical passa a tratar o default
como filtro. **Qualquer mudança de limit precisa tocar os dois arquivos.**

---

## 11. Política page/canonical

`lib/seo/query-policy.ts` — auditada, não alterada.

| situação | index | canonical |
|---|---|---|
| URL limpa | ✅ index | self, limpa |
| `?page=1` | ✅ index | self **limpa** (nunca emite `?page=1`) |
| `?page=N` (N≥2), sem filtro | ✅ **index** | **self com `?page=N`** |
| `?page=N` + filtro/sort/território | ❌ noindex | URL limpa |
| `?limit=50` (default) | — | **removido** da query normalizada |
| `?limit=X` (≠ default) | não desindexa | não entra na canonical |

`const index = !hasSorting && !hasFilter && !hasTerritory;`
`const canonicalQuery = index && page >= 2 ? \`page=${page}\` : "";`

### Consequência de mudar o limit

Hoje: 27 anúncios → **1 URL indexável** (a limpa).
Com limit 24 → 2 páginas → **2 URLs indexáveis** (`/carros-em/atibaia-sp` e
`?page=2`). Redistribui os anúncios: os 3 últimos saem da página 1.

Isso **não é ruim por si** — o docstring da própria política diz que `page` é "a
única categoria que gera página PRÓPRIA … é justamente o acervo antigo". Mas é
uma mudança de superfície indexável que precisa ser decidida, não sofrida.

---

## 12. Simulação de limit — 27 anúncios, grid de 3 colunas

| LIMIT | TOTAL PAGES | CARDS PÁG. 1 | CARDS ÚLT. PÁG. | LINHAS DESKTOP (÷3) | URLs indexáveis |
|---|---|---|---|---|---|
| **50 (atual)** | **1** | **27** | **27** | **17** | 1 |
| 40 | 1 | 27 | 27 | 14 | 1 |
| 30 | 1 | 27 | 27 | 10 | 1 |
| 24 | 2 | 24 | 3 | 8 | 2 |
| 20 | 2 | 20 | 7 | 7 | 2 |
| 18 | 2 | 18 | 9 | **6** | 2 |
| 16 | 2 | 16 | 11 | 6 (5,3) | 2 |
| 12 | 3 | 12 | 3 | **4** | 3 |

Múltiplos exatos de 3 (última linha sempre cheia): **12, 18, 24, 30**.

---

## 13. Blocos pós-catálogo — mapeamento

| # | bloco visível | componente | fonte | links | JSON-LD | altura desktop |
|---|---|---|---|---|---|---|
| A | O mercado de carros usados em Atibaia | `MarketOverview` | `seo-overview` | **0** | — | 355px |
| B | Marcas com carros à venda em Atibaia | `BrandDiscovery` | `seo-overview` | **3** | — | 119px |
| C | Modelos mais anunciados em Atibaia | `ModelDiscovery` | `seo-overview` | **1** | — | 154px |
| D | Quem está anunciando em Atibaia | `DealerDiscovery` | `seo-overview` | **1** | — | 132px |
| E | Sobre carros usados em Atibaia | `CompactCitySeoBlock` → `CityInventoryStats` | `local-seo-data` | **0** | — | 241px |
| F | Perguntas frequentes… | `FaqBlock` | `faq.ts` | **0** | **FAQPage** | **702px** |

Todos são **Server Components**. Nenhum é client.

---

## 14. Fonte dos números — rastreada até o SQL

`src/read-models/cities/city-seo-overview.repository.js`, uma única query sobre
`ads` com `status = 'active'`:

| campo | SQL | usado em |
|---|---|---|
| `activeAds` | `COUNT(*)` | A |
| `activeDealers` | `COUNT(DISTINCT a.advertiser_id)` | A (texto) |
| `medianPrice` | `percentile_cont(0.5) WITHIN GROUP (ORDER BY a.price)` | A |
| `avgPrice` (overview) | `AVG(a.price)` | calculado, **não exibido** em A |
| `minPrice`/`maxPrice` | `MIN`/`MAX(a.price)` | A (texto) |
| `belowFipeCount` | `COUNT(*) FILTER (WHERE a.below_fipe = true)` | A |
| `automaticCount` | `COUNT(*) FILTER (WHERE a.transmission = 'automatico')` | A |
| `inventory.updatedAt` | **`MAX(a.updated_at)`** | A (rodapé "atualizados em") |
| `brands` / `models` / `dealers` | agregações por marca/modelo/anunciante | B, C, D |

Bloco E vem de outro caminho: `loadLocalSeoLanding` →
`fetchCityTerritorialPage` + `fetchAdsSearch`; `avgPrice` é calculado **no
frontend** por `ensureAvgPrice`.

Nenhum dos dois usa `paused`, `deleted` ou `blocked`.

---

## 15. ⚠️ DUAS DATAS CONTRADITÓRIAS — defeito confirmado

Extraído do HTML de produção, ambas no SSR, ~740px de distância:

```
"Dados do estoque anunciado no Carros na Cidade, atualizados em 08/08/2026."
"Dados atualizados em 3 de setembro de 2026."
```

**26 dias de diferença, sobre o mesmo inventário.**

| bloco | origem | honesto? |
|---|---|---|
| A `MarketOverview` | `buildInventoryTimestampLabel` → `overview.inventory.updatedAt` → **`MAX(a.updated_at)`** | ✅ é a data real do dado |
| E `CityInventoryStats` | `formatToday()` → **`new Date()`** no render | ❌ é a data de HOJE, sempre |

`CityInventoryStats.tsx:26-33` comenta: *"Página é `force-dynamic`, então reflete
o dia da renderização — sinal de frescor honesto."* A intenção era boa, mas o
efeito não é: com `force-dynamic`, **essa data muda todo dia mesmo que nenhum
anúncio mude**, e contradiz a data real exibida logo acima.

Formatos também divergem: `08/08/2026` vs `3 de setembro de 2026`.

---

## 16. Duplicidade de informação — confirmada

Extraído do DOM de produção:

| métrica | A `MarketOverview` | E `CompactCitySeoBlock` |
|---|---|---|
| contagem | **Veículos anunciados: 27** | **Anúncios ativos: 27** |
| preço | **Preço mediano: R$ 72.500** | **Preço médio: R$ 73.856** |
| faixa | (no parágrafo: "R$ 57.900 a R$ 103.900") | **Faixa de preço** (célula própria) |
| abaixo FIPE | **Abaixo da FIPE: 8** | **Abaixo da FIPE: 8 (30%)** |
| câmbio automático | **8** | — |
| marca líder | "As marcas com mais ofertas são Fiat, Chevrolet e Volkswagen" | "Fiat é a marca mais anunciada na cidade" |

### Os dois preços são legítimos, mas indistinguíveis para o usuário

Verifiquei numericamente contra a API:

```
27 anúncios ativos
MÉDIA   de todos os 27 = R$ 73.856   ← exibido como "Preço médio"
MEDIANA de todos os 27 = R$ 72.500   ← exibido como "Preço mediano"
```

Ou seja: **ambos estão corretos e ambos cobrem o inventário inteiro.** Não há
erro de cálculo. O problema é de comunicação — "mediano" e "médio" a 740px de
distância, sem nenhuma frase explicando por que os números diferem, leem-se como
contradição.

> Registro de método: minha leitura inicial do código sugeria que `avgPrice`
> viesse de uma amostra de 10 anúncios (`sampleAds.slice(0, 10)`). A verificação
> numérica mostrou que não — o valor bate exatamente com a média dos 27, ou seja,
> o caminho de fallback (`limit: 60`) é o que roda. **Fica registrado como risco
> latente**, não como defeito vivo: se `recentAds` vier com preços, `avgPrice`
> passa a ser a média de 10 anúncios apresentada como estatística da cidade.

### ⚠️ Docstring contradiz o código

`CompactCitySeoBlock.tsx` linhas 20-24 afirmam:

```
 * NÃO renderiza:
 *   - Stats (dl com totalAds / catalogTotalAds / avgPrice).
```

E o corpo do componente (linha ~70) renderiza `<CityInventoryStats showIntro />`,
que é exatamente um `<dl>` com `totalAds` e `avgPrice`. O comentário descreve uma
versão anterior. **Quem for redesenhar vai ler a promessa errada.**

---

## 17. FAQ e o acoplamento com o schema

```
buildCityInventoryFaqEntries(...)  ← perguntas com números do inventário
buildCityFaqEntries(...)           ← perguntas de processo (fixas)
        ↓
   faqEntries  ──┬──→ buildFaqPageJsonLd(faqEntries)  → <script FAQPage>
                 └──→ <FaqBlock entries={faqEntries}> → HTML visível
```

**A mesma variável alimenta os dois.** O comentário na página é explícito: *"O
FAQPage JSON-LD só é emitido porque o FaqBlock abaixo renderiza as MESMAS
perguntas (visível)."*

| cenário futuro | efeito no schema |
|---|---|
| FAQ **removida** do HTML | `FAQPage` **precisa sair junto** — schema sem conteúdo visível viola a diretriz do Google |
| FAQ **colapsada** (`<details>`, accordion) | ✅ **permitido** — o Google aceita FAQ em accordion desde que o conteúdo esteja no HTML |
| FAQ **movida** para outro ponto da página | ✅ sem efeito no schema |
| FAQ com **menos perguntas** | ✅ desde que `faqEntries` seja a mesma lista dos dois lados |

> **A FAQ é o maior bloco da página: 702px desktop / 780px mobile.** Colapsá-la é
> a única mudança que devolve ~700px sem tocar em SEO.

---

## 18. JSON-LD emitido

| # | tipo | origem | notas |
|---|---|---|---|
| 1 | `CollectionPage` | `buildLocalSeoJsonLd(model)` | inclui `about` (Place), `isPartOf`, `areaServed` quando há vizinhança |
| 1b | ↳ `mainEntity: ItemList` | sobrescrito na página | **`numberOfItems` = itens realmente renderizados** (máx. 20), não o total |
| 2 | `BreadcrumbList` | `buildLocalSeoBreadcrumbJsonLd(model)` | Início → UF → Cidade |
| 3 | `FAQPage` | `buildFaqPageJsonLd(faqEntries)` | acoplado ao `FaqBlock` |

Confirmado em produção: **3 blocos**, sem duplicidade. O comentário na página
registra que já houve dois `ItemList` na mesma URL com contagens diferentes —
corrigido na Fase 3, Etapa 44.

---

## 19. Internal linking — a métrica que decide a arquitetura

Contagem no DOM de produção, por bloco:

| bloco | links internos |
|---|---|
| A `MarketOverview` | **0** |
| B `BrandDiscovery` | **3** — `/cidade/atibaia-sp/marca/{fiat,chevrolet,volkswagen}` |
| C `ModelDiscovery` | **1** — `/cidade/atibaia-sp/marca/chevrolet/modelo/onix` |
| D `DealerDiscovery` | **1** — `/lojas/ittmotors-122` |
| E `CompactCitySeoBlock` | **0** |
| F `FaqBlock` | **0** |
| **TOTAL** | **5** |

**1704px de página (25% do total, 1,9 viewport) produzindo 5 links.**

Todos os 5 respondem **200 + `index, follow` + canonical self** (verificado na
auditoria da Fase 4). Os 4 territoriais são **exatamente as URLs que
`brands.xml` e `models.xml` já publicam** — ou seja, a descoberta já está
garantida pelo sitemap; o valor marginal desses links é fluxo de autoridade
interna, não descoberta.

### Limiares — por que a maioria dos chips é texto morto

| bloco | chips totais | com link | texto puro |
|---|---|---|---|
| B marcas | 9 | **3** | **6** |
| C modelos | 15 | **1** | **14** |

**20 dos 24 chips são texto inerte.** O limiar é `getSeoThreshold(BRAND/MODEL)`
= `getCityIndexMinAds()` = **3 anúncios ativos** (auditado na Fase 4). Marca ou
modelo com menos de 3 anúncios aparece como texto, não como link — porque a
landing correspondente seria thin content e é `noindex`.

Isso é **correto por design**, mas significa que os blocos B e C ocupam 273px
para entregar 4 links.

---

## 20. NearbyRadiusSection

- Renderiza **antes** dos blocos SEO (logo após o catálogo).
- Em Atibaia **não renderiza** — nenhuma cidade vizinha com estoque
  (`nearbyResult.coverageCities` vazio).
- Cards próprios (`grid-cols-1 sm:2 lg:3`), com procedência e "~X km".
- **Não tem paginação própria** e **não entra na contagem principal**
  (`initialResults.pagination.total`).
- Risco de confusão com o catálogo principal: existe em cidades com vizinhança,
  mas os cards carregam rótulo de cidade + distância, o que os distingue.

---

## 21. Ordem visual e altura — desktop 1440×900

Página total: **7189px** (≈ 8 viewports).

| # | bloco | topo (px) | altura (px) |
|---|---|---|---|
| 1 | header | 0 | 69 |
| 2 | H1 | 138 | 45 |
| 3 | filtros (H2) | 395 | — |
| 4 | **grid de cards** | **408** | **4523** |
| 5 | paginação | — | **0 (ausente)** |
| 6 | próximos (nearby) | — | **0 (ausente)** |
| 7 | mercado | 4979 | 355 |
| 8 | marcas | 5334 | 119 |
| 9 | modelos | 5453 | 154 |
| 10 | lojas | 5607 | 132 |
| 11 | cidades próximas | — | 0 (ausente) |
| 12 | sobre | 5739 | 241 |
| 13 | **FAQ** | 5981 | **702** |
| 14 | footer | 6683 | 506 |

**Bloco SEO total: 4979 → 6683 = 1704px = 1,9 viewport.**
Como fração da página sem o rodapé: **1704 / 6683 = 25,5%**.

---

## 22. Mobile — 390×844

Página total: **9545px** (≈ 11 viewports). Grid com **1 coluna**.

| medida | valor |
|---|---|
| fim dos cards | 5448px |
| topo do footer | 7957px |
| **SEO depois dos cards** | **2509px** |
| **rolagens de SEO** | **3,0 telas cheias** |
| altura da FAQ | **780px** |

São **três rolagens completas** de conteúdo SEO entre o último carro e o rodapé
— e o rodapé azul de 6 colunas vem depois. É exatamente a sensação de
"segundo e terceiro rodapé" que o briefing de 2026-05-22 tentou eliminar e que
voltou pela via da `CityAuthoritySection` (Fase 3).

---

## 23. Performance

| rota | TTFB medido | HTML |
|---|---|---|
| `/comprar` | ~253 ms | 242 KB |
| **`/carros-em/atibaia-sp`** | **~1447 ms** | **298 KB** |

**5,7× mais lento.** A rota faz 4 cargas em paralelo, e `loadSeoModel` sozinho
dispara 2 fetches territoriais + 1 busca extra de preço.

Os blocos pós-catálogo custam:
- **+56 KB de HTML** (+23%)
- **+2 endpoints** (`seo-overview`, `radius`)
- os 3 fetches de `loadSeoModel`

`Promise.all` evita serialização, mas o TTFB é limitado pelo **mais lento** dos
quatro — e todos batem no backend do Render (cold start possível).

---

## 24. SSR vs hidratação

Verificado com `curl` (sem JavaScript). No HTML cru já vêm:

| elemento | presente no SSR? |
|---|---|
| 27 cards `/veiculo/…` | ✅ |
| H1 | ✅ (1 único) |
| 5 links de marca/modelo/loja | ✅ |
| FAQ visível | ✅ |
| 3 blocos JSON-LD | ✅ |
| ambas as datas | ✅ (o defeito da §15 é servido ao crawler) |
| paginação | ausente — porque `totalPages = 1`, não por hidratação |

**Nada depende de JavaScript para SEO.** A página é `force-dynamic` e o
`BuyMarketplacePageClient` recebe `initialResults` já resolvido no servidor.

---

## 25. Estados de erro

| falha | comportamento | avaliação |
|---|---|---|
| `loadCitySeoOverview` indisponível | `overviewResult.status !== "ok"` → `overview = null` → `CityAuthoritySection` **não renderiza** | ✅ some limpo; nunca mostra "0 veículos" |
| `loadNearbyRadiusAds` vazio/falha | `NearbyRadiusSection` retorna `null` | ✅ |
| `loadSeoModel` falha | `loadLocalSeoLanding` chama `notFound()` no `catch` | ⚠️ **derruba a página inteira** |
| `loadCityCatalogData` falha | catálogo vazio | — |

⚠️ **Achado:** `loadSeoModel` alimenta apenas o bloco E (`CompactCitySeoBlock`) e
a metadata — mas sua falha vira `notFound()`, ou seja, **404 na página inteira**.
Um bloco SEO auxiliar pode derrubar o catálogo transacional. Os outros três
loaders degradam corretamente; este não. Não corrigido nesta fase.

---

## 26. Risco de componente compartilhado

| componente | rotas que importam | risco |
|---|---|---|
| **`BuyMarketplacePageClient`** | `/carros-em/[slug]`, `/carros-usados/regiao/[slug]`, `/carros-usados/[uf]`, `/comprar/estado/[uf]`, `/comprar` | 🔴 **ALTO** — 5 rotas |
| `VehicleGrid` | dentro do client acima | 🔴 mesmas 5 |
| `CatalogPagination` | dentro do client acima | 🔴 mesmas 5 |
| `FilterSidebar` | dentro do client acima | 🔴 mesmas 5 |
| `CityInventoryStats` | `CompactCitySeoBlock` + `LocalSeoLanding` → `/carros-baratos-em`, `/carros-automaticos-em` | 🟡 **MÉDIO** |
| `CityAuthoritySection` | **só** `/carros-em/[slug]` | 🟢 baixo |
| `CompactCitySeoBlock` | **só** `/carros-em/[slug]` | 🟢 baixo |
| `FaqBlock` | **só** `/carros-em/[slug]` | 🟢 baixo |
| `NearbyRadiusSection` | **só** `/carros-em/[slug]` | 🟢 baixo |

> **Consequência prática:** mexer em grid, limit ou paginação atinge **5 rotas**.
> Mexer nos blocos SEO (A–D, F) atinge **só a página da cidade**. Mexer em
> `CityInventoryStats` (bloco E) atinge também as duas landings irmãs.

---

## 27. Rotas irmãs — quem compartilha o quê

Verificado por HTTP em produção:

| rota | "O mercado…" | "Sobre carros usados…" | FAQ | grid/paginação |
|---|---|---|---|---|
| `/carros-em/[slug]` | ✅ | ✅ | ✅ | ✅ |
| `/carros-baratos-em/[slug]` | ❌ | ❌ | ✅ (própria) | via `LocalSeoLanding` |
| `/carros-automaticos-em/[slug]` | ❌ | ❌ | ❌ | via `LocalSeoLanding` |
| `/cidade/[slug]` | ❌ | ❌ | ❌ | 12 cards, noindex |
| `/cidade/[slug]/marca/[brand]` | ❌ | ❌ | ❌ | própria |

**Os blocos A–D e F são exclusivos da página da cidade.**

---

## 28. Testes existentes

| arquivo | protege |
|---|---|
| `components/buy/CatalogPagination.test.tsx` | links reais, `rel`, clamp, página 1 limpa |
| `components/seo/CityAuthoritySection.test.tsx` | render dos sub-blocos |
| `components/seo/CompactCitySeoBlock.test.tsx` | render condicional |
| `lib/seo/query-policy.test.ts` | index/canonical por categoria de query |
| `lib/seo/faq.test.ts` | construção das entradas de FAQ |
| `app/carros-usados/regiao/[slug]/region-faq-entries.test.ts` | FAQ regional |

### Gaps

| sem teste | consequência |
|---|---|
| `VehicleGrid` | número de colunas não é travado — mudar `lg:grid-cols-3` não quebra nada |
| `BuyMarketplacePageClient` | integração catálogo↔paginação sem cobertura |
| `CityInventoryStats` | as métricas do bloco E não são travadas |
| `FaqBlock` | o acoplamento FAQ visível ↔ FAQPage **não é testado** |
| coerência A × E | nada impede as duas datas divergentes ou as métricas duplicadas |
| `DEFAULT_CATALOG_LIMIT` × `PUBLIC_ADS_SEARCH_LIMIT_MAX` | nada trava a igualdade dos dois 50 |

---

## 29. Testes necessários DEPOIS (propostos, não implementados)

1. 27 anúncios / limit atual → `CatalogPagination` ausente.
2. `total > limit` → paginação presente, `totalPages` correto.
3. `page=2` → canonical self com `?page=2`, `rel=prev` para a limpa.
4. última página → sem `rel=next`.
5. filtro + `page` → `noindex`, canonical limpa.
6. mobile 390 → 1 coluna; desktop 1440 → 3 colunas (**trava do grid**).
7. blocos SEO presentes quando há `overview`.
8. blocos SEO ausentes quando `overview` falha — **e catálogo continua 200**.
9. FAQ visível e `FAQPage` com a **mesma** lista de perguntas.
10. os 5 links internos continuam existindo e 200.
11. exatamente **1** `<h1>`.
12. zero href 404 na página renderizada.
13. **`DEFAULT_CATALOG_LIMIT === PUBLIC_ADS_SEARCH_LIMIT_MAX`**.
14. **as duas datas ("atualizados em") ou coincidem ou só uma existe.**

---

## 30. Avaliação por bloco — sinal, não volume

| bloco | ajuda ranking/discovery? | é único? | data-driven? | duplicado? | pode condensar? | pode colapsar? |
|---|---|---|---|---|---|---|
| A mercado | indireto (conteúdo único) | ✅ | ✅ | ⚠️ métricas repetem em E | ✅ | ✅ |
| B marcas | ✅ 3 links canônicos | ✅ | ✅ | ❌ | ✅ | ⚠️ links devem ficar no HTML |
| C modelos | ✅ 1 link canônico | ✅ | ✅ | ❌ | ✅ | ⚠️ idem |
| D lojas | ✅ 1 link | ✅ | ✅ | ❌ | ✅ | ⚠️ idem |
| E sobre | ⚠️ pouco — 0 links | ❌ **repete A** | ✅ | ✅ **sim** | ✅✅ | ✅ |
| F FAQ | ✅ FAQPage rich result | ✅ | parcial | ❌ | ⚠️ | ✅ **accordion é permitido** |

**Conclusão da §30:** o único bloco cujo conteúdo é majoritariamente redundante é
o **E**. Os blocos B/C/D carregam os 5 links. O bloco A carrega o texto único. O
F carrega o rich result.

---

## 31. OPÇÃO A — mínima (só forma visual)

**O que faz:** não remove nada. Colapsa a FAQ em `<details>`/accordion (mantendo
todo o HTML), reduz o espaçamento vertical dos blocos A–E e diminui o peso
tipográfico dos H2 pós-catálogo.

| dimensão | avaliação |
|---|---|
| UX | 🟢 devolve ~700px (FAQ) + ~200px de respiro = **~900px, 1 viewport** |
| SEO | 🟢 **zero impacto** — todo o conteúdo e os 5 links continuam no HTML |
| risco técnico | 🟢 **baixíssimo** — só CSS e um wrapper `<details>` |
| complexidade | 🟢 baixa |
| internal linking | 🟢 intacto (5 links) |
| schema | 🟢 intacto (FAQPage permitido em accordion) |

**Não resolve:** as duas datas, a duplicidade A×E.

---

## 32. OPÇÃO B — balanceada (recomendada)

**O que faz:** Opção A **mais** a eliminação da duplicidade:

1. **Bloco E deixa de repetir os números.** `CompactCitySeoBlock` volta ao que o
   próprio docstring promete: `h2` + parágrafo curto, **sem `<dl>`**. As métricas
   ficam só no bloco A, que tem a mediana correta e o timestamp real.
2. **Uma única data**, a real (`inventory.updatedAt`). O `formatToday()` sai.
3. FAQ em accordion.
4. Blocos B/C/D fundidos numa faixa horizontal única ("Explore em Atibaia") com
   os mesmos chips e **os mesmos 5 links**.

| dimensão | avaliação |
|---|---|
| UX | 🟢🟢 devolve ~1100–1300px; some a contradição de números e datas |
| SEO | 🟢 **preserva os 5 links, o texto único de A e o FAQPage.** Perde-se apenas texto duplicado — que não agrega sinal |
| risco técnico | 🟡 médio — `CityInventoryStats` é compartilhado com `LocalSeoLanding` (§26); precisa de flag ou de não alterar o componente, só o uso em `CompactCitySeoBlock` |
| complexidade | 🟡 média |
| internal linking | 🟢 5 links preservados |
| schema | 🟢 intacto |

---

## 33. OPÇÃO C — comercial (catálogo limpo)

**O que faz:** move todo o conteúdo SEO para **depois** de um separador visual
explícito ("Sobre o mercado em Atibaia"), ou para uma aba/seção colapsada por
padrão; o catálogo termina no paginador.

| dimensão | avaliação |
|---|---|
| UX | 🟢🟢🟢 catálogo premium, fim de lista claro |
| SEO | 🟡 **conteúdo continua no HTML** (colapsado é aceitável), mas o peso visual reduzido pode diminuir o valor percebido pelo Google em avaliações de "main content" |
| risco técnico | 🔴 mais alto — reorganiza a árvore da página |
| complexidade | 🔴 alta |
| internal linking | 🟡 links preservados, porém mais profundos na página |
| schema | 🟢 intacto se o HTML permanecer |

---

## 34. Recomendação

**Opção B**, em duas etapas, com a A como primeira entrega segura:

1. **Etapa 1 (risco quase zero):** FAQ em accordion + respiro vertical. Devolve
   ~900px sem tocar em dado nenhum.
2. **Etapa 2:** eliminar a duplicidade A×E e unificar a data.

**Sobre o limit:** o grid tem **3 colunas**, e 50 gera **17 linhas**. Se o
objetivo for reduzir a rolagem *antes* dos blocos SEO, **18 ou 24** são os
candidatos naturais (múltiplos de 3, 6 e 8 linhas). Mas note:

> Reduzir o limit **não resolve o problema relatado** — apenas empurra parte dos
> cards para a página 2 e faz os blocos SEO aparecerem *mais cedo*. Com 24, o
> usuário veria os mesmos 1704px de SEO depois de 8 linhas em vez de 9. **O
> ganho visual real está nos blocos, não no limit.**

Se a decisão for mudar o limit mesmo assim, lembrar de tocar **os dois** lugares
(§10) e aceitar a criação de uma segunda URL indexável (§11).

---

## 35. Matriz obrigatória

| ITEM | ESTADO ATUAL | FONTE | RISCO AO ALTERAR | RECOMENDAÇÃO |
|---|---|---|---|---|
| Catálogo | 27 cards, SSR | `/api/ads/search` | 🔴 5 rotas | não tocar |
| Grid | 1 / 2 / **3** colunas | `VehicleGrid.tsx:183` | 🔴 5 rotas | não tocar; adicionar teste |
| Page size | **50** | `ads-search-url.ts:4` | 🔴 5 rotas + 2 arquivos | não tocar nesta fase |
| Pagination | existe; oculta com 1 página | `CatalogPagination.tsx:114` | 🔴 5 rotas | **não é bug** |
| Canonical page 2+ | index + self `?page=N` | `query-policy.ts` | 🔴 SEO | não tocar |
| Query policy | `limit` default removido | `query-policy.ts:247` | 🔴 SEO | travar com teste |
| Market Overview (A) | 355px, 0 links, mediana + data real | `seo-overview` | 🟢 só esta rota | manter; é a fonte boa |
| Brands (B) | 119px, **3 links**, 6 chips mudos | `seo-overview` | 🟢 | condensar, manter links |
| Models (C) | 154px, **1 link**, 14 chips mudos | `seo-overview` | 🟢 | condensar, manter link |
| Dealers (D) | 132px, **1 link** | `seo-overview` | 🟢 | condensar |
| Nearby cities | não renderiza | `seo-overview` | 🟢 | — |
| Compact SEO (E) | 241px, **0 links**, duplica A | `local-seo-data` | 🟡 compartilhado | **remover o `<dl>`** |
| Stats | 27 e "8 FIPE" duas vezes | A e E | 🟡 | unificar em A |
| Datas | **08/08/2026 vs 3/9/2026** | `MAX(updated_at)` vs `new Date()` | 🟢 | **corrigir: só a real** |
| FAQ | **702px** (maior bloco) | `faq.ts` | 🟢 | **accordion** |
| FAQPage | acoplado ao FaqBlock | `buildFaqPageJsonLd` | 🔴 se remover FAQ | manter par |
| CollectionPage | 1, com ItemList interno | `buildLocalSeoJsonLd` | 🔴 | não tocar |
| ItemList | `numberOfItems` = renderizados | `page.tsx` | 🔴 | não tocar |
| Breadcrumbs | 1, correto | `buildLocalSeoBreadcrumbJsonLd` | 🔴 | não tocar |
| Internal links | **5 no total** | B, C, D | 🔴 | **preservar os 5** |
| Performance | TTFB ~1447ms, 298 KB | 4 loaders | 🟡 | avaliar depois |
| Mobile | **2509px / 3 rolagens** de SEO | medido | 🟢 | alvo principal |
| Footer | 506px, vem do layout | `app/layout.tsx` | 🔴 global | não tocar |

---

## 36. Respostas objetivas

| # | pergunta | resposta |
|---|---|---|
| 1 | A imagem é `/comprar` ou `/carros-em/atibaia-sp`? | **`/carros-em/atibaia-sp`** — provado por 3 caminhos (§3) |
| 2 | Por que a paginação não aparece? | `totalPages = ceil(27/50) = 1` → `CatalogPagination.tsx:114` retorna `null` |
| 3 | A paginação já existe? | **Sim**, e é bem feita: `<a href>` reais, `rel=prev/next`, funciona sem JS |
| 4 | Qual é o limit atual? | **50** |
| 5 | Quem define esse limit? | `PUBLIC_ADS_SEARCH_LIMIT_MAX` em `lib/search/ads-search-url.ts:4`; **duplicado** em `query-policy.ts:59` |
| 6 | Impacto de reduzir o limit? | Cria 2ª URL indexável `?page=2`; redistribui anúncios; **não reduz os 1704px de SEO** |
| 7 | Quantas colunas o grid tem? | **3** no desktop (≥1024), 2 em ≥640, 1 no mobile. Não há 4 |
| 8 | Quantas linhas gera o limit atual? | **17** (50 ÷ 3). Hoje, com 27 anúncios: **9 linhas** |
| 9 | Quais blocos são realmente necessários para SEO? | **B, C, D** (os 5 links), **A** (texto único + métricas corretas), **F** (FAQPage) |
| 10 | Quais são redundantes? | **E** (`CompactCitySeoBlock`) — 0 links e duplica as métricas de A |
| 11 | Quais geram internal links importantes? | B (3), C (1), D (1). A, E e F geram **zero** |
| 12 | Qual bloco gera FAQPage? | `FaqBlock`, via `buildFaqPageJsonLd(faqEntries)` — mesma lista do HTML |
| 13 | Podemos ocultar/compactar a FAQ sem quebrar o schema? | **Colapsar sim** (accordion, HTML presente). **Remover não** — o `FAQPage` teria de sair junto |
| 14 | MarketOverview e CompactCitySeoBlock duplicam dados? | **Sim** — 27 duas vezes, "8 abaixo da FIPE" duas vezes, e dois preços diferentes |
| 15 | Há métricas contraditórias? | Os preços **não são erro** (mediana 72.500 e média 73.856, ambas sobre os 27), mas leem-se como contradição. **As datas são contraditórias de fato**: 08/08/2026 vs 3/9/2026 |
| 16 | Quais componentes são reutilizados? | `BuyMarketplacePageClient` (+grid, paginação, filtros) em **5 rotas**; `CityInventoryStats` em **3 rotas**. Os blocos A–D e F são **exclusivos** |
| 17 | Arquitetura recomendada? | **Opção B em duas etapas** (§32, §34): primeiro accordion + respiro; depois eliminar a duplicidade A×E e unificar a data |

---

## 37. Dívidas registradas (não corrigidas)

| # | item |
|---|---|
| D1 | Duas datas "atualizados em" contraditórias (§15) |
| D2 | Métricas duplicadas entre A e E (§16) |
| D3 | Docstring do `CompactCitySeoBlock` contradiz o código (§16) |
| D4 | `50` escrito em dois arquivos sem import compartilhado (§10) |
| D5 | `loadSeoModel` falha → `notFound()` derruba o catálogo inteiro (§25) |
| D6 | `avgPrice` pode virar média de 10 anúncios se `recentAds` trouxer preços (§16) |
| D7 | Sem teste travando o número de colunas do grid (§28) |
| D8 | Sem teste travando o par FAQ visível ↔ FAQPage (§28) |
| D9 | TTFB 5,7× maior que `/comprar` (§23) |

---

## 38. GO / NO-GO para alteração

**GO para a Opção A** (accordion na FAQ + respiro vertical) — risco quase zero,
sem tocar em dado, sem tocar em componente compartilhado, sem efeito em SEO.

**GO condicional para a Opção B**, desde que:
- `CityInventoryStats` **não** seja alterado no arquivo (é compartilhado com
  `/carros-baratos-em` e `/carros-automaticos-em`) — mudar apenas o **uso** dentro
  de `CompactCitySeoBlock`;
- os **5 links internos** de B/C/D sejam preservados e verificados por teste;
- a **FAQ continue no HTML** enquanto o `FAQPage` for emitido.

**NO-GO para mudar o limit nesta fase.** Ele não é a causa do problema relatado,
atinge 5 rotas, exige tocar 2 arquivos que hoje não se importam, e cria uma
segunda URL indexável. Se for desejado depois, decidir por **18 ou 24** (grid de
3 colunas) — nunca por preferência visual isolada.

**NO-GO para remover qualquer bloco** antes de decidir a arquitetura: A carrega o
texto único, B/C/D carregam todos os links internos da metade inferior, F carrega
o rich result.

---

**AUDITORIA CONCLUÍDA — aguardando decisão de arquitetura.**
