# F1 — Relatório (formato fixo, seção 11 do prompt)

Data: 2026-09-07 (revisão pós-aprovação condicionada no mesmo dia) · Branch: `f1/dados` (nascida de `origin/main @ 65bc2e95`, base A aprovada em F0)
Banco de execução: snapshot de produção em Postgres 18 local (`localhost:5434/carros_na_cidade_snapshot`). `DATABASE_URL1` não recebeu nenhuma escrita.

**Comportamento de leitura inalterado (R4).** Todo consumidor de `region_memberships` fora do motor novo recebeu o guard `layer <= 3`, e o rebuild nunca atribui layer ≤ 3 a linha nova quando a tabela já tem vizinhança. Provado por `EXCEPT` nos dois sentidos contra a tabela pré-F1: **0 e 0** (§2.1a). Nenhum consumidor de `commercial_model` ou de `search_policy` existe ainda (o motor é F2).

Releitura de `docs/Search_Policy_Engine_v2_1_Consolidado.md`: **arquivo ainda ausente** em `origin/main` na última verificação (`git cat-file -e origin/main:docs/…` → não existe). A releitura de 5 linhas sai assim que ele estiver commitado; F2 não começa antes disso.

---

## 1. Escopo tocado / não tocado

**Tocado (25 arquivos):**

| Arquivo | O quê |
|---|---|
| `src/database/migrations/063_region_memberships_base_dist_index.sql` | novo — `CREATE INDEX IF NOT EXISTS idx_region_memberships_base_dist (base_city_id, distance_km)` |
| `src/database/migrations/064_ads_commercial_model.sql` | novo — `ADD COLUMN commercial_model TEXT NULL`, índice `(commercial_model, status)`, `setweight(…,'A')` nas DUAS funções de search_vector, trigger 019 recriado com `commercial_model` na lista OF |
| `src/database/migrations/065_search_policy_settings.sql` | novo — `INSERT … search_policy … ON CONFLICT DO NOTHING`; `UPDATE subscription_plans SET weight = 1.00` (D7) |
| `src/modules/regions/region-memberships.builder.js` | novo — construtor puro (com preservação de `layer`), troca transacional, backup, comparação linha a linha, recompute por cidade |
| `scripts/build-region-memberships.mjs` | reescrito — sem filtro de UF, 150 km, `--dry-run` com prova de superconjunto, `--backup-table=`, rollback impresso; exports legados mantidos |
| `scripts/backfill-ads-commercial-model.mjs` | novo — backfill idempotente, `--dry-run`, lista de NULL, checagem do search_vector |
| `scripts/recompute-city-memberships.mjs` | novo — CLI do caminho do worker (uma cidade) |
| **`src/modules/cities/cities.repository.js`** | **guard `layer <= 3`** em `findRadiusDonor` e `hasRegionMemberships` |
| **`src/read-models/cities/regional-radius.repository.js`** | **guard `layer <= 3`** em `getRadiusMembers` |
| **`scripts/verify-sitemap-brand-slug.mjs`** | **guard `layer <= 3`** no recorte de região (+ reformatado pelo Prettier, exigência do gate incremental) |
| `src/queues/city-geo-changed.queue.js`, `src/workers/cities/city-geo-changed.worker.js`, `src/infrastructure/queue/queue.constants.js`, `src/workers/bootstrap/bootstrap.registry.js` | fila/worker BullMQ `cities.geo-changed` + registro (`RUN_WORKER_CITY_GEO_CHANGED`) |
| `scripts/seed-cities-geo.mjs` | ao preencher lat/lng de ≤50 cidades, enfileira/recomputa cada uma; acima disso recomenda `regions:build` |
| `src/modules/ads/ads.repository.js` | `createAd`/`updateAd` gravam `commercial_model` via `deriveCommercialModel(model, { brand })` |
| `src/modules/ads/search-policy/policy-config.js` | novo — `SEARCH_POLICY_DEFAULT` + `loadSearchPolicy()` (sem consumidor até F2) |
| `package.json` | scripts `regions:build:dry-run`, `ads:backfill-commercial-model[:dry-run]` |
| `tests/search-policy/*.test.js` (5 arquivos) | testes desta fase |
| `docs/F1_RELATORIO.md`, `.claude/launch.json`, `.gitignore` | relatório + configs locais do snapshot |

