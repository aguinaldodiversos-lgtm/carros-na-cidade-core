# F2 — Relatório (formato fixo, seção 11 do prompt)

Data: 2026-09-08 · Branch: `f2/nucleo` (nascida de `main @ 64517384`; traz o cherry-pick único da fixture `c1f1c524` e o gate aprovado `978c6715` = `docs/F2_GATE_SQL.md`)
Banco de execução: snapshot de produção em Postgres 18.6 local (`localhost:5434/carros_na_cidade_snapshot`) e bancos descartáveis criados pela fixture no mesmo servidor. `DATABASE_URL1` não recebeu nenhuma escrita. Nenhuma conexão ao Postgres de produção partiu desta máquina.

**Comportamento com a flag `off` inalterado (R4).** Com `SEARCH_POLICY_ENGINE=off` (ou ausente) o bloco novo do controller é inerte (`src/modules/ads/ads.controller.js:89-107` só entra em `v1`; `:120-122` só em `shadow`) e o SQL do caminho legado é **byte a byte** o de `main`: golden gerado a partir de `git show main:src/modules/ads/filters/ads-filter.builder.js`, 24 contextos, `dataQuery`/`countQuery`/`params`/`countParams` (`tests/search-policy/f2-flag-off.test.js:20-30`, golden em `tests/search-policy/__snapshots__/legacy-sql.golden.json`). O parser legado não foi tocado (D2): `git diff main -- src/modules/ads/filters/ads-filter.parser.js src/modules/ads/filters/ads-free-query.parser.js` está vazio. Em `ads-filter.builder.js` mudou **só** a palavra `export` em `shouldApplyDirtyAdGuard` (`:123`), para o motor aplicar exatamente a mesma regra.

**Backend de cache (declaração exigida).** Testes: `memory` — `DISABLE_REDIS=true`, `policyCacheBackend()` devolve `"memory"` (`tests/search-policy/f2-scope-facets-relax.test.js:505`). Produção: `memory` — `/health` responde `redis: disabled` (mesmo estado do snapshot local em `f2-backend-snapshot-*`, e o registrado na F1 §2.5). `policy-cache.js` reutiliza o **mesmo** cliente de `src/infrastructure/cache/redis.js` que o `cache.middleware.js` usa (`src/modules/ads/search-policy/policy-cache.js:23`, `:68-70`); quando ele é `null`, LRU em processo com teto de **200** chaves (`:31`, evicção `:51`). Nenhum código assume Redis; `cache.middleware.js` e `redis.js` não foram tocados (`git diff main --stat` vazio para os dois).

Releitura de `docs/Search_Policy_Engine_v2_1_Consolidado.md`: **ainda ausente** em `origin/main` (`git cat-file -e origin/main:docs/…` após `git fetch` em 2026-09-08; `origin/main = 64517384`). A releitura de 5 linhas sai assim que ele existir.

---

## 1. Escopo tocado / não tocado

**Tocado (40 arquivos):**

