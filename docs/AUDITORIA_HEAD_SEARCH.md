# Auditoria do HEAD — Search Policy Engine

**Somente leitura** · 2026-09-07 · `feat/catalogo-shell-largo-comprar` @ `7ee7599c`
Nenhum arquivo do projeto foi alterado. Este documento é o único arquivo criado.

## Método e nível de prova

Cada afirmação vem de (a) código lido no HEAD com `arquivo:linha`, (b) execução real de função pura via Node/esbuild, (c) SQL final gerado executando `buildAdsSearchQuery`, ou (d) `SELECT` read-only contra o banco.

**Acesso a banco.** O Postgres local (`DATABASE_URL` → `localhost:5433/carros_na_cidade_test`) está **fora do ar**. As consultas foram feitas contra **produção** (`DATABASE_URL1`), com `SET default_transaction_read_only = on` confirmado na abertura da sessão e `statement_timeout = 20s`. Só `SELECT`. Todas as queries estão transcritas na §5.

> ### ⚠️ Ressalva metodológica que muda a leitura de metade dos fatos
>
> `git rev-list --left-right --count main...HEAD` → **`0  21`**.
> O HEAD está **21 commits à frente de `main`** e zero atrás. Produção roda `main`.
>
> Em particular, **`1aea9584` ("Fase 5.0B — catálogo territorial limpo") NÃO está em `main`** (`git merge-base --is-ancestor 1aea9584 refs/heads/main` → falso). Ou seja: os fatos F1–F11, observados em produção, descrevem `main`; esta auditoria descreve o HEAD, como mandado. Onde os dois divergem, está marcado.

---

## 7.1 Sumário executivo

O HEAD já tem, no backend, três das peças centrais do Search Policy Engine — e elas são melhores do que as hipóteses supunham: o **ranking comercial 4/3/2/1 existe e é data-driven** (`subscription_plans.weight` + boost reservado 4), a **busca textual é tsvector/`plainto_tsquery` com `ts_rank`** (não ILIKE), e o **filtro multi-cidade** (`city_slugs` + `ANY($n)`) já está montado com boost de cidade-base. O que falta não é infraestrutura: é **ordem de precedência** e **modelo de produto**.

As três maiores divergências:

1. **Território não é chave de ordenação — peso comercial é.** A spec pede `território → peso comercial`. O HEAD faz `commercial_layer DESC` como chave **primária**, e a preferência pela cidade-base é só `+60` no `hybrid_score` (desempate), calibrada de propósito para nunca furar a camada. Provado com dados de produção: Ittmotors = Pro (`weight 3.00`, 33 anúncios); o anúncio próprio de Bragança é de PF sem plano (`weight → 1`). Daí F3.
2. **Não existe escopo/raio como conceito de query.** Não há `EXACT_CITY / AUTO_RADIUS / MANUAL_RADIUS / STATE / NATIONAL`, nem parâmetro de distância aceito pelo backend, nem `ORDER BY` de distância em SQL. A proximidade só existe como `region_memberships.distance_km` pré-computado, e a **fronteira de UF trava o raio**: `SELECT COUNT(*) ... WHERE b.state <> m.state` → **0**. Bragança-SP (25,4 km de Extrema-MG) não a enxerga.
3. **Não existe resolução de produto.** Não há coluna de versão nem catálogo FIPE (só `fipe_cache`); `ads.model` **é** a descrição FIPE (`'ONIX SEDAN Plus LT 1.0 12V Flex 4p Mec.'`). A faceta "Modelo" agrega essa coluna — 24 pares distintos para 34 anúncios.

---

## 7.2 Veredito das hipóteses