**Não tocado (confirmação de R2):** `frontend/**` (zero arquivos), `middleware.ts`, `shouldIndexLocalSeo`, canonical, sitemaps, H1, layout, header, pagamentos, `ads.model`, `regions.service.js` (guard `layer <= 2` já existia e permanece), `ads-filter.*`, `ads-free-query.parser.js`. Nenhuma coluna renomeada/removida/alterada de tipo; `region_memberships` é a mesma tabela.

---

## 2. O que foi feito, item por item

### 2.1 §3.1 — `region_memberships`

| Exigência | Onde | Prova |
|---|---|---|
| remover filtro de UF | `region-memberships.builder.js:180-259` (`buildMembershipsForBase` não filtra `state`) | snapshot: cross-UF 0 → **182.410** |
| pares com `distance_km <= 150` | `MAX_DISTANCE_KM = 150` (`:67`), bounding box + haversine | faixa 100–150 km: 0 → 352.254 linhas |
| preservar self-row | `buildAllMemberships` gera self-row para TODA cidade (`:262-292`) | 5.572 self antes e depois; teste cobre cidade sem geo e cidade nova (BUG-REG-01) |
| `layer` compatível | regras 1–4 no cabeçalho do módulo (`:18-58`), `classifyLegacyLayer` (`:129`), `hasAnyNeighborRow` (`:301`) | §2.1a |
| haversine R = 6371, 2 casas | `haversineKm` (`:107`), `roundKm` (`:117`) | sentinelas abaixo |
| índice `(base_city_id, distance_km)` | migration 063 | `EXPLAIN ANALYZE` §4 usa o índice (0,6 ms) |
| temp table + troca em transação, nunca vazia | `applyMemberships` (`:485-560`) | aborta se `after < before` (R3) |
| sentinelas ±0,5 km + cross-UF > 0 | `tests/search-policy/region-memberships-builder.test.js` (puro) e `…-sentinels.integration.test.js` (Postgres real) | verdes |
| worker `cities.geo-changed` | `src/queues/city-geo-changed.queue.js:41`, `src/workers/cities/city-geo-changed.worker.js`, `recomputeCityMemberships` (`builder.js:565-640`) | teste de sentinelas: cidade nova → coordenadas → recompute → Bragança 15,14 km layer 1, Extrema layer 4, self-row |
| (a) `--dry-run` idempotente | `scripts/build-region-memberships.mjs --dry-run` | §4 |
| (b) backup + rollback | `--backup-table=<nome>`; default `region_memberships_backup_<YYYYMMDDHHMMSS>`, nunca sobrescreve | §7 |

Sentinelas gravadas (snapshot): `braganca-paulista-sp ↔ extrema-mg` **25.44**, `atibaia-sp ↔ extrema-mg` **38.10**, `atibaia-sp ↔ braganca-paulista-sp` **18.34** — as duas primeiras com `layer = 4` (visíveis só ao motor novo), a terceira com `layer = 1` (já existia).

#### 2.1a Guard de compatibilidade — consumidores, arquivo:linha e prova

**Consumidores de `region_memberships` fora do motor novo:**