| Arquivo                                                                                                                                                                                                                                | O quê                                                                                                                                                                                                                                           |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/modules/ads/search-policy/flag.js`                                                                                                                                                                                                | novo — `off`/`shadow`/`v1` (`:15-17`, `:21`), allowlist `SEARCH_POLICY_ENGINE_CITIES` (`"*"` ou conjunto, `:29`), `isOriginAllowed` (`:45`)                                                                                                     |
| `src/modules/ads/search-policy/policy-cache.js`                                                                                                                                                                                        | novo — instrução A/E4: mesmo cliente Redis do `cache.middleware.js` ou LRU 200 chaves; prefixos `sp:liq`/`sp:relax` (`:26`); `policyCacheBackend()` (`:73`); invalidação (`:122`)                                                               |
| `src/modules/ads/search-policy/text.js`                                                                                                                                                                                                | novo — normalização, fronteira de palavra Unicode (`:51`), preço/ano com as regras do legado (`:62`, `:105`), residual (`:121`)                                                                                                                 |
| `src/modules/ads/search-policy/dictionaries.js`                                                                                                                                                                                        | novo — marcas (`:33`, SQL do legado honrando o `db`), modelos comerciais (`:60`), cidades com ≥ 1 ACTIVE (`:87`, só colunas versionadas); cache 10 min                                                                                          |
| `src/modules/ads/search-policy/location-resolver.js`                                                                                                                                                                                   | novo — §4.2 + D1: precedência USER_SELECTED > EXPLICIT_QUERY > CITY_PAGE > GEOLOCATION > SESSION_DEFAULT > NONE (`:109-174`)                                                                                                                    |
| `src/modules/ads/search-policy/product-resolver.js`                                                                                                                                                                                    | novo — resolvedor v1 próprio (D2): marca, modelo comercial, câmbio, combustível, carroceria, preço, ano, abaixo da FIPE; explícito vence só quando veio na URL (`:156-166`); sem marca implícita (`:95-98`)                                     |
| `src/modules/ads/search-policy/intent-resolver.js`                                                                                                                                                                                     | novo — §4.3: perfis (`:21`), `resolveIntent` (`:37`) → `{profile, specificity, target, max_auto_radius}`                                                                                                                                        |
| `src/modules/ads/search-policy/scope-resolver.js`                                                                                                                                                                                      | novo — §4.4: `resolveGeoRequest` (`:49`), AUTO_RADIUS (`:75`), anéis D5 (`:114`), liquidez D7/E1 (`:145`), `resolveScope` (`:191`), cache de liquidez E4 (`:343`)                                                                               |
| `src/modules/ads/search-policy/candidate-scope.js`                                                                                                                                                                                     | novo — §4.1/D3: 4 JOINs fixos (`:34`), cláusulas de produto (`:62`), território por subconsulta única ou UF (`:127-137`), `buildCandidateScope` (`:149`)                                                                                        |
| `src/modules/ads/search-policy/facets-policy.js`                                                                                                                                                                                       | novo — §5.2/D6/E2: GROUPING SETS (`:209-220`), self-excluding (`:225`), montagem (`:292`), abertura (`:360-362`)                                                                                                                                |
| `src/modules/ads/search-policy/relaxations.js`                                                                                                                                                                                         | novo — §4.7/D4: variantes (`:29`), uma query `COUNT(*) FILTER` (`:125`, `:177`)                                                                                                                                                                 |
| `src/modules/ads/search-policy/chips.js`                                                                                                                                                                                               | novo — §5.4 (`:17`)                                                                                                                                                                                                                             |
| `src/modules/ads/search-policy/telemetry.js`                                                                                                                                                                                           | novo — §4.8 `search.executed` (`:20`, `:61-66`); desliga-se em erro de schema (`:18`, `:80-83`)                                                                                                                                                 |
| `src/modules/ads/search-policy/engine.js`                                                                                                                                                                                              | novo — contexto (`:59`), ORDER BY v1 (`:96`), grid+count do mesmo escopo (`:109`), resposta §6 (`:236`), guarda "só assume o que modela" (`:314-339`), `runSearchPolicyEngineIfAllowed` (`:341`), shadow com timeout 300 ms (`:35`, `:352-425`) |
| `src/database/migrations/066_search_policy_f2.sql`                                                                                                                                                                                     | novo — `analytics_events.payload JSONB` (`:26`), `facets.always_open = ["price"]` (`:32-35`), CHECK de `event_type` estendido como superconjunto (`:38-73`)                                                                                     |
| `src/modules/ads/search-policy/policy-config.js`                                                                                                                                                                                       | `always_open: ["price"]` (`:35-36`) — igual à 066 (teste `policy-config.test.js`)                                                                                                                                                               |
| `src/modules/ads/ads.controller.js`                                                                                                                                                                                                    | `search()` por modo da flag (`:89-122`); erro do motor → caminho legado                                                                                                                                                                         |
| `src/modules/ads/ads.routes.js`                                                                                                                                                                                                        | allowlist de query (`:80-85`): `origem`, `origem_src`, `raio`, `escopo`, `commercial_model` (entram na chave de cache)                                                                                                                          |
| `src/modules/ads/filters/ads-filter.schema.js`                                                                                                                                                                                         | os mesmos 5 parâmetros (`:276-289`); `raio` 0–150, `escopo` uf\|brasil, `origem_src` user\|geo\|session\|page                                                                                                                                   |
| `src/modules/ads/filters/ads-filter.builder.js`                                                                                                                                                                                        | **só** `export` em `shouldApplyDirtyAdGuard` (`:123`)                                                                                                                                                                                           |
| `src/modules/ads/ads.public-listing.js`                                                                                                                                                                                                | `serializeAdForListing(ad, { extraAllowedFields })` (`:150-158`) — o v1 libera `explain`, `distance_km`, `commercial_model` (`engine.js:38`, `:261`)                                                                                            |
| `src/modules/ads/ads.mutation-cache.js`                                                                                                                                                                                                | invalida `sp:*` junto com o cache legado (`:2`, `:23`)                                                                                                                                                                                          |
| `src/modules/regions/regions.service.js`                                                                                                                                                                                               | §4.5: guard `rm.layer <= 2` da Página Regional sai **só** em v1 com base na allowlist (`:13`, `:92`, `:212`, `:288`)                                                                                                                            |
| `frontend/lib/search/ads-search.ts`                                                                                                                                                                                                    | passthrough de `search_policy` (`:152`, `:388-389`) — sem lógica de ranking (R8)                                                                                                                                                                |
| `frontend/lib/buy/region-catalog-loader.ts`                                                                                                                                                                                            | não reordena no cliente quando a resposta traz `search_policy` (`:238-243`) — o SQL do v1 já ordena                                                                                                                                             |
| `.claude/launch.json`                                                                                                                                                                                                                  | duas configs locais (`f2-backend-snapshot-shadow`, `f2-backend-snapshot-v1`) para o 8.10 ao vivo                                                                                                                                                |
| `tests/search-policy/f2-resolvers.test.js` (21), `f2-scope-facets-relax.test.js` (27), `f2-engine.integration.test.js` (12), `f2-flag-off.test.js` (5), `f2-regions-guard.test.js` (4), `policy-config.test.js` (7, atualizado p/ 066) | testes desta fase                                                                                                                                                                                                                               |
| `tests/search-policy/helpers/contexts.js`, `helpers/f2-fixture.js`, `__snapshots__/legacy-sql.golden.json`                                                                                                                             | 24 contextos fixos; fixture em Postgres real (8 cidades com coordenadas reais, memberships pelo builder da F1, estoque que espelha 2026-09-07 + cenários de ranking); golden de `main`                                                          |
| `docs/F2_GATE_SQL.md` (cherry-pick), `docs/F2_EXPLAIN_ANALYZE.md`, `docs/F2_RELATORIO.md`                                                                                                                                              | gate aprovado ("SQL OK"), planos completos, este relatório                                                                                                                                                                                      |

**Não tocado (confirmação de R2, por `git diff main --stat`):** `frontend/middleware.ts`, `frontend/lib/middleware/**`, canonical, sitemaps, H1, layout/shell 1600, drawer mobile, header, pagamentos, `src/shared/cache/cache.middleware.js`, `src/infrastructure/cache/redis.js`, `ads-filter.parser.js`, `ads-free-query.parser.js`, `ads.model`. Nenhuma coluna renomeada/removida/alterada de tipo. Fora do motor, o frontend mudou em **2 arquivos** e só para repassar/não reordenar (R8).

---

## 2. O que foi feito, item por item

### 2.1 Flag e integração no controller (§4.9, R4)

- `off` (default e valor desconhecido): `flag.js:21`. O controller nem chama o motor; teste `f2-flag-off.test.js:77-88` (motor nunca chamado) + golden dos 24 contextos.
- `shadow`: resposta legada sai **antes** (`ads.controller.js:113-116`); depois `runShadowComparison` (`:120-122`, fire-and-forget com `catch`). O shadow calcula escopo + count + primeiro id com timeout de **300 ms** (`engine.js:35`, `Promise.race` `:400`), grava `search.executed` com `old_count/old_first_ad_id/new_count/new_first_ad_id/shadow_ms` (`:404-421`) e **nunca** altera a resposta (teste `f2-engine.integration.test.js:331`: `JSON.stringify(legacy)` igual antes e depois). O shadow **não** consulta a allowlist — mede toda busca; a allowlist só governa o `v1`.
- `v1`: `runSearchPolicyEngineIfAllowed` (`engine.js:341-345`) devolve `null` se a origem está fora da allowlist **ou** se a requisição traz chave legada que o motor não modela (§2.15); `null` ⇒ caminho legado para aquela requisição (`ads.controller.js:92-98`). Exceção inesperada do motor ⇒ `logger.error` + caminho legado (`:99-105`, teste `f2-flag-off.test.js:130-139`).

### 2.2 Cache (instrução A + E4)

`policy-cache.js`: Redis quando `redis.js` exporta cliente (`:23`, `:68-70`), senão LRU em processo com **200** chaves (`:31`), TTL por entrada sem timers (nada mantém o processo vivo). Chaves `sp:liq:{origem}:{perfil}:{sha1(productScope)}` (liquidez, **900 s**, `scope-resolver.js:343`) e `sp:relax:{sha1(contexto)}` (**60 s**, `relaxations.js`). O cache de liquidez guarda **só** `{city_id, slug, distance_km, count}` por cidade (E4; nome/UF são resolvidos na emissão, `scope-resolver.js:360`). Invalidação por prefixo em toda mutação de anúncio (`ads.mutation-cache.js:23` → `policy-cache.js:122`). Testes: `f2-scope-facets-relax.test.js:503-532` (backend memória, TTL, teto 200 com evicção do menos recente, invalidação por prefixo).

### 2.3 Texto, dicionários e ProductResolver (§4.3, D2)

- Fronteira de palavra Unicode (`text.js:51`): `"ico"` **não** casa em `"automatico"`, `"at"` **não** casa em `"atibaia"`/`"fiat"` (`f2-resolvers.test.js:104`). Preço e ano com as mesmas regras do legado (`:114`). Residual usa a **mesma** lista de stopwords do legado (`ads-free-query.constants.js`), por isso `"carro em bom estado"` → `"bom estado"`.
- Dicionários (`dictionaries.js`): marcas com o SELECT do legado (`:33-47`; ver §5.4), modelos comerciais ACTIVE + guard de dados sujos (`:60`), cidades com ≥ 1 ACTIVE (`:87`) — só as que o texto pode escolher.
- `resolveProduct` (`product-resolver.js:71`): `"onix automático até 75 mil"` → `commercial_model=Onix`, `transmission=automatico`, `price_max=75000`, residual vazio, **sem** marca implícita (gate: specificity 3, 3 chips). Explícito vence inferido só quando veio na URL (`:156-166`). O parser legado segue intocado e os bugs Icó/"at" ficam registrados como pendência do caminho `off` para F5 (§5.13).

### 2.4 LocationResolver (§4.2, D1)

`location-resolver.js:109-174`: `origem` + `origem_src=user` → USER_SELECTED (`:122`, vence cidade explícita no texto); cidade explícita no `q` com estoque → EXPLICIT_QUERY e o `q` perde a cidade (`:136`); `origem` sem `origem_src` ou `=page`, `city_slug`, `city_slugs[0]`, `city_id` → CITY_PAGE (`:151-156`); `origem_src=geo|session` → GEOLOCATION/SESSION_DEFAULT (`:168`); nada → NONE com `uf` do `state` legado (`:174`). Cidade sem estoque (Icó) **não** move a origem (`f2-resolvers.test.js:247`).

### 2.5 IntentResolver (§4.3)

`intent-resolver.js:37`: BROWSE_CITY / BROWSE_CATEGORY / SEARCH_BRAND / SEARCH_MODEL / SEARCH_MODEL_YEAR / SEARCH_VERSION, `target` e `max_auto_radius` por perfil vindos de `search_policy` (tabela de perfis e desempate em `f2-resolvers.test.js:256-300`).

### 2.6 ScopeResolver (§4.4, D5, D7, E1, E3)

- `resolveGeoRequest` (`scope-resolver.js:49`): `escopo=brasil|uf`; `raio` só vale se está em `rings_manual` (0 → EXACT_CITY; fora da lista → AUTO, DEFAULT §12); **sem origem, `state=` legado ⇒ STATE** (§2.15).
- Liquidez (`:145`): **uma** query por cidade com `$2 = max_auto_radius` em **todos** os modos com origem (E1); subconsulta D7 agregada por `city_id`, com os 4 JOINs e o `productScope` — SQL idêntico ao gate aprovado.
- AUTO_RADIUS (`:75`): `required_distance_km` = distância em que o acumulado atinge o `target`; `effective` = menor anel de `rings_auto` ≥ required; `CAP_REACHED` em 150. Anéis (`:114`, D5): `rings_manual` sempre; o anel 150 só quando `effective = 150`, com `auto:true` e **sem** `url_params` (`f2-scope-facets-relax.test.js:186`).
- `search_policy.cities` = origem + cidades com `count > 0`, mais `territory_city_count` (E3) — `f2-engine.integration.test.js:316-322` (Bragança: `["braganca-paulista-sp","atibaia-sp"]`, `territory_city_count > 2`, `local_result_count = 2` na fixture).

### 2.7 CandidateScope (§4.1, D3)

`candidate-scope.js`: `status='active'` + guard de dados sujos idêntico ao legado (`:51`, via `shouldApplyDirtyAdGuard` exportada), cláusulas de produto (`:62`; `commercial_model` por igualdade case-insensitive, NULL excluído), território por **uma** subconsulta `SELECT member_city_id FROM region_memberships WHERE base_city_id = $origem AND distance_km <= $raio` (`:134`; EXACT usa `$raio = 0`) ou `UPPER(a.state) = $uf` (`:137`). Todas as 5 queries (grid, count, facetas, liquidez, relaxações) saem do mesmo escopo; teste estrutural "todo alias usado tem FROM/JOIN" nas 5, com prova de alcance por mutação (`f2-engine.integration.test.js:48-71`).

### 2.8 Ranking v1 e Página Regional (§4.5)

- `relevance` (`engine.js:96-103`): `commercialLayerExpr DESC, COALESCE(rm.distance_km,0) ASC, text_rank DESC (só com q), a.created_at DESC, a.id ASC`, com `LEFT JOIN region_memberships rm ON rm.base_city_id = $origem AND rm.member_city_id = a.city_id`. Demais `sort` delegam ao `buildSortClause` legado (`price_asc` inalterado — `f2-engine.integration.test.js:201-238`).
- Fixture 8.4 a partir de Bragança: Destaque a 18 km > Pró a 0 km > Pró a 18 km; Destaque expirado ordena pelo plano; Spin Destaque não entra em `q=onix`; página 2 não repete página 1 (`:169-238`).
- Página Regional: `legacyLayerGuardFor(baseSlug)` (`regions.service.js:13`) mantém `AND rm.layer <= 2` (`:92`) em `off`, `shadow` e em `v1` fora da allowlist; só sai em `v1` com a base na allowlist (`f2-regions-guard.test.js`, 4 casos com o SQL emitido).

### 2.9 Facetas (§5.2, D6, E2)

`facets-policy.js`: **uma** query `GROUPING SETS` para as facetas sem filtro ativo (`:209-220`) + uma por faceta ativa, self-excluding (`:225`); `assembleFacets` (`:292`) remove `count 0`, mantém a opção ativa mesmo com 0 marcada `active:true` (E2, `:298`), remove faceta de 1 opção salvo ativa; versão só com modelo. Abertura (`:360-362`): `always_open` (`["price"]`, D6) + maiores entropias até `open_max = 3` **incluindo** as `always_open`; faceta ativa abre sem consumir vaga. Bragança (25 km): abre `price`, `brand`, `commercial_model` (entropias do gate: modelo 3,87 · marca 2,92 · ano 2,15 · preço 1,57 — `f2-scope-facets-relax.test.js:217-251`). Atibaia: Modelo mostra "Onix (6)" (`f2-engine.integration.test.js:241`).

### 2.10 Relaxações (§4.7, D4, D8)

`relaxations.js:29`: raio → próximo anel de `rings_manual` (SEARCH\__ chega a 150, BROWSE para em 75); `year_from −2` (mín. 1990, `:53`); `price_max` → `ceil(×1,15 / 1000) × 1000` (75 000 → **87 000**); `mileage_max` → `ceil(×1,25 / 5000) × 5000`; remoções com os textos de §7.6. Contagem de todas as variantes em **uma** query `COUNT(_) FILTER` (`:125`, `:177`), cache 60 s. Fixture D8 (6 Onix da §3.3 do gate): `q=onix automático até 75 mil`em Atibaia → total 0,`[{transmission,+3},{price_max 87000,+1}]`, sem `radius` (efetivo já é 150), ordem por ganho (`f2-engine.integration.test.js:281-313`). Acima do target não há relaxação (`:316`).

### 2.11 Chips (§5.4)

`chips.js:17`: um chip por parâmetro; o chip geo não é removível na página de cidade (CITY_PAGE) e é removível em `/comprar` com origem escolhida (`f2-scope-facets-relax.test.js:371-425`).

### 2.12 Telemetria (§4.8)

`telemetry.js:61-66`: `INSERT INTO analytics_events (event_type='search.executed', path, entity_type='search', city_slug, city_name, state, payload)`; `payload` (`:20-58`) com q, residual, perfil, especificidade, origem, `location_source`, geo_mode, raios pedido/necessário/efetivo, contagens local/total, `expanded`, `reason`, relaxações exibidas, versão da política, modo da flag, backend de cache e, no shadow, `old/new` + `shadow_ms` (+ `shadow_timeout` quando estourou). Best-effort: nunca lança; em erro de schema (`42703` coluna ausente, `23514` CHECK) registra **um** warn e se desliga até o restart (`:18`, `:80-83`) — sem isso o modo shadow geraria um warn por busca. A migration 066 é o pré-requisito (§2.14).

### 2.13 Resposta §6 e contrato HTTP

`runSearchPolicyEngine` (`engine.js:236-299`) devolve `{ ok, filters, data, pagination, search_policy, chips, facets, relaxations }`; `data` passa pelo **mesmo** `serializeAdsForListing` do legado, liberando só `explain`, `distance_km`, `commercial_model` (`ads.public-listing.js:150-158`, `engine.js:38`). Parâmetros novos aceitos e validados: `origem`, `origem_src`, `raio` (0–150), `escopo`, `commercial_model` (`ads-filter.schema.js:276-289`), na allowlist da rota e na chave do cache HTTP (`ads.routes.js:80-85`; `tests/ads/ads-cache-key-covers-filters.test.js` verde).

### 2.14 Migration 066 (aditiva, com uma ressalva — §5.1)

1. `ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS payload JSONB NULL` (`:26`).
2. `facets.always_open = ["price"]` em `platform_settings.search_policy`, só se a chave ainda não existir (`:30-35`); `policy-config.test.js` prova `065 + 066 == SEARCH_POLICY_DEFAULT`.
3. CHECK `analytics_events_event_type_chk` (allowlist **fechada** da migration 036, sem `search.executed` — descoberto quando o teste 8.8 gravou 0 linhas): recriado como **superconjunto** da definição atual lida do catálogo (`regexp_matches(pg_get_constraintdef(…))`, `:57-60`), `NOT VALID` + `VALIDATE` para não segurar `ACCESS EXCLUSIVE` durante a varredura (`:68-73`); idempotente (sai se `'search.executed'` já consta); `RAISE` se não conseguir ler a lista — **nunca derruba a constraint sem a nova pronta**. Aplicada duas vezes no snapshot (segunda execução no-op) e validada por INSERT de prova; o banco descartável dos testes a recebe pelo runner real, e o teste 8.8 só passa com ela.

### 2.15 "Só assume o que modela" — achados do 8.10 ao vivo, corrigidos nesta fase

O shadow rodando contra o frontend atual mostrou duas requisições do contrato legado que o v1 responderia **pior do que hoje**:

| Requisição (widget)                                              | Legado                              | Motor antes                                                             | Correção                                                                                                                                                                                                                                                                                                                                                                                                            |
| ---------------------------------------------------------------- | ----------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `highlight_only=true&sort=highlight` (Destaques da home)         | `WHERE highlight_until > NOW()` → 0 | ignorava a chave → **34**                                               | chave em `ENGINE_LEGACY_ONLY_KEYS` (`engine.js:314-327`): `v1` recua ao legado **sem tocar o banco** (`:342`) e o shadow grava `skipped: "unsupported_params"` (`:355-377`). Também `model` (ILIKE na descrição FIPE), `highlight`, `featured`, `city`, `seller_type` e `city_slugs` com 2+ cidades (lista fechada da Página Regional). Teste `f2-engine.integration.test.js:376` com `db` que lança se consultado. |
| `state=SP` sem cidade ("recentes em SP", "abaixo da FIPE em SP") | `a.state = 'SP'`                    | NATIONAL sem filtro de UF (coincidia porque hoje 100 % do estoque é SP) | `state=` sem origem ⇒ modo **STATE** (`scope-resolver.js:49-56`, `engine.js:73`). Prova na fixture: RJ = 1, MG = 2, SP = 37, sem `state` = 40 (`f2-engine.integration.test.js:360`).                                                                                                                                                                                                                                |

Ao vivo, depois da correção (backend `shadow` reiniciado): `highlight_only=true` → evento com `skipped=unsupported_params`, `unsupported_params=["highlight_only"]`, `new_count=null`, resposta legada intacta (`total: 0`).

---

## 3. Testes

| Suíte                                                                                                                                                                                   | Resultado                                                                                                           | Comando                                                                                                                                                                                                                                                                                                 |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/search-policy/` (10 arquivos: F2 = resolvedores 21, escopo/facetas/relaxações/chips/cache 27, integração em Postgres real 12, flag off 5, guard regional 4, política 7; F1 = 34) | ✅ **109**                                                                                                          | `SKIP_INTEGRATION_ADS=1 NODE_ENV=test DISABLE_REDIS=true PG_SSL_MODE=disable DATABASE_URL=…5434/carros_na_cidade_snapshot TEST_DATABASE_URL=… npx vitest run tests/search-policy`                                                                                                                       |
| `tests/search-policy` + `tests/ads/ads-cache-key-covers-filters.test.js` (3) + `tests/regions/` (29)                                                                                    | ✅ **14 arquivos, 142**                                                                                             | idem, com os três caminhos                                                                                                                                                                                                                                                                              |
| Backend completo (exceto `tests/integration/**`)                                                                                                                                        | ✅ **233 arquivos, 3.756 testes**, 1 skipped                                                                        | `SKIP_INTEGRATION_ADS=1 NODE_ENV=test npx vitest run --exclude "tests/integration/**"` (com `NODE_ENV=development` 4 testes de "não vazar erro interno" falham por incluírem stack em dev — ambiente, não F2: os dois arquivos não importam nada de `search-policy` e passam 23/23 com `NODE_ENV=test`) |
| Frontend — typecheck                                                                                                                                                                    | ✅ `tsc --noEmit` limpo                                                                                             | `cd frontend && npx tsc --noEmit`                                                                                                                                                                                                                                                                       |
| Frontend — gates de middleware, sitemaps, robots, busca, catálogo, território (8.10)                                                                                                    | ✅ **56 arquivos, 1.157 testes**                                                                                    | `cd frontend && npx vitest run lib/middleware lib/seo app/sitemaps lib/search lib/buy lib/territory "app/comprar/cidade/[slug]/robots-gate.test.ts"`                                                                                                                                                    |
| ESLint (`src/modules/ads`, `src/modules/regions`, `src/database`, `tests/search-policy`)                                                                                                | ✅ 0 erros, 0 avisos novos (o único aviso restante, `total_count` em `regions.service.js`, já existe em `main:552`) | `npx eslint … --ext .js`                                                                                                                                                                                                                                                                                |
| Prettier (gate incremental)                                                                                                                                                             | ✅ 14 arquivos novos formatados; os arquivos legados tocados já estavam conformes                                   | `npx prettier --check <tocados>`                                                                                                                                                                                                                                                                        |

Mapa dos testes pedidos: **8.1** paridade `COUNT(grid sem LIMIT) == count == Σ faceta seller_kind == rings[effective].count` nos 24 contextos + estrutural nas 5 queries (`f2-engine.integration.test.js:128`); **8.3** AUTO_RADIUS (`f2-scope-facets-relax.test.js:46-164`); **8.4** ranking (`:169-238`); **8.5** LocationResolver/D1 (`f2-resolvers.test.js:174-252`); **8.6** facetas (`f2-engine.integration.test.js:241`, unitários `f2-scope-facets-relax.test.js:215-294`); **8.7** relaxações (`:281-320`); **8.8** shadow + flag off (`:331`, `f2-flag-off.test.js`); **8.10** abaixo.

**8.10 — invariantes ao vivo** (frontend do HEAD em `next dev` + backend do HEAD contra o snapshot, primeiro em `shadow`, depois em `v1` com allowlist `*`):

| URL (backend em **shadow**)                                                                                                                                                      | Resultado                                                                                                                                                                     |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/carros-em/braganca-paulista-sp`                                                                                                                                                | 200 · `noindex, follow` · canonical limpa · 1 card (= produção)                                                                                                               |
| `/carros-em/braganca-paulista-sp?raio=25`                                                                                                                                        | 200 · canonical == `/carros-em/braganca-paulista-sp`                                                                                                                          |
| `/carros-em/extrema-mg`, `/carros-em/campinas-sp`                                                                                                                                | **404** `x-middleware-city-gate: blocked-no-active-ads`                                                                                                                       |
| `/carros-usados/regiao/braganca-paulista-sp`                                                                                                                                     | 200 · `x-middleware-regional: passed-valid` · 34 cards                                                                                                                        |
| `/carros-em/atibaia-sp` / `?q=onix`                                                                                                                                              | 200 · 33 / 6 cards                                                                                                                                                            |
| `/comprar/cidade/braganca-paulista-sp`                                                                                                                                           | 308 `x-middleware-canonical: legacy-city`                                                                                                                                     |
| sitemaps × produção (`/sitemap.xml` 9/9, `core` 4/4, `content` 2/2, `cities` 1/1, `brands` 5/5, `models` 2/2, `below-fipe` 1/1, `blog` 13/13, `vehicles` 34/34, `regiao/sp` 9/9) | **bytes idênticos** após normalizar host e `lastmod`                                                                                                                          |
| eventos `search.executed` gravados                                                                                                                                               | 1 por chamada a `/api/ads/search`; `shadow_ms` entre 4 e 91 ms; 0 timeouts; ex.: Bragança `old 1 / new 34` (o raio automático é o objetivo), Atibaia `33/33`, `?q=onix` `6/6` |

| URL (backend em **v1**, frontend atual)                                    | Resultado                                                                                                                                                                                                                                                         |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/ads/search?city_slug=braganca-paulista-sp` (direto)                  | `total 34`, `search_policy{version v1, BROWSE_CITY, AUTO_RADIUS, 25 km, LOW_LOCAL_LIQUIDITY, territory_city_count 8, cities braganca=1/atibaia=33}`, itens com `distance_km 18.34` e `explain`, facetas `price* brand* commercial_model*`, chip geo não removível |
| `/api/ads/search?q=onix automático até 75 mil&origem=atibaia-sp` (direto)  | `total 0`, SEARCH_MODEL, 150 km `AUTO_RADIUS_CAP_REACHED`, 223 cidades, relaxações `transmission +3` / `price_max 87000 +1`, anel 150 `auto:true` — igual ao gate                                                                                                 |
| `/`, `/carros-em/*`, `/carros-usados/regiao/*`, `/comprar?…` pelo frontend | todos 200, 0 marcas de erro no HTML, 0 erros no log do `next dev`; a Página Regional (`city_slugs` múltiplos) e os widgets da home (`highlight_only`) recuam ao legado                                                                                            |

Dois fatos do frontend **atual** ficaram registrados para F3 (§6): `/comprar` não repassa `origem` ao backend (a busca chegou como `location_source: NONE`) e a página de cidade não consome `search_policy` (segue mostrando só o card local).

---

## 4. Medições

### EXPLAIN (ANALYZE, BUFFERS) das 5 queries novas — Bragança e Atibaia, dois perfis

Snapshot local (PG 18.6, 696.746 memberships, 34 ACTIVE). Planos completos em `docs/F2_EXPLAIN_ANALYZE.md`.

| contexto                                               | query                                 |                     planning ms | execution ms | shared hit |
| ------------------------------------------------------ | ------------------------------------- | ------------------------------: | -----------: | ---------: |
| Bragança · BROWSE_CITY                                 | 1. liquidez por cidade (D7/E1)        |                           0,548 |        0,675 |        153 |
| Bragança · BROWSE_CITY                                 | 2. grid (página 1)                    |                           5,066 |        1,547 |        464 |
| Bragança · BROWSE_CITY                                 | 3. count                              |                           0,316 |        0,056 |         23 |
| Bragança · BROWSE_CITY                                 | 4. facetas (GROUPING SETS)            |                           0,560 |        0,180 |        159 |
| Bragança · BROWSE_CITY                                 | 5. relaxações                         | — (total 34 ≥ target; não roda) |              |            |
| Bragança · SEARCH_MODEL (q=onix automático até 75 mil) | 1. liquidez                           |                           0,715 |        0,973 |        146 |
| Bragança · SEARCH_MODEL                                | 2. grid                               |                           1,091 |        0,110 |         19 |
| Bragança · SEARCH_MODEL                                | 3. count                              |                           0,322 |        0,052 |         19 |
| Bragança · SEARCH_MODEL                                | 4. facetas                            |                           0,551 |        0,072 |         19 |
| Bragança · SEARCH_MODEL                                | 5. relaxações (COUNT FILTER, 1 query) |                           0,238 |        0,067 |         27 |
| Atibaia · BROWSE_CITY                                  | 1. liquidez                           |                           0,444 |        0,675 |        153 |
| Atibaia · BROWSE_CITY                                  | 2. grid                               |                           1,429 |        0,454 |        443 |
| Atibaia · BROWSE_CITY                                  | 3. count                              |                           0,258 |        0,037 |         14 |
| Atibaia · BROWSE_CITY                                  | 4. facetas                            |                           0,528 |        0,180 |        146 |
| Atibaia · SEARCH_MODEL                                 | 1. liquidez                           |                           0,432 |        0,757 |        146 |
| Atibaia · SEARCH_MODEL                                 | 2. grid                               |                           0,965 |        0,089 |         19 |
| Atibaia · SEARCH_MODEL                                 | 3. count                              |                           0,298 |        0,047 |         19 |
| Atibaia · SEARCH_MODEL                                 | 4. facetas                            |                           0,556 |        0,072 |         19 |
| Atibaia · SEARCH_MODEL                                 | 5. relaxações                         |                           0,259 |        0,076 |         27 |

Todas as execuções ficam abaixo de 1,6 ms; a liquidez usa o índice `(base_city_id, distance_km)` da migration 063 (Index Scan em `region_memberships`, ver planos). O custo dominante é planning do grid (≤ 5 ms a frio).

### Latência in-process (snapshot local; N = 40 por linha após aquecimento; sem HTTP, sem `cache.middleware`)

| contexto                  | caminho                                                                 | p50 ms | p95 ms | max ms |
| ------------------------- | ----------------------------------------------------------------------- | -----: | -----: | -----: |
| CTX1 Bragança BROWSE_CITY | legado (`parseAdsFilters` + `ads.service.search`)                       |    3,4 |    4,5 |    4,7 |
| CTX1                      | motor v1, cache frio (LRU limpo a cada execução)                        |    7,9 |    8,9 |    9,4 |
| CTX1                      | motor v1, cache quente (liquidez + relaxações no LRU)                   |    6,5 |    9,0 |    9,7 |
| CTX1                      | shadow = legado + `runShadowComparison` (inclui o INSERT da telemetria) |    8,5 |   10,9 |   14,4 |
| CTX2 Atibaia SEARCH_MODEL | legado                                                                  |    5,9 |    7,1 |    7,3 |
| CTX2                      | motor v1, cache frio                                                    |    9,5 |   11,1 |   11,7 |
| CTX2                      | motor v1, cache quente                                                  |    6,1 |    7,3 |    8,4 |
| CTX2                      | shadow                                                                  |   11,1 |   18,2 |   18,4 |

Leitura: o motor custa **+3 a +5 ms** sobre o legado em processo (5 queries em vez de 2–3) e o shadow soma **+5 a +11 ms de CPU/banco por busca, depois da resposta** — a latência percebida não muda, porque o shadow começa após `res.json` (`ads.controller.js:113-122`). **Não é medida de produção**: mesma máquina, banco local, sem rede até o Render. Backend de cache nas duas medições: `memory`.

DOM/sidebar: N/A nesta fase (F3).

---

## 5. Divergências em relação ao prompt

1. **Migration 066 recria o CHECK `analytics_events_event_type_chk`** (`DROP CONSTRAINT` + `ADD … NOT VALID` + `VALIDATE`). É a única instrução fora da lista de R3 nesta fase e é obrigatória: a allowlist da 036 é fechada e o evento `search.executed` não entra nela (INSERT falha com 23514 — foi assim que o teste 8.8 pegou). A nova lista é **superconjunto** da atual, lida do catálogo (não hardcoded): nenhuma linha existente passa a violar, nenhum valor que só exista em produção é derrubado. Rollback em §7.
2. **`cities.normalized_name` não é lida.** A coluna existe em produção mas **não vem de migration nenhuma** (`grep normalized_name src/database/migrations/` vazio; o banco descartável dos testes não a tem). O dicionário de cidades deriva a forma normalizada de `name` com o mesmo `normalizeText` aplicado ao `q` (`dictionaries.js:87-104`). Mesma categoria da função de search_vector não versionada achada na F1.
3. **Telemetria se desliga sozinha** em erro de schema (§2.12) — o prompt pede best-effort; o desligamento com um único warn é o que evita um warn por busca em shadow se a 066 não tiver rodado.
4. **Dicionário de marcas com loader próprio** (`dictionaries.js:33-47`): o `loadBrandDictionary` legado usa o pool global e ignoraria o banco passado pelos testes de integração. Mesmo SELECT (limite 300, guard de dados sujos).
5. **Chaves legadas não modeladas ⇒ legado** e **`state=` sem origem ⇒ STATE** (§2.15). Não estão no prompt; sem elas o `v1` seria pior do que hoje em duas requisições reais do frontend atual.
6. **Sem marca implícita a partir do modelo** (`product-resolver.js:95-98`) — o gate aprovado descreve specificity 3 e 3 chips para `"onix automático até 75 mil"`.
7. **`raio` fora de `rings_manual` é ignorado** (volta ao automático) em vez de rejeitado; o schema aceita 0–150 para não gerar 400 em URL antiga.
8. **Residual com 1 token vale** (DEFAULT §12) e usa a lista de stopwords do legado.
9. **`data`, não `items`**, no §6: mantém o contrato do frontend atual (`normalizeSearchPayload`) — o restante do envelope (`search_policy`, `chips`, `facets`, `relaxations`) é o do prompt.
10. **Perfil de filtro isolado sem texto = BROWSE_CATEGORY**; faixas de quilometragem são as de `SEARCH_POLICY_DEFAULT` (`facets-policy.js:MILEAGE_BUCKETS`).
11. **Testes 8.1/8.4/8.6/8.7/8.8 rodam em banco descartável com fixture** (8 cidades reais, estoque que espelha 2026-09-07 + 3 anúncios de ranking), não contra a tabela nacional: no CI não há IBGE. Os números do gate foram reproduzidos no snapshot nacional (§3, 8.10 em v1) e batem.
12. **Golden do SQL legado = `main @ 64517384`**: é a prova de R4 desta fase; quando F5 apagar o parser antigo, o golden vai junto.
13. **Bugs Icó e "at" seguem vivos no caminho `off`** (parser legado intocado, D2) — pendência de F5. O resolvedor v1 não os tem (`f2-resolvers.test.js:104`, `:147`).
14. **Dois arquivos do frontend tocados** (passthrough e não-reordenação, R8), quando o prompt reserva o frontend para F3: sem eles a resposta v1 perderia `search_policy` na BFF e seria reordenada no cliente contra o SQL do motor.
15. **`.claude/launch.json` ganhou duas configs** locais (shadow/v1) para o 8.10 ao vivo — sem efeito em produção.
16. **`docs/Search_Policy_Engine_v2_1_Consolidado.md`** continua ausente — releitura pendente.

Nenhuma divergência de comportamento nas superfícies de leitura com a flag `off`.

## 6. DEFAULTS aplicados e dúvidas

- `SHADOW_TIMEOUT_MS = 300` (`engine.js:35`); a telemetria do shadow é gravada **depois** do `Promise.race`, fora do orçamento dos 300 ms.
- TTLs: liquidez 900 s (`search_policy.liquidity_cache_ttl_seconds`, default 900), relaxações 60 s; LRU 200 chaves; prefixos `sp:liq`/`sp:relax`.
- `$2` da liquidez = `max_auto_radius` do perfil (E1); EXACT_CITY usa `raio = 0` na mesma subconsulta (D3).
- Campos extras do item em v1: `explain`, `distance_km`, `commercial_model` (`engine.js:38`); o restante do card é o `serializeAdForListing` de sempre.
- `entity_type = 'search'` em `search.executed`; `city_slug/city_name/state` da origem quando há.
- Modo da flag desconhecido ⇒ `off`; `SEARCH_POLICY_ENGINE_CITIES` ausente ⇒ **nenhuma** origem permitida em v1 (origem `null` só entra com `"*"`).
- Shadow ignora a allowlist (mede tudo).

**Registrado para F3** (frontend): (a) `submitSearch` envia `origem_src=page` na página de cidade e `origem_src=user` quando o usuário escolhe a cidade (D1); (b) `/comprar` precisa repassar `origem`, `origem_src`, `raio`, `escopo` ao `/api/ads/search` — hoje não repassa (`search.executed` chegou com `location_source: NONE`); (c) o filtro de modelo do sidebar deve enviar `commercial_model`, não `model` (enquanto enviar `model`, o v1 recua ao legado por §2.15); (d) a página de cidade consome `search_policy.cities`/`rings` (hoje só o card local aparece, embora a resposta v1 traga 34); (e) Página Regional: decidir se continua com `city_slugs` (legado) ou passa a `origem + raio`.

Sem dúvidas bloqueantes.

## 7. Execução em produção, como desligar e como reverter

**Pré-requisito (instrução sua):** só depois de você colar aqui o `PROSSIGA` de `npm run regions:verify -- --backup-table=<nome>` e de `npm run ads:verify-commercial-model` rodados no shell do Render. Até lá: **nada é mergeado nem deployado**; a branch fica em `f2/nucleo` com PR aberto.

### Procedimento — após "APROVADO F2", pelo pipeline

1. **Merge** do PR `f2/nucleo` → `main`; deploy. A 066 roda no boot (`RUN_MIGRATIONS=true`); conferir no log do boot a linha da `066_search_policy_f2.sql` e, no shell do Render (leitura):

```sql
SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'analytics_events_event_type_chk';
-- esperado: a lista de hoje + 'search.executed'
SELECT value->'facets'->'always_open' FROM platform_settings WHERE key = 'search_policy';
-- esperado: ["price"]
```

2. **Shadow**: no Render, `SEARCH_POLICY_ENGINE=shadow` (e `SEARCH_POLICY_ENGINE_CITIES=braganca-paulista-sp,atibaia-sp`, que só vale para o v1 em F4). Restart. `/health` continua `redis: disabled` — backend de cache `memory`.

3. **Leitura após 24 h** (shell do Render, somente leitura):

```sql
SELECT payload->>'flag_mode' AS modo,
       COUNT(*) AS eventos,
       COUNT(*) FILTER (WHERE payload ? 'skipped') AS pulados_legado,
       COUNT(*) FILTER (WHERE (payload->>'shadow_timeout')::boolean) AS timeouts,
       ROUND(AVG((payload->>'shadow_ms')::numeric), 1) AS shadow_ms_medio,
       MAX((payload->>'shadow_ms')::numeric) AS shadow_ms_max,
       COUNT(*) FILTER (WHERE NOT (payload ? 'skipped')
                          AND payload->>'old_count' IS DISTINCT FROM payload->>'new_count') AS contagens_divergentes
  FROM analytics_events
 WHERE event_type = 'search.executed' AND occurred_at > NOW() - INTERVAL '1 day'
 GROUP BY 1;

SELECT path, payload->>'profile' perfil, payload->>'geo_mode' geo, payload->>'effective_radius' raio,
       payload->>'old_count' old, payload->>'new_count' new, payload->>'shadow_ms' ms
  FROM analytics_events
 WHERE event_type = 'search.executed' AND payload->>'flag_mode' = 'shadow'
 ORDER BY id DESC LIMIT 30;
```

Critério de aceite do shadow (para F4): 0 timeouts sustentados, `shadow_ms_max` < 300, divergências explicáveis pelo raio automático (Bragança `1 → 34` é o esperado) e `pulados_legado` restrito a `highlight_only`/`city_slugs`/`model`.

### Desligar

`SEARCH_POLICY_ENGINE=off` (ou remover a variável) + restart. O caminho legado é byte a byte o de `main` (golden). A 066 pode ficar: coluna `payload` NULL e CHECK superconjunto não mudam nenhuma leitura.

### Reverter

- Código: revert do PR de `f2/nucleo`.
- Banco (só se quiser o schema exatamente como antes; o motor desligado não depende disto). Antes, conferir a lista atual com `pg_get_constraintdef` e reproduzi-la sem `'search.executed'`:

```sql
DELETE FROM analytics_events WHERE event_type = 'search.executed';
ALTER TABLE analytics_events DROP CONSTRAINT IF EXISTS analytics_events_event_type_chk;
ALTER TABLE analytics_events ADD CONSTRAINT analytics_events_event_type_chk CHECK (event_type IN (
  'page_view','ad_view','city_page_view','region_page_view','below_fipe_page_view','blog_view',
  'whatsapp_click','phone_click','finance_click','search_performed','seller_store_view'));
ALTER TABLE analytics_events DROP COLUMN IF EXISTS payload;
UPDATE platform_settings SET value = value #- '{facets,always_open}', updated_at = NOW() WHERE key = 'search_policy';
DELETE FROM schema_migrations WHERE filename = '066_search_policy_f2.sql';
```