| ID | Veredito | Evidência | Observação |
|---|---|---|---|
| **H1** | **CONFIRMADA** | `frontend/app/carros-em/[slug]/page.tsx:114` → `loadCityCatalogData(slug, sp, { applyTerritoryFallback: false })`; `city-catalog-loader.ts:118` `normalizeCityFilters` força `city_slug` e apaga `state/city/city_id`; SQL final: `WHERE a.status='active' AND c.slug = $1` | Usa `c.slug`, não `city_id`. Sem fallback e sem expansão — **no HEAD**. Em `main` a rota ainda monta `NearbyRadiusSection` (5.0B não mergeada) |
| **H2** | **PARCIAL** | `ads-filter.builder.js:210` → `c.slug = ANY($n)` (não UNION) ✔; `ads-filter.sort.js:60-64` → nenhum termo de distância no `ORDER BY` ✔; mas a ordem observada **não** vem de ordem física nem `created_at` ✘ | Vem de `commercial_layer DESC`. `created_at DESC` é a **terceira** chave |
| **H3** | **REFUTADA** | `SELECT ... tem_self` → `atibaia-sp`, `braganca-paulista-sp`, `extrema-mg` = **true**; `region_memberships` layer 0 = **5.572 linhas / 5.572 bases** | E seria irrelevante: `regions.service.js:79` (`member_city_id != $1`) e `regional-radius.repository.js:26` (`distance_km > 0`) **excluem** a self-row; a base é injetada no índice 0 por `regionToAdsSearchFilters` |
| **H4** | **REFUTADA (no HEAD)** | `region-catalog-loader.ts:158` `if (parsed.q !== undefined) overrides.q = parsed.q`; `ads-search-url.ts:176` lê `q`; `buildAdsSearchParams` (executado) emite `q=onix&state=SP&city_slugs=...` | F5/F6 **não reproduzem no HEAD**. Ver §7.8 |
| **H5** | **REFUTADA** | Execução: `decideQueryNormalizationRedirect('/comprar','?q=onix')` → `pass`. `decideComprarLegacyQueryRedirect` → `{"kind":"pass"}`. `next.config.js` não tem `redirects` | Há normalização, mas **preserva `q`**: `?q=onix&sort=relevance&page=1&limit=50` → 308 → `/comprar?q=onix` |
| **H6** | **REFUTADA** | `ads-filter.builder.js:196-200` → `a.search_vector @@ plainto_tsquery('portuguese',$n)` + `ts_rank`. `pg_extension`: `pg_trgm`, `unaccent`, `plpgsql`. `idx_ads_search_vector` GIN | O ILIKE existe só em `brand`/`model`/`city` como filtro estruturado, não como busca livre |
| **H7** | **CONFIRMADA** | `ads-filter.facets.js:57-70` → `GROUP BY a.brand, a.model`; `city-model.repository.js:32` → `LOWER(a.model) = LOWER($3)`; `city-model.service.js:67` resolve por `commercialModelSlug(ad.model,{brand})` | Faceta agrega a versão crua; a rota `/cidade/.../modelo/` **deriva** o rótulo comercial |
| **H8** | **DIVIDIDA** | SQL: **CONFIRMADA** — nenhum `ORDER BY` de distância. JS: **REFUTADA** — `regional-facets.ts:248-252` (`tier DESC`, `distance ASC`) está **vivo** e é chamado em `region-catalog-loader.ts:262` | `city-radius-sort.ts` (o outro ordenador) está **órfão**: único importador é `city-radius-catalog.ts`, também sem caller |
| **H9** | **REFUTADA** | `ads-ranking.sql.js:78-83` `commercialLayerExpr = GREATEST(boost 4, COALESCE(sp.weight,1))`; `subscription_plans`: Pro=3.00, Start=2.00, demais=1.00 | O ORDER BY usa **exatamente** 4/3/2/1 |
| **H10** | **PARCIAL** | Fontes dispersas ✔ (`users.plan_id` → `subscription_plans.weight`; boost em `ads.highlight_until`). Coluna derivada ✘ mas **expressão canônica única** ✔ (`commercialLayerExpr`, exposta como `priority_tier` no SELECT) | Custo: 4 `LEFT JOIN` em toda listagem, e o mesmo `whereClause` obriga o `countQuery` a repeti-los |
| **H11** | **CONFIRMADA** | `ads-filter.builder.js:400-427` `buildAdsFacetWhere` **não aplica** `q`, preço, ano, `mileage_max`, `seller_kind`, `opportunity`, `priority_tier`. Facetas de controle usam `buildAdsFacetScopeWhere` (só território+status) | Território é o mesmo (`buildFacetBaseWhere`) — a divergência é nos filtros de produto |
| **H12** | **CONFIRMADA** | `LIMIT $n OFFSET $n`; `region-catalog-loader.ts:262` re-ordena **depois** da paginação | O re-sort só vê a página atual |
| **H13** | **CONFIRMADA** | `pg_extension` = `pg_trgm`, `plpgsql`, `unaccent` (sem PostGIS/earthdistance). Distância = `region_memberships.distance_km` (NUMERIC). Haversine SQL em `regions.service.js:130-170` está **morto** por bug de tipo | `ads.latitude/longitude` existem e estão **0/34 preenchidas** |
| **H14** | **REFUTADA** | `ads.routes.js:25-78` `ADS_ALLOWED_QUERY_KEYS` inclui `city_slug`, `city_slugs`, `city_slugs[]`, `state`, `city_id`, `city` **e** `q`; `cache.middleware.js:47` chaveia por `prefix:path:sha1(vary)` | Cobertura garantida por `tests/ads/ads-cache-key-covers-filters.test.js` |