| # | Consumidor | Arquivo:linha | Filtro antes de F1 | Guard aplicado |
|---|---|---|---|---|
| 1 | `getRadiusMembers` — vizinhas por raio (alimenta `/api/public/cities/:slug/radius` e o read-model de raio) | [regional-radius.repository.js:30](src/read-models/cities/regional-radius.repository.js:30) | `distance_km > 0 AND <= $2` | **`AND rm.layer <= 3`** |
| 2 | `findRadiusDonor` — cidade doadora de estoque no fallback territorial (raio `regional.radius_km` = 80) | [cities.repository.js:217](src/modules/cities/cities.repository.js:217) | `distance_km > 0 AND <= $2` | **`AND rm.layer <= 3`** |
| 3 | `hasRegionMemberships` — "esta cidade passou pelo build?" (decide fallback por UF) | [cities.repository.js:249](src/modules/cities/cities.repository.js:249) | `distance_km > 0` | **`AND layer <= 3`** |
| 4 | `verify-sitemap-brand-slug.mjs` — diagnóstico do recorte regional de Atibaia | [verify-sitemap-brand-slug.mjs:237](scripts/verify-sitemap-brand-slug.mjs:237) | nenhum | **`AND rm.layer <= 3`** |
| 5 | `findMembersFromMemberships` — Página Regional | [regions.service.js:82](src/modules/regions/regions.service.js:82) | **já tinha `rm.layer <= 2`** | inalterado |
| 6 | `cleanup-sao-paulo-duplicate.mjs` / `audit-sao-paulo-duplicate.mjs` | `scripts/maintenance/` | consultam por `city_id`, sem `distance_km` | não se aplica |
| 7 | `explore-region-radius.mjs` | `scripts/explore-region-radius.mjs:58` | filtra em JS o retorno de `getRadiusMembers` | herda o guard nº 1 |

Nenhum guard por UF foi usado, conforme instruído. A decisão sobre doadora cross-UF fica para F3.

**Correção que o guard exigiu no construtor.** Com o guard, a pergunta deixa de ser "as linhas antigas continuam lá?" e passa a ser "o conjunto `layer <= 3` é o MESMO?". A primeira versão da F1 reproduzia a regra antiga de layer 3 (60–100 km, top 40) e daria layer 3 a ~5.500 bases — em produção o layer 3 só existe para **180**. O construtor passou a: (1) preservar o `layer` de toda linha já gravada; (2) sobre tabela já povoada, nunca atribuir layer 3 a linha nova; (3) sobre tabela vazia (CI, instalação nova), aplicar a regra antiga completa, inclusive layer 3. Uma variante intermediária ("layer 3 só para base sem vizinhança") foi **medida e descartada**: criava 283 linhas novas em 122 cidades isoladas, que passariam a ter vizinhança onde hoje não têm — mudando até o caminho de código de `hasRegionMemberships`.

**Prova de identidade (snapshot de produção, tabela `rm_pre_f1` = cópia do estado pré-F1):**

| Verificação | Resultado |
|---|---|
| `layer <= 3` depois × `rm_pre_f1` — `EXCEPT` novo−antigo | **0** |
| `layer <= 3` depois × `rm_pre_f1` — `EXCEPT` antigo−novo | **0** |
| linhas visíveis ao legado (antes → depois) | 107.481 → **107.481** |
| distribuição de layer (antes → depois) | 0: 5.572→5.572 · 1: 29.880→29.880 · 2: 66.377→66.377 · 3: 5.652→**5.652** · 4: 0→589.265 |
| bases com vizinhança (`hasRegionMemberships`) | 5.449 → **5.449** |
| doadoras cross-UF ≤ 80 km com guard (`findRadiusDonor`) | **0** (sem o guard seriam 18 cidades de MG) |

`getRadiusMembers` por stop do filtro de distância:

| raio | com guard (depois) | pré-F1 | sem guard (o que aconteceria sem a correção) |
|---|---|---|---|
| 25 km | 21.633 | 21.633 | 23.668 |
| 50 km | 79.351 | 79.351 | 94.420 |
| 75 km | 98.551 | 98.551 | 201.214 |
| 100 km | **101.909** | **101.909** | 338.920 |

O teste `tests/search-policy/region-memberships-sentinels.integration.test.js` fixa isso em Postgres real: a vizinha cross-UF (Extrema-MG, 25 km, layer 4) aparece na query **sem** o guard e não aparece **com** o guard; nenhuma linha nova recebe layer 3; a linha legada de layer 3 sobrevive com o mesmo layer e a mesma distância.

**Consequência conhecida, registrada para F3:** cidade que ganhar coordenadas DEPOIS deste rebuild recebe layer 4 na faixa 60–100 km e aparece com menos vizinhas em `?raio=75/100` do que o algoritmo antigo daria. É o lado conservador (nunca mostra a mais) e desaparece quando o motor novo assumir o território.

### 2.2 §3.2 — `ads.commercial_model`

| Exigência | Onde | Prova |
|---|---|---|
| coluna + índice | migration 064 | `information_schema` no snapshot e no teste |
| preenchimento em create/update | `ads.repository.js:12` (`deriveCommercialModelForPersistence`, falha → NULL), `createAd` coluna/`$22`, `updateAd` recomputa quando `brand`/`model` mudam | `tests/search-policy/ads-repository-commercial-model.test.js` (6 casos) |
| backfill idempotente, qualquer status | `scripts/backfill-ads-commercial-model.mjs` — `UPDATE … WHERE commercial_model IS DISTINCT FROM v.cm` | §2.2a e §4 |
| trigger + peso A | migration 064 | §2.2a |
| `ads.model` intocado | nenhum `SET model`; teste compara `model` antes/depois | verde |

#### 2.2a Confirmação do search_vector (itens a–d da revisão)

**(a) A migration 064 parte da função de produção e só acrescenta o termo.** Definição extraída do dump (`pg_restore --schema-only` sobre `.local/snapshots/prod-2026-09-07T20-37-02.dump`):

```sql
CREATE FUNCTION public.ads_search_vector_update() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('portuguese', COALESCE(NEW.title, '')), 'A') ||
    setweight(to_tsvector('portuguese', COALESCE(NEW.brand, '')), 'B') ||
    setweight(to_tsvector('portuguese', COALESCE(NEW.model, '')), 'B') ||
    setweight(to_tsvector('portuguese', COALESCE(NEW.city, '')), 'C') ||
    setweight(to_tsvector('portuguese', COALESCE(NEW.description, '')), 'D');
  RETURN NEW;
END
$$;
```

A versão da migration 064 é essa mesma, com **uma linha acrescentada no topo** e nada mais: `setweight(to_tsvector('portuguese', COALESCE(NEW.commercial_model, '')), 'A') ||`. Pesos A (title), B (brand, model), C (city) e D (description) permanecem exatamente como estavam, na mesma ordem. A função versionada `ads_search_vector_refresh()` (migration 019, sem pesos) recebeu o mesmo termo, também sem alterar o que já fazia.

**(b) Os dois triggers continuam apontando para as funções alteradas.** Do mesmo dump, os três triggers de produção:

```
ads_search_vector_trigger    BEFORE INSERT OR UPDATE OF brand, model, title, description → ads_search_vector_refresh()
trg_ads_search_vector_update BEFORE INSERT OR UPDATE                                     → ads_search_vector_update()
trigger_ads_search_vector    BEFORE INSERT OR UPDATE                                     → ads_search_vector_update()
```

Depois da migration, no snapshot:

```
 tgname                       | funcao
------------------------------+-----------------------------
 ads_search_vector_trigger    | ads_search_vector_refresh()
 trg_ads_search_vector_update | ads_search_vector_update()
 trigger_ads_search_vector    | ads_search_vector_update()
```

Os dois triggers não versionados não foram tocados (são `BEFORE INSERT OR UPDATE` sem lista `OF`, já cobrem a coluna nova). O versionado foi recriado só para acrescentar `commercial_model` à lista `OF` — sem isso, o `UPDATE` do backfill não dispararia esse trigger. Ambas as funções contêm o termo novo:

```
 proname                   | tem_commercial_model
---------------------------+----------------------
 ads_search_vector_refresh | t
 ads_search_vector_update  | t
```

**(c) O backfill recalculou o search_vector de todos os anúncios.** Após a execução, sobre as 55 linhas de `ads`:

```
 total | com_modelo | vetor_nulo | vetor_sem_modelo
-------+------------+------------+------------------
    55 |         49 |          0 |                0
```

`vetor_nulo = 0` (nenhum anúncio ficou sem vetor) e `vetor_sem_modelo = 0` (todo anúncio com `commercial_model` casa `plainto_tsquery(commercial_model)`). A segunda execução reporta `0 linhas atualizadas` — idempotente.