---

## 7.3 Mapa de componentes

| Peça da spec | Onde está no HEAD | Como funciona hoje | Divergência vs. spec | Risco | Menor mudança plausível *(hipótese técnica, não recomendação)* |
|---|---|---|---|---|---|
| **Intent resolver** | `ads-free-query.parser.js` | `inferAdsFiltersFromFreeQuery` roda em **todo** parse. Normaliza NFD+lower, infere marca/modelo por dicionário vivo (`ads.brand`/`ads.model` de ativos), preço (`até 40 mil`, `entre X e Y`), ano, combustível, câmbio, carroceria, `below_fipe`, destaque; monta `q` residual | Existe e é mais rico que a spec pede. **Mas** `merged = {...filters, ...citySignals}` (l. 379) deixa a **cidade inferida do texto sobrescrever o `city_slug` da rota** | 🔴 alto | Mover `citySignals` para antes de `...filters`, ou ignorá-lo quando a rota já fixou território |
| **Origem geográfica / `location_source`** | não existe como conceito | Cidade vem do **path** (rotas territoriais) ou é inferida do texto. `/comprar` apaga todo território (`normalizeNationalFilters:256-260`). `SearchFacetsSidebar.tsx:199-208` tem **4 cidades hardcoded** que setam `city` (nome livre), não `city_slug` | Não há campo de procedência da localização nem cookie/JWT de sessão lido pelo catálogo | 🟡 médio | Introduzir `location_source` no contrato de filtros; substituir a lista hardcoded por `/api/public/cities/public-set` |
| **Scope resolver (EXACT/AUTO/MANUAL/STATE/NATIONAL)** | **não existe** | Escopo é implícito na rota: `/carros-em` = 1 cidade; `/carros-usados/regiao` = `city_slugs[]`; `/comprar/estado` = `state`; `/comprar` = nada. `ads-filter.scopes.js` é outra coisa (nome de escopo de cache/limite, não território) | Sem modos, sem 0/25/50/75, sem teto 150, sem "escolha manual vence" | 🔴 alto | Um resolver que produz `city_slugs[]` a partir de `(base, raio)` antes do fetch — o backend já aceita o resultado |
| **Estrutura de proximidade** | `region_memberships` (migration 021) + `scripts/build-region-memberships.mjs` | `(base_city_id, member_city_id, distance_km NUMERIC, layer SMALLINT)`, PK composta, 2 índices. Layer 0=self, 1≤30 km, 2=30–60, 3=60–100. Produção: 5.572 self / 29.880 L1 / 66.377 L2 / **5.652 L3 (180 bases)** | **Mesma UF apenas** — 0 linhas cross-UF. `regions.service.js:82` tem guard `rm.layer <= 2`, então a banda 60–100 km existe no banco e é **invisível** para a página regional | 🔴 alto | Rebuild sem o filtro de UF + relaxar o guard de layer, ambos fora do código de query |
| **Liquidity evaluator** | `regional-radius.service.js:24` `decideCityIndexable({ownCount,minAds})` | Compara só estoque **próprio** vs `getSitemapMinAds()`. Sai em `coverage.indexable` — campo que **nenhum consumidor lê** | Não decide expansão; decide indexabilidade (outro eixo) | 🟢 baixo | Reaproveitar a assinatura para "preciso expandir?" |
| **Product resolver (q → marca/modelo/versão)** | dicionários em `ads-free-query.repository.js` | `pickBestMatch` exige que o **texto contenha** a string do dicionário. Como `ads.model` é a descrição FIPE inteira, `q="onix"` **não casa** nenhum modelo e cai no tsvector | Sem catálogo (`information_schema`: só `fipe_cache`), sem coluna `version`, sem `fipe_code` | 🔴 alto | Derivar modelo comercial no dicionário com `deriveCommercialModel` (já existe em `shared/vehicle/commercial-model.js`) |
| **Commercial ranker (4/3/2/1)** | `ads-ranking.sql.js:78-83` | `GREATEST(highlight_until>NOW() ? 4 : 0, COALESCE(sp.weight,1))`. Data-driven; decimais permitidos entre camadas | **Nenhuma** na fórmula. A divergência é de **posição** no ORDER BY | 🟢 baixo | — |
| **Distância como desempate** | `regional-facets.ts:248-252` (vivo, só na regional); `city-radius-sort.ts:74` (órfão) | `tier DESC → distance ASC → índice`. Roda em JS **depois** do LIMIT/OFFSET | A spec põe **território antes** de peso; aqui `tier` vem primeiro, e só na página atual | 🔴 alto | Levar a chave territorial para o SQL, acima de `commercial_layer` |
| **Facetas** | `ads-filter.facets.js` | 7 agregações. Veículo usa `buildAdsFacetWhere`; controle usa `buildAdsFacetScopeWhere` (território+status) | Universo ≠ do grid: sem `q`, preço, ano, `mileage_max`, `seller_kind`, `opportunity`, `priority_tier` | 🟡 médio | Passar o mesmo WHERE do grid às facetas de veículo |
| **Paginação** | `ads-filter.builder.js:300` | `LIMIT/OFFSET`; `countQuery` reusa o `whereClause` e repete os 4 JOINs | Re-sort em JS **após** a paginação na regional | 🟡 médio | Remover o re-sort assim que o SQL ordenar certo |
| **Cache** | `ads.routes.js:107-159` | Redis `cacheGet`: `ads:search`/`ads:list` 30 s, `ads:facets` 60 s, `ads:auto` 20 s. Key = `sha1(prefix:path:query filtrada)`. Invalidação por `cacheInvalidatePrefix` (`ads.mutation-cache.js`). Next: `revalidate 60` + tag `public-ads` | Nenhuma | 🟢 baixo | Só acrescentar a chave nova à allowlist |
| **Estado de URL** | `lib/seo/query-policy.ts` | Tabela única com 5 categorias. Qualquer filtro → `noindex,follow` + canonical limpa; `page≥2` indexável; parâmetro desconhecido = `filter` (conservador) | Nenhuma. É onde um `raio`/`scope` novo teria de entrar | 🟢 baixo | Uma linha na tabela |
| **Mensagens de expansão / estado vazio** | `CatalogPageHeader.tsx:178`; `VehicleGrid.tsx:150-170` | Subtítulo da cidade é **string fixa** `"Ofertas em ${city.name} e região"` — sem nenhum dado regional por trás. Vazio oferece `/comprar/estado/{uf}` | A página **afirma** "e região" e carrega só a própria cidade | 🟡 médio | Condicionar a copy ao escopo realmente aplicado |
| **Telemetria** | tabelas `ad_events`, `analytics_events`, `events`, `event_queue`, `leads`, `alerts`; `src/modules/ads/ad-events.ingest.js` | Eventos de anúncio/lead/analytics existem | **Nenhum evento de busca** (query, escopo, nº de resultados, expansão) | 🟡 médio | Um `search.executed` no controller de `/api/ads/search` |