**(d) SELECT de prova — Onix casando por `commercial_model`, em peso A:**

```sql
SELECT a.id, a.brand, a.commercial_model,
       substring(a.search_vector::text from 'onix[^ ]*') AS lexema_onix,
       ts_rank(a.search_vector, to_tsquery('portuguese','onix:A')) AS rank_a,
       (a.search_vector @@ plainto_tsquery('portuguese','onix')) AS casa_onix
FROM ads a WHERE a.commercial_model = 'Onix' AND a.status = 'active' ORDER BY a.id LIMIT 1;
```

```
 id |     brand      | commercial_model |         lexema_onix          |  rank_a   | casa_onix
----+----------------+------------------+------------------------------+-----------+-----------
 84 | GM - Chevrolet | Onix             | onix':1A,5A,17B,27,52,78,140 | 0.7960885 | t
```

O lexema `onix` aparece nas posições **1A** (o `commercial_model`, primeiro termo do vetor) e 5A (title), **17B** (brand/model) e sem peso no resto. A posição 1 com peso A é o termo que a migration acrescentou: sem ele o vetor começaria em 5A. Os 6 Onix ativos do snapshot casam `onix:A`.

### 2.3 §3.3 — `platform_settings.search_policy`

Migration 065 com o JSON exato da §2 e `ON CONFLICT (key) DO NOTHING`. `policy-config.js` traz `SEARCH_POLICY_DEFAULT` e `loadSearchPolicy()` (fallback + `log.warn`). `tests/search-policy/policy-config.test.js` lê a migration e compara com a constante — divergência falha o build. `regional.radius_km` não é lida por código novo (continua no banco: 80).

### 2.4 §3.4 — `subscription_plans` (D7)

Valores anteriores no snapshot: `cpf-premium-highlight` = **1.00**, `cnpj-evento-premium` = **1.00** (já eram 1.00). O `UPDATE` tem predicado `weight IS DISTINCT FROM 1.00` e foi **no-op** (0 linhas).

### 2.5 Cache sem Redis (item 3 da revisão) — contrato que a F2 deve seguir

A abstração é `src/shared/cache/cache.middleware.js`, com dois exports:

- `cacheGet({ prefix, ttlSeconds, varyBy, allowedQueryKeys })` — middleware Express. Chave = `prefix:sha1(prefix:path:query filtrada)`; grava via monkey-patch de `res.json`, só para `2xx` sem `ok:false`.
- `cacheInvalidatePrefix(prefix)` — `SCAN` + `DEL` por prefixo.

**Sem Redis, os dois são no-op puro — não há cache em memória nem em disco:**

- `cache.middleware.js:38` → `if (!redis) return next();` (a requisição segue direto ao handler, sem HIT/MISS, sem header `X-Cache`).
- `cache.middleware.js:83` → `if (!redis) return;` na invalidação.
- `redis` vem de `src/infrastructure/cache/redis.js`, que exporta **`null`** quando `REDIS_URL` está vazia, quando `DISABLE_REDIS=true`, ou quando a URL é localhost fora de desenvolvimento. É o caso de produção hoje: `GET /health` → `"redis":"disabled"`.

Consequência para F2: os caches de liquidez (TTL 900 s) e de relaxação (TTL 60 s) **devem** passar por essa mesma abstração e assumir **ausência total de cache** como caminho normal — nada de `new Map()` global (vazaria entre requisições e cresceria sem limite em processo de longa duração), nada de assumir `redis` não-nulo. Em produção, hoje, cada requisição recalcula. Se o custo de recalcular a liquidez a cada request for inaceitável na medição de F2, a saída é propor Redis explicitamente, não um cache paralelo escondido.

### 2.6 Os 6 `commercial_model` NULL (item 4 da revisão)

Ficam como estão. São os anúncios `id` 2, 3, 4, 5, 6 e 7 — todos com `status = 'deleted'`, `brand = NULL` e `model = NULL` (lixo de teste antigo). Não há de onde derivar modelo comercial, e `deleted` não aparece em nenhuma superfície pública. **Entre os 34 anúncios ativos, 34/34 estão preenchidos (100 %).**