---

## 7.4 Cenários

Servidor Next **não foi subido** (o Postgres local está fora, e subir o stack exigiria `docker compose up` + seed = mudança de estado, proibida). S1–S8 foram resolvidos **executando o gerador de SQL real** (`buildAdsSearchQuery`) e as funções puras de middleware; S9/S10 ficam **NÃO EXECUTADOS**.

| # | URL | SQL final / decisão executada | Resultado | Comentário |
|---|---|---|---|---|
| **S1** | `/carros-em/braganca-paulista-sp` | `WHERE a.status='active' AND c.slug=$1 ORDER BY GREATEST((CASE WHEN a.highlight_until>NOW() THEN 4 ELSE 0 END), COALESCE(sp.weight,1)) DESC, hybrid_score DESC, a.created_at DESC LIMIT $2 OFFSET $3` · params `["braganca-paulista-sp",50,0]` | 1 anúncio (K1) | Só a própria cidade. Nenhum termo de distância |
| **S2** | `/carros-em/atibaia-sp` | idem, `$1='atibaia-sp'` | 33 anúncios | — |
| **S3** | `/carros-usados/regiao/braganca-paulista-sp` | `... AND c.slug = ANY($1) AND UPPER(COALESCE(a.state,c.state))=$2 ORDER BY <commercial_layer> DESC, hybrid_score DESC, a.created_at DESC LIMIT $4 OFFSET $5` · params `[[...slugs],"SP","braganca-paulista-sp",50,0]` | 34 | O 3º param é o slug-base, usado **só** no `hybrid_score` (`baseCityBoostExpr`, +60). Depois o SSR re-ordena em JS por `tier DESC → distance ASC`. **Camada 3.00 (Atibaia, 33) > 1 (Bragança, 1)** ⇒ o anúncio próprio é o último. **F3 explicado** |
| **S4** | `/carros-em/braganca-paulista-sp?q=onix` | `... AND a.search_vector @@ plainto_tsquery('portuguese',$1) AND c.slug=$2 ORDER BY text_rank DESC, <commercial_layer> DESC, hybrid_score DESC, a.created_at DESC` | 0 | Coerente: não há Onix em Bragança |
| **S5** | `/carros-em/atibaia-sp?q=onix` | idem, `$2='atibaia-sp'` | 6 esperados | Casa por **`search_vector`** (tsvector com pesos A=título, B=marca/modelo, C=cidade — ver `019_ads_search_vector_trigger.sql`), não por coluna única |
| **S6** | `?q=hb 20` vs `?q=HB20` | `normalizeText` (NFD strip + lower) → `"hb 20"` / `"hb20"`; `plainto_tsquery` tokeniza `hb 20` em dois lexemas | **Divergem** | Não há sinônimo/concatenação. `pg_trgm` está instalado e há `idx_ads_brand_trgm`/`idx_ads_model_trgm`, **mas nada os usa para busca livre** |
| **S7** | `/comprar?q=onix` | `decideQueryNormalizationRedirect` → **`pass`**; `decideComprarLegacyQueryRedirect` → `{"kind":"pass"}`; `decideSeoQueryPolicy` → `normalizedQuery="q=onix"`, `index=false` | **Sem redirect no HEAD** | F6 não reproduz. Com `?q=onix&sort=relevance&page=1&limit=50` há 308 → `/comprar?q=onix` (**q preservado**) |
| **S8** | `/cidade/atibaia-sp/marca/chevrolet/modelo/onix` | `city-model.repository.js:32` → `... AND LOWER(a.model) = LOWER($3)`; o rótulo "Onix" vem de `city-model.service.js:67` `commercialModelSlug(ad.model,{brand}) === modelSlug` | 6 | A rota **deriva** o modelo comercial; a faceta da rota nova **não** |
| **S9** | cidade com 0 ACTIVE + vizinha com estoque | — | **NÃO EXECUTADO** | Regra provada por código na auditoria territorial anterior: 404 no `middleware.ts` §2b-bis |
| **S10** | cidade com 2 ACTIVE | — | **NÃO EXECUTADO** | Idem: 200 + `noindex,follow` (`shouldIndexLocalSeo`, limiar 3) |

---

## 7.5 Dados reais e distâncias

Sessão: `default_transaction_read_only = on`, db `carros_na_cidade_db`.

### K1 — estoque
```sql
SELECT c.slug, COUNT(*)::int FROM ads a JOIN cities c ON c.id=a.city_id
WHERE a.status='active' GROUP BY 1 ORDER BY 2 DESC;
```
| slug | ativos |
|---|---|
| atibaia-sp | 33 |
| braganca-paulista-sp | 1 |

### K1b / F2 — anunciante, plano, peso *(a causa de F3)*
```sql
SELECT COALESCE(adv.company_name,adv.name) loja, u.document_type, sp.name plano, sp.weight,
       sp.priority_level, COUNT(*)::int ativos,
       COUNT(*) FILTER (WHERE a.highlight_until > NOW())::int destaques
FROM ads a LEFT JOIN advertisers adv ON adv.id=a.advertiser_id
LEFT JOIN users u ON u.id=adv.user_id LEFT JOIN subscription_plans sp ON sp.id=u.plan_id
WHERE a.status='active' GROUP BY 1,2,3,4,5;
```
| loja | doc | plano | weight | priority_level | ativos | destaques |
|---|---|---|---|---|---|---|
| Ittmotors | cnpj | Plano Loja Pro | **3.00** | 80 | 33 | 0 |
| Aguinaldo Santos | cpf | *(null)* | *(null → 1)* | *(null)* | 1 | 0 |