---

## 3. Testes

| Suíte | Resultado | Comando |
|---|---|---|
| `tests/search-policy/` (5 arquivos: construtor puro 26, política 7, repositório 6, sentinelas 1, backfill 1) | ✅ 41 | `DATABASE_URL=…5434/carros_na_cidade_snapshot PG_SSL_MODE=disable npx vitest run tests/search-policy` |
| `tests/regions/` (inclui `region-builder-unit.test.js` **sem edição** — a regra antiga completa vale no build do zero) | ✅ 29 | `npx vitest run tests/regions` |
| `tests/integration/region-memberships.integration.test.js` (9) e `seed-cities-geo.integration.test.js` (4 — era QUARENTENA BUG-REG-01) | ✅ | `npx vitest run tests/integration/region-memberships.integration.test.js tests/integration/seed-cities-geo.integration.test.js` |
| Backend completo (exceto `tests/integration/**`) | ✅ **228 arquivos, 3.687 testes**, 1 skipped | `SKIP_INTEGRATION_ADS=1 npx vitest run --exclude "tests/integration/**"` |
| Frontend (gates de middleware, sitemaps, robots, resiliência de SEO) | ✅ **19 arquivos, 504 testes** | `cd frontend && npx vitest run lib/middleware app/sitemaps app/robots.test.ts lib/seo/local-seo-data.resilience.test.ts` |
| ESLint nos arquivos tocados | ✅ sem avisos | `npx eslint <arquivos>` |
| Prettier (gate incremental do projeto) | ✅ 18 arquivos elegíveis formatados | `node scripts/prettier-changed.mjs` |

**8.10 — invariantes ao vivo** (stack local do HEAD + snapshot já com rebuild e backfill):

| URL | Resultado |
|---|---|
| `/carros-em/braganca-paulista-sp` (1 ACTIVE) | 200 + `noindex, follow`, canonical limpa |
| `/carros-em/braganca-paulista-sp?raio=25` | 200, canonical == `/carros-em/braganca-paulista-sp` |
| `/carros-em/extrema-mg`, `/carros-em/campinas-sp` (0 ACTIVE) | **404** `x-middleware-city-gate: blocked-no-active-ads` |
| `/carros-usados/regiao/braganca-paulista-sp` | 200; links `/carros-em/` **idênticos** aos de produção; 34 cards nos dois |
| `/carros-em/atibaia-sp?q=onix` | 200, 6 Onix |
| sitemaps × produção (5 arquivos) | **IDÊNTICOS** (`/sitemap.xml` 9/9, `cities` 1/1, `brands` 5/5, `models` 2/2, `below-fipe` 1/1) |

---

## 4. Medições

### Rebuild de `region_memberships` (snapshot, PG 18 local)

```
$ npm run regions:build:dry-run
5.572 cidades (5.571 com coords, 1 sem; layer legado CONGELADO) → 696.746 linhas calculadas em 1.218 ms (alcance 150 km)
ATUAL: total 107.481 (self 5.572, cross-UF 0)       layer 0=5.572 1=29.880 2=66.377 3=5.652
       faixa km: 0-25=21.633  25-50=57.718  50-75=19.200  75-100=3.358  100-150=0
NOVO:  total 696.746 (self 5.572, cross-UF 182.410) layer 0=5.572 1=29.880 2=66.377 3=5.652 4=589.265
       faixa km: 0-25=23.668  25-50=70.752  50-75=106.794  75-100=137.706  100-150=352.254
superconjunto: 107.481 linhas atuais → 0 ausentes, 0 com layer diferente, 0 com distance_km diferente
leitores legados (layer <= 3): IDÊNTICOS ao estado atual
```