Camada calculada: `atibaia-sp` → **3.00** (33) · `braganca-paulista-sp` → **1** (1).

### Planos
| id | nome | weight | priority_level |
|---|---|---|---|
| cnpj-store-pro | Plano Loja Pro | 3.00 | 80 |
| cnpj-store-start | Plano Loja Start | 2.00 | 60 |
| cpf-premium-highlight | **Plano Destaque Premium** | **1.00** | 50 |
| cnpj-evento-premium | Plano Evento Premium | 1.00 | 100 |
| cnpj-free-store / cpf-free-essential / smoke-test-plan | — | 1.00 | 5 / 0 / 1 |

> O plano chamado "Destaque Premium" tem `weight 1.00`. A camada 4 vem **só** de `ads.highlight_until`. Nome e efeito não coincidem.

### K2 — boosts
`ativos_agora = 0` · `expirados_30d = 2` · `com_highlight_alguma_vez = 6` (entre os 34 ativos).

### K3 — taxonomia (`ads.model` = descrição FIPE)
24 pares `(brand, model)` distintos para 34 anúncios. Amostra: `GM - Chevrolet / 'ONIX SEDAN Plus LT 1.0 12V Flex 4p Mec.'` (2), `'ONIX HATCH LT 1.0 12V Flex 5p Mec.'` (2), `'ONIX HATCH 1.0 12V Flex 5p Mec.'` (1), `'ONIX SEDAN Plus LTZ 1.0 12V TB Flex Aut.'` (1). Marca vem com prefixo de grupo FIPE (`GM - Chevrolet`, `VW - VolksWagen`).

### K4 / A1 — cidades
`cadastradas = 5.572` · `com ACTIVE = 2` · `com membership = 5.572` · `sem lat/lng = 1` · **cidades com ACTIVE e sem lat/lng = 0**.

### A2 — `region_memberships`
| layer | linhas | bases |
|---|---|---|
| 0 (self) | 5.572 | 5.572 |
| 1 (≤30 km) | 29.880 | 4.915 |
| 2 (30–60) | 66.377 | 5.407 |
| **3 (60–100)** | **5.652** | **180** |

```sql
SELECT COUNT(*) FROM region_memberships rm
JOIN cities b ON b.id=rm.base_city_id JOIN cities m ON m.id=rm.member_city_id
WHERE b.state <> m.state;   -- => 0
```

Bragança (amostra): `vargem-sp 15,14` · `atibaia-sp 18,34` · `jarinu-sp 25,40` (L1) · `itatiba-sp 31,68` … `caieiras-sp 49,67` (L2) · `itaquaquecetuba-sp 62,33` … (L3, **filtrada** por `rm.layer <= 2`). Self-row presente nas três cidades testadas.

### A5 — extensões
`pg_trgm`, `plpgsql`, `unaccent`. **Sem PostGIS, sem earthdistance.**

### A6 — distâncias e anéis
```sql
6371*acos(sin(radians(a.lat))*sin(radians(b.lat))
        + cos(radians(a.lat))*cos(radians(b.lat))*cos(radians(b.lng-a.lng)))
```
| par | km | anel (0/25/50/75/150) |
|---|---|---|
| atibaia ↔ bragança | **18,3** | 25 |
| bragança ↔ **extrema-MG** | **25,4** | 50 — *fora do sistema hoje (cross-UF)* |
| campinas ↔ jundiaí | 35,6 | 50 |
| atibaia ↔ jundiaí | 35,7 | 50 |
| atibaia ↔ extrema-MG | 38,1 | 50 — *cross-UF* |
| bragança ↔ jundiaí | 44,6 | 50 |
| bragança ↔ campinas | 53,9 | 75 |
| atibaia ↔ campinas | 57,2 | 75 |
| extrema ↔ jundiaí | 69,8 | 75 |
| campinas ↔ extrema | 76,9 | 150 |