| Métrica | Antes | Depois |
|---|---|---|
| linhas | 107.481 | **696.746** (6,5×) |
| cross-UF | 0 | 182.410 |
| self-rows | 5.572 | 5.572 |
| layer 0/1/2/3 | 5.572 / 29.880 / 66.377 / 5.652 | **idênticos** |
| layer 4 (só o motor novo) | 0 | 589.265 |
| tamanho da tabela | 6,7 MB | 136 MB (+ pkey 39 MB, índices 10 + 7 MB) |
| **tempo** | — | cálculo 1,2 s + troca transacional 12,2 s = **13,8 s** |

`EXPLAIN ANALYZE` do padrão do motor (`WHERE base_city_id = 4800 AND distance_km <= 150 ORDER BY distance_km`): Index Scan `idx_region_memberships_base_dist`, 235 linhas, **0,605 ms**, 130 buffers.

### Backfill `ads.commercial_model` (snapshot)

```
anúncios: 55 (todos os status) · deriváveis: 49 (89,1 %) {derived: 48, override: 1}
NULL: 6 (10,9 %) — ids 2,3,4,5,6,7: status=deleted, brand=NULL, model=NULL
1ª execução: 49 updates em 77 ms · 2ª execução: 0 updates
search_vector sem o modelo comercial: 0
```

Ativos: **34/34 preenchidos**. Distribuição: Onix 6, HB20 4, T-Cross/Pulse/C3/Mobi/Polo/Kwid/HR-V/Fox/Argo 2 cada, Compass/Virtus/Ecosport/Strada/Civic/Renegade 1.

---

## 5. Divergências em relação ao prompt

1. **`layer` das linhas novas = 4, e layer 3 congelado.** §3.1 pede "manter a coluna layer preenchida pela regra antiga". A regra antiga não produz valor para linhas que ela não gerava, e a coluna é `NOT NULL`. Além disso, aplicá-la ao layer 3 quebraria o guard exigido na revisão. Regra adotada e medida em §2.1a. Em banco novo (CI) a regra antiga vale inteira, então `pickRegionMembers` e os testes históricos seguem intactos.
2. **Duas funções de trigger, não uma.** §3.2 cita a trigger 019; em produção quem escreve o `search_vector` é `ads_search_vector_update()` (não versionada, dois triggers). A migration 064 cobre as duas — ver §2.2a. É a única instrução fora da lista de R3 (`CREATE OR REPLACE FUNCTION`), exigida por §3.2.
3. **`seed-cities-latlng.mjs` não foi ligado ao worker**: usa `DATABASE_URL1` com cliente próprio (fora do pool) e já recomenda `regions:build` ao fim. Só `seed-cities-geo.mjs` (pool do projeto) enfileira.
4. **Sentinelas automatizadas rodam em banco descartável com 8 cidades reais**, não contra a tabela nacional: no CI não há dados do IBGE. A tabela nacional foi validada no snapshot (§2.1a, §4).
5. **`scripts/verify-sitemap-brand-slug.mjs` foi reformatado inteiro pelo Prettier** (39 linhas de diff além do guard). O arquivo é dívida de formatação anterior à F1; o gate incremental do projeto cobra formatação de todo arquivo tocado pela PR.
6. **TEMPORÁRIO ATÉ F3 — cidade criada depois da F1 fica invisível aos leitores legados.** Consequência direta da regra 2 do construtor: com a tabela já povoada, toda linha nova recebe `layer = 4`, inclusive as de uma cidade que ganhe coordenadas depois deste rebuild. Os quatro leitores com guard `layer <= 3` — `getRadiusMembers`, `findRadiusDonor`, `hasRegionMemberships` e o diagnóstico `verify-sitemap-brand-slug.mjs` — **não enxergam essa cidade**: ela não aparece como vizinha em `?raio=`, não é candidata a doadora de estoque no fallback territorial, e `hasRegionMemberships` a trata como "sem malha" (caindo no fallback por UF, que é o comportamento de hoje para cidade nova). O motor novo, que consulta por `distance_km`, enxerga tudo desde já. É o lado conservador — nunca mostra a mais — e é o preço de manter os leitores legados byte a byte durante a convivência. **Some quando o motor substituir esses quatro leitores, em F3.** Enquanto isso, cidade nova com estoque continua servida pela própria página de cidade e pelo fallback por UF.
7. **`docs/Search_Policy_Engine_v2_1_Consolidado.md`** continua ausente — releitura pendente.