### Índices relevantes
`idx_ads_search_vector` (GIN tsvector) · `idx_ads_brand_trgm`, `idx_ads_model_trgm` (GIN trigram, **sem consumidor na busca livre**) · `ads_status_city_id_idx`, `idx_ads_city_id_status`, `idx_ads_brand_status`, `idx_ads_model_status`, `idx_ads_price_status`, `idx_ads_year_status`, `idx_ads_mileage_status`.

### `ads` — colunas de produto
Existem: `brand`, `model`, `body_type`, `fuel_type`, `transmission`/`gearbox`/`cambio` (três!), `year`, `below_fipe`, `fipe_reference_value`, `fipe_diff_percent`, `search_vector`, `city_id`/`city`/`state`, `plan`, `priority`, `highlight_until`, `latitude`/`longitude`.
**Não existem:** `version`, `fipe_code`, `year_model`. `latitude/longitude` em `ads`: **0 de 34 preenchidas**.
Tabelas de catálogo: só **`fipe_cache`** (não há tabela de modelos/versões).

---

## 7.6 Código histórico consultado — **não restaurar**

| Commit | Data | O que revela |
|---|---|---|
| `1aea9584` | 2026-09-02 | Fase 5.0B. Removeu do render `NearbyRadiusSection`, `CityAuthoritySection`, `CompactCitySeoBlock`, `FaqBlock`; tirou `loadNearbyRadiusAds` e `loadCitySeoOverview` do `Promise.all`; removeu `areaServed` e o `FAQPage`. **Não está em `main`.** Justificativa registrada: peso de página (1704 px desktop / 2509 px mobile por 5 links) |
| `31f8c20d` | 2026-07-05 | "Âncora regional". Substituiu `AlsoInRegionBlock` por `NearbyRadiusSection`. Criou `city-radius-catalog.ts` e `city-radius-sort.ts` com a regra "distância é chave primária; destaque só desempata dentro da mesma distância" — **a regra que a spec pede, escrita e testada, hoje inalcançável** |
| `8ae9df2e` / `5f91fcef` | 2026-05-20 | Catálogo híbrido + desligamento do fallback territorial em `/carros-em` ("prova local") |
| `d3dfa1ba` | 2026-07-05 | Rebaixou para `debug` o log do haversine ao vivo e registrou a decisão: `region_memberships` é a fonte **desejada**; o haversine SQL falha sempre por bug de tipo (`$3 - $5` sem cast) e o fallback é o comportamento correto |
| `7eb26d93` | 2026-05-20 | `region-catalog-loader` já repassava `q` desde a origem — e **está em `main`** |
| `bea15d00`, `bb601c0b` | 2026-09-03/05 | Shell largo / 4 colunas — geometria, não território |

Órfãos confirmados por grep (sem importador de produção): `city-radius-catalog.ts`, `city-radius-sort.ts`, `NearbyRadiusSection.tsx`, `AlsoInRegionBlock.tsx`, `loadCitySeoOverview`. O endpoint `/api/public/cities/:slug/radius` continua **vivo** e sem consumidor de página. `decideCityIndexable` produz `coverage.indexable`, campo que ninguém lê.

---

## 7.7 Perguntas para o dono do produto