Nenhuma divergência de comportamento nas superfícies de leitura.

## 6. DEFAULTS aplicados e dúvidas

- Módulo do construtor em `src/modules/regions/region-memberships.builder.js` (a §12 fixa só os módulos de `search-policy/`).
- Valor gravado em `commercial_model` = **rótulo** (`"Onix"`, `"Omoda 5"`), não o slug — é o que a faceta exibe e o que o filtro comparará por igualdade case-insensitive em F2.
- Lotes: 5.000 linhas por `INSERT` no rebuild, 500 no backfill.
- Backup nunca é sobrescrito nem apagado pelo script (limpeza manual após F4).
- `GEO_CHANGED_INLINE_MAX = 50` no seed.

Sem dúvidas em aberto: a questão da doadora cross-UF foi decidida (guard sem UF, decisão de produto adiada para F3) e os 6 NULL foram decididos (ficam como estão).

## 7. Execução em produção, como desligar e como reverter

### Procedimento (item 5 da revisão) — após merge, pelo pipeline

1. **Migrations no boot.** 063/064/065 aplicam automaticamente (`RUN_MIGRATIONS=true`, padrão do backend) ou por `npm run db:migrate`.
2. **Dry-run do rebuild** — colar a saída aqui **antes** do build real:

```bash
npm run regions:build:dry-run
```

Critério de aceite antes de prosseguir: a linha `superconjunto:` deve mostrar **`0 ausentes, 0 com layer diferente, 0 com distance_km diferente`** sobre as **107.481** linhas atuais, e a linha seguinte deve dizer **`leitores legados (layer <= 3): IDÊNTICOS ao estado atual`**. Isso é comparação linha a linha (chave `base:member`, `layer` e `distance_km`), não contagem. Se qualquer um dos três contadores for diferente de zero, **parar** e reportar.

3. **Build real, com backup nomeado:**

```bash
npm run regions:build -- --backup-table=region_memberships_backup_prod_f1
```

4. **Dry-run do backfill:**

```bash
npm run ads:backfill-commercial-model:dry-run
```

5. **Backfill:**

```bash
npm run ads:backfill-commercial-model
```

**Tempo estimado.** Rebuild: 13,8 s no snapshot local (PG 18, mesma máquina). O cálculo (1,2 s) não muda; a carga de 697 k linhas em 140 lotes e a troca transacional dependem da latência até o Postgres do Render (mesma região do serviço): estimativa **30–90 s**. Tabela final ~136 MB + 56 MB de índices; o banco hoje tem 47 MB e o plano comporta. Backup ~7 MB. Backfill: < 1 s (55 anúncios). Durante a troca não há janela vazia: leitores veem o conjunto antigo até o `COMMIT`.

### Desligar

Nada a desligar: nenhum consumidor novo em runtime. A fila `cities.geo-changed` só existe com Redis; `RUN_WORKER_CITY_GEO_CHANGED=false` desativa o worker; sem Redis o recompute é inline e só roda a partir do seed de geo.

### Reverter

- Código: revert do PR de `f1/dados`. Isso remove os guards `layer <= 3` **e** o rebuild ao mesmo tempo — consistente, porque sem o rebuild não há linhas de layer 4 para esconder.
- Dados de `region_memberships` (só se necessário — com o guard, as leituras legadas já são as de antes):

```sql
BEGIN;
DELETE FROM region_memberships;
INSERT INTO region_memberships (base_city_id, member_city_id, distance_km, layer)
  SELECT base_city_id, member_city_id, distance_km, layer FROM region_memberships_backup_prod_f1;
COMMIT;
```

- `ads.commercial_model`: `UPDATE ads SET commercial_model = NULL` (os triggers recalculam o vetor sem o termo). Nenhuma migration precisa ser revertida: são aditivas, e a função de trigger com o termo extra é inerte com a coluna nula.