1. **A rota de região pode deixar de receber links internos?** Ela é `noindex` fixo com canonical → `/carros-em/{base}` (`carros-usados/regiao/[slug]/page.tsx:118`), está gateada por `REGIONAL_PAGE_ENABLED` (ausente de todos os `.env` locais ⇒ `false`) e **não aparece em nenhum sitemap** (os sitemaps saem de `city_home`/`city_brand`/`city_brand_model`/`city_below_fipe`). Falta confirmar campanhas/e-mails, que não estão no repositório.
2. **A faceta "Modelo" usando versão foi decisão ou regressão?** O código sempre agregou `a.model`; a regressão está **um nível abaixo**, na taxonomia: `ads.model` guarda a descrição FIPE. A rota `/cidade/.../modelo/` já resolve isso com `commercialModelSlug`. Unificar é decisão sua.
3. **Existe cidade com ACTIVE e sem lat/lng?** **Não** — 0 hoje (1 cidade sem geo em 5.572, sem anúncio). Mas `cities.latitude` é populada por seed manual: cidade nova entra sem geo até o seed rodar.
4. **O peso comercial pode virar coluna derivada atualizada por job, ou deve ser calculado em tempo de query?** Hoje é query-time, com 4 `LEFT JOIN` obrigatórios em **todas** as listagens — e o `whereClause` compartilhado já quebrou o `countQuery` duas vezes em produção por JOIN faltante (2026-05-24 e 2026-07-26). Uma coluna derivada removeria os JOINs, mas `highlight_until > NOW()` é dependente do relógio: precisaria de job ou de coluna híbrida.
5. **Há acordo com o lojista Ittmotors que afete ranking?** Ele detém 33 dos 34 anúncios ativos e é o **único** com plano pago (Pro, weight 3). Qualquer mudança que ponha território acima de peso comercial muda a posição dele em toda página regional.
6. **A fronteira de UF deve mesmo cair?** É decisão de produto com custo de dados: `build-region-memberships.mjs` filtra por UF, então habilitar Bragança-SP ↔ Extrema-MG (25,4 km) exige rebuild da tabela — não é mudança de query.
7. **A banda 60–100 km (layer 3) deve ser exposta?** Já existe no banco (5.652 linhas, 180 bases) e é escondida por `rm.layer <= 2`. O anel de 75 km da spec cai exatamente nela.
8. **O subtítulo "Ofertas em {cidade} e região" pode continuar?** É string fixa; a página carrega só a própria cidade.

---

## 7.8 NÃO CONFIRMADOS

| Item | Por quê | O que confirmaria |
|---|---|---|
| **F5** — região ignora `q` | No HEAD, `q` é lido (`ads-search-url.ts:176`), repassado (`region-catalog-loader.ts:158`), serializado (`buildAdsSearchParams` executado: `q=onix&state=SP&city_slugs=...`), aceito pelo Zod, vira `search_vector @@ plainto_tsquery` e está na cache key. **Nada o descarta** | Reproduzir com o servidor de pé e capturar a URL real de `/api/ads/search`; ou confirmar que produção roda `main` com outro código |
| **F6** — `/comprar?q=onix` perde o parâmetro | Execução: nenhum dos três redirects dispara; `submitSearch` (`CatalogPageHeader.tsx:130`) faz `router.push(pathname?qs)` **preservando `q`** | Capturar `status` + `Location` reais. Suspeita: o comportamento é de `main`, ou vem do `SearchBar` do header global (não auditado) |
| **F1/F11** — Bragança mostrando 1 card e header sem cedilha | F1 descreve `main` (que ainda monta `NearbyRadiusSection`). A grafia sem cedilha não aparece no banco (`Bragança Paulista` correto) | Inspecionar o HTML servido por produção |
| **S9 / S10** | Servidor Next não subido (Postgres local fora; subir exigiria mudar estado) | `npm run e2e:prepare` + seed local — **fora do escopo somente-leitura** |
| **Ordem exata dos 34 em S3** | Depende de `hybrid_score` (CTR, leads, `city_metrics.demand_score`, recência), que não foi calculado | Executar a `dataQuery` completa; requer os JOINs de métricas |
| **Valor de `regional.radius_km`** | Vem de `platform_settings` (default 80), não lido nesta sessão | `SELECT value FROM platform_settings WHERE key='regional.radius_km'` |
| **Jobs BullMQ (L1)** | 20+ workers em `src/workers/` listados, mas o agendamento (`repeat`/cron) não foi rastreado até o bootstrap | Ler `src/workers/bootstrap/` |
| **JSON-LD (L2)** | Fora do caminho crítico da busca; não auditado nesta passada | — |
| **Dependência externa da rota de região** | Campanhas/e-mails não vivem no repositório | Confirmação do dono |

---

### Nota final

Nada foi alterado além da criação deste arquivo. As divergências acima estão **documentadas, não corrigidas**, e a coluna "menor mudança plausível" é hipótese técnica — não recomendação de produto.
