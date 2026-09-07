# F1 — Relatório (formato fixo, seção 11 do prompt)

Data: 2026-09-07 · Branch: `f1/dados` (nascida de `origin/main @ 65bc2e95`, base A aprovada em F0)
Banco de execução: snapshot de produção em Postgres 18 local (`localhost:5434/carros_na_cidade_snapshot`). `DATABASE_URL1` não recebeu nenhuma escrita.
Sem mudança de comportamento no caminho de busca (nenhum consumidor de `commercial_model` ou de `search_policy` existe ainda; `region_memberships` é superconjunto com `layer` legado preservado — ver §5 para as duas consequências mensuráveis).

Releitura de `docs/Search_Policy_Engine_v2_1_Consolidado.md`: **arquivo ainda ausente** em `origin/main` ao início e ao fim de F1 (`git cat-file -e origin/main:docs/Search_Policy_Engine_v2_1_Consolidado.md` → não existe). Pendente.

---

## 1. Escopo tocado / não tocado

**Tocado (21 arquivos, +2.290 / −391):**

| Arquivo                                                                                                                                                                               | O quê                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/database/migrations/063_region_memberships_base_dist_index.sql`                                                                                                                  | novo — `CREATE INDEX IF NOT EXISTS idx_region_memberships_base_dist (base_city_id, distance_km)`                                                                                                   |
| `src/database/migrations/064_ads_commercial_model.sql`                                                                                                                                | novo — `ADD COLUMN commercial_model TEXT NULL`, índice `(commercial_model, status)`, `setweight(…,'A')` nas DUAS funções de search_vector, trigger 019 recriado com `commercial_model` na lista OF |
| `src/database/migrations/065_search_policy_settings.sql`                                                                                                                              | novo — `INSERT … search_policy … ON CONFLICT DO NOTHING`; `UPDATE subscription_plans SET weight = 1.00` (D7)                                                                                       |
| `src/modules/regions/region-memberships.builder.js`                                                                                                                                   | novo — construtor puro + troca transacional + backup + recompute por cidade                                                                                                                        |
| `scripts/build-region-memberships.mjs`                                                                                                                                                | reescrito — sem filtro de UF, 150 km, `--dry-run`, `--backup-table=`, rollback impresso; exports legados mantidos                                                                                  |
| `scripts/backfill-ads-commercial-model.mjs`                                                                                                                                           | novo — backfill idempotente, `--dry-run`, lista de NULL, checagem do search_vector                                                                                                                 |
| `scripts/recompute-city-memberships.mjs`                                                                                                                                              | novo — CLI do caminho do worker (uma cidade)                                                                                                                                                       |
| `src/queues/city-geo-changed.queue.js`, `src/workers/cities/city-geo-changed.worker.js`, `src/infrastructure/queue/queue.constants.js`, `src/workers/bootstrap/bootstrap.registry.js` | fila/worker BullMQ `cities.geo-changed` + registro (`RUN_WORKER_CITY_GEO_CHANGED`)                                                                                                                 |
| `scripts/seed-cities-geo.mjs`                                                                                                                                                         | ao preencher lat/lng de ≤50 cidades, enfileira/recomputa cada uma; acima disso recomenda `regions:build`                                                                                           |
| `src/modules/ads/ads.repository.js`                                                                                                                                                   | `createAd`/`updateAd` gravam `commercial_model` via `deriveCommercialModel(model, { brand })`                                                                                                      |
| `src/modules/ads/search-policy/policy-config.js`                                                                                                                                      | novo — `SEARCH_POLICY_DEFAULT` + `loadSearchPolicy()` (sem consumidor até F2)                                                                                                                      |
| `package.json`                                                                                                                                                                        | scripts `regions:build:dry-run`, `ads:backfill-commercial-model[:dry-run]`                                                                                                                         |
| `tests/search-policy/*.test.js` (5 arquivos)                                                                                                                                          | testes desta fase                                                                                                                                                                                  |
| `.claude/launch.json`, `.gitignore`                                                                                                                                                   | herdados de F0 (`.local/`, configs `f0-*-snapshot`) + `SITEMAP_PUBLIC_ENABLED` local                                                                                                               |

**Não tocado (confirmação de R2):** `frontend/**` (zero arquivos), `middleware.ts`, `shouldIndexLocalSeo`, canonical, sitemaps, H1, layout, header, pagamentos, `ads.model`, `regions.service.js` (guard `layer <= 2` fica para F2 sob flag), `ads-filter.*`, `ads-free-query.parser.js`. Nenhuma coluna renomeada/removida/alterada de tipo; `region_memberships` é a mesma tabela.

---

## 2. O que foi feito, item por item (§3)

### 3.1 `region_memberships`

| Exigência                                         | Onde                                                                                                                                                                                                                                                                          | Prova                                                                                                                                               |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| remover filtro de UF                              | `region-memberships.builder.js:140-190` (`buildMembershipsForBase` não filtra `state`)                                                                                                                                                                                        | snapshot: cross-UF 0 → **182.410**                                                                                                                  |
| pares com `distance_km <= 150`                    | `MAX_DISTANCE_KM = 150` (`:46`), bounding box + haversine                                                                                                                                                                                                                     | faixa 100–150 km: 0 → 352.254 linhas                                                                                                                |
| preservar self-row                                | `buildAllMemberships` gera self-row para TODA cidade (`:206-232`)                                                                                                                                                                                                             | 5.572 self antes e depois; teste de sentinelas cobre cidade sem geo e cidade nova (BUG-REG-01)                                                      |
| `layer` pela regra antiga                         | `:166-182` — mesma UF, 30/60/100 km, top 12/18/40; resto `layer = 4`                                                                                                                                                                                                          | SQL no snapshot: linhas `layer IN (1,2)` novas EXCEPT antigas = **0** e vice-versa (96.257 = 96.257) → página regional (`layer <= 2`) byte-idêntica |
| haversine R = 6371, 2 casas                       | `haversineKm` (`:83`), `roundKm` (`:93`)                                                                                                                                                                                                                                      | sentinelas                                                                                                                                          |
| índice `(base_city_id, distance_km)`              | migration 063                                                                                                                                                                                                                                                                 | `EXPLAIN ANALYZE` §4 usa o índice (0,6 ms)                                                                                                          |
| temp table + troca em transação, nunca vazia      | `applyMemberships` (`:353-412`): `CREATE TEMP TABLE` → batches de 5.000 → `BEGIN; CREATE TABLE backup AS …; DELETE; INSERT … FROM temp; INSERT … FROM backup ON CONFLICT DO NOTHING; COMMIT`                                                                                  | aborta se `after < before` (R3)                                                                                                                     |
| sentinelas automatizadas ±0,5 km + cross-UF > 0   | `tests/search-policy/region-memberships-builder.test.js` (puro) e `region-memberships-sentinels.integration.test.js` (Postgres real, banco descartável, roda no CI sem dados IBGE porque insere as 8 cidades com coordenadas reais)                                           | verdes                                                                                                                                              |
| worker `cities.geo-changed`                       | fila `src/queues/city-geo-changed.queue.js`, worker `src/workers/cities/city-geo-changed.worker.js`, `recomputeCityMemberships` (`builder.js:435-492`) — recomputa só as linhas da cidade (como base: regra completa; como membro de B: camada legada se B tem vaga, senão 4) | teste de sentinelas: cidade nova sem geo → coordenadas → recompute → Bragança 15,14 km layer 1, Extrema layer 4, self-row                           |
| requisito (a) do usuário: `--dry-run` idempotente | `scripts/build-region-memberships.mjs --dry-run` imprime ATUAL × NOVO (total, self, cross-UF, por layer, por faixa) e a checagem de superconjunto, sem gravar                                                                                                                 | saída em §4                                                                                                                                         |
| requisito (b): backup próprio + rollback          | `--backup-table=<nome>` (default `region_memberships_backup_<YYYYMMDDHHMMSS>`, nunca sobrescreve: sufixa `_2`…); script imprime o SQL de rollback                                                                                                                             | §7                                                                                                                                                  |

Produção hoje não tem Redis (`/health` → `redis: disabled`). Por isso o producer `enqueueCityGeoChanged` executa o recompute **inline** quando não há fila (`city-geo-changed.queue.js:41-60`); com Redis, enfileira com `jobId = city-<id>` (sem duplicar) e o worker (default `RUN_WORKER_CITY_GEO_CHANGED=true`, só sobe se houver Redis) consome.

### 3.2 `ads.commercial_model`

| Exigência                             | Onde                                                                                                                                                                                                                                                                                        | Prova                                                                                                   |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| coluna + índice                       | migration 064                                                                                                                                                                                                                                                                               | `information_schema` no snapshot e no teste de backfill                                                 |
| preenchimento em create/update        | `ads.repository.js:6-20` (`deriveCommercialModelForPersistence`, falha → NULL), `createAd` coluna/`$22`, `updateAd` recomputa quando `brand`/`model` mudam (lê o outro campo do banco em update parcial)                                                                                    | `tests/search-policy/ads-repository-commercial-model.test.js` (6 casos, banco mockado)                  |
| "import"                              | não existe caminho de import de anúncio em `src/` (grep `INSERT INTO ads`: só `ads.repository.js` e o seed E2E `scripts/e2e-seed.mjs`, que está na base sem a coluna — o backfill cobre; anotado para F3)                                                                                   | —                                                                                                       |
| backfill idempotente, qualquer status | `scripts/backfill-ads-commercial-model.mjs` — `UPDATE … WHERE commercial_model IS DISTINCT FROM v.cm` em lotes de 500 numa transação; 2ª execução = 0                                                                                                                                       | §4                                                                                                      |
| trigger 019 + `setweight(…,'A')`      | migration 064 — **achado**: em produção há 3 triggers de search_vector; o que vence (ordem alfabética) é `ads_search_vector_update()`, função **não versionada** (pesos A/B/C/D). A migration acrescenta o termo às DUAS funções e põe `commercial_model` na lista OF do trigger versionado | snapshot: 6/6 Onix ativos casam `onix:A`; teste de backfill prova peso A em banco só de migrations (CI) |
| recalcular search_vector no backfill  | o `UPDATE` dispara os triggers; o script confere `search_vector @@ plainto_tsquery(commercial_model)` para todo anúncio preenchido → 0 divergências                                                                                                                                         | §4                                                                                                      |
| `ads.model` intocado                  | nenhum `SET model` em lugar algum; teste compara `model` antes/depois                                                                                                                                                                                                                       | verde                                                                                                   |

### 3.3 `platform_settings.search_policy`

Migration 065: `INSERT … ON CONFLICT (key) DO NOTHING` com o JSON exato da §2. `policy-config.js` traz `SEARCH_POLICY_DEFAULT` (mesmo JSON) e `loadSearchPolicy()` (fallback + `log.warn`). `tests/search-policy/policy-config.test.js` lê a migration e compara com a constante (`toEqual`) — qualquer divergência falha o build. `regional.radius_km` não é lida por código novo (continua no banco: 80).

### 3.4 `subscription_plans` (D7)

Valores anteriores no snapshot de produção: `cpf-premium-highlight` = **1.00**, `cnpj-evento-premium` = **1.00** (já eram 1.00 — a auditoria §7.5 já mostrava). O `UPDATE` da migration 065 tem predicado `weight IS DISTINCT FROM 1.00` e foi no-op (0 linhas).

---

## 3. Testes

| Suíte                                                                                                                                                                                                                          | Resultado                                | Comando                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/search-policy/region-memberships-builder.test.js` (puro, 20 casos)                                                                                                                                                      | ✅                                       | `SKIP_INTEGRATION_ADS=1 npx vitest run tests/search-policy`                                                                                                                                    |
| `tests/search-policy/region-memberships-sentinels.integration.test.js` (8.2; Postgres real, banco descartável)                                                                                                                 | ✅ 3,4 s                                 | `DATABASE_URL=postgresql://postgres:postgres@localhost:5434/carros_na_cidade_snapshot PG_SSL_MODE=disable npx vitest run tests/search-policy/region-memberships-sentinels.integration.test.js` |
| `tests/search-policy/commercial-model-backfill.integration.test.js`                                                                                                                                                            | ✅ 3,4 s                                 | idem, arquivo correspondente                                                                                                                                                                   |
| `tests/search-policy/policy-config.test.js` (7)                                                                                                                                                                                | ✅                                       | —                                                                                                                                                                                              |
| `tests/search-policy/ads-repository-commercial-model.test.js` (6)                                                                                                                                                              | ✅                                       | —                                                                                                                                                                                              |
| Legados: `tests/regions/region-builder-unit.test.js`, `tests/integration/region-memberships.integration.test.js` (9), `tests/integration/seed-cities-geo.integration.test.js` (4 — era QUARENTENA BUG-REG-01, **passa agora**) | ✅                                       | `npx vitest run tests/integration/region-memberships.integration.test.js tests/integration/seed-cities-geo.integration.test.js` (com DATABASE_URL do snapshot)                                 |
| Backend completo (exceto `tests/integration/**`)                                                                                                                                                                               | ✅ 228 arquivos, 3.681 testes, 1 skipped | `SKIP_INTEGRATION_ADS=1 npx vitest run --exclude "tests/integration/**"`                                                                                                                       |
| Frontend 8.10: `territory-gate`, `city-existence-gate`, `uf-existence-gate`, `city-gate-reachability`, `local-seo-data.resilience`, `sitemaps/*`, `robots`                                                                     | ✅ 10 arquivos, 267 testes               | `cd frontend && npx vitest run lib/middleware/*.test.ts app/sitemaps/*.test.ts app/robots.test.ts`                                                                                             |
| ESLint nos arquivos tocados                                                                                                                                                                                                    | ✅ sem avisos                            | `npx eslint <arquivos>`                                                                                                                                                                        |
| Prettier                                                                                                                                                                                                                       | ✅                                       | `npx prettier --check <arquivos>`                                                                                                                                                              |

**8.10 — invariantes ao vivo** (stack local HEAD `f1/dados` + snapshot já com o rebuild e o backfill):

| URL                                                                                                | Resultado                                                                 |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `/carros-em/braganca-paulista-sp` (1 ACTIVE)                                                       | 200 + `noindex, follow`, canonical limpa                                  |
| `/carros-em/braganca-paulista-sp?raio=25`                                                          | 200, canonical == `/carros-em/braganca-paulista-sp`                       |
| `/carros-em/extrema-mg`, `/carros-em/campinas-sp` (0 ACTIVE, agora com vizinhas cross-UF/uncapped) | **404** `x-middleware-city-gate: blocked-no-active-ads`                   |
| `/carros-usados/regiao/braganca-paulista-sp`                                                       | 200; links `/carros-em/` **idênticos** aos de produção; 34 cards nos dois |
| `/carros-em/atibaia-sp?q=onix`                                                                     | 200, 6 Onix (search_vector com peso A não muda o conjunto)                |
| sitemaps × produção                                                                                | ver §4, "Sitemaps"                                                        |

---

## 4. Medições

### Rebuild de `region_memberships` (snapshot, PG 18 local)

```
$ npm run regions:build:dry-run
5.572 cidades (5.571 com coords, 1 sem) → 696.746 linhas calculadas em 979 ms (alcance 150 km)
ATUAL: total 107.481 (self 5.572, cross-UF 0)   layer 0=5.572 1=29.880 2=66.377 3=5.652
       faixa km: 0-25=21.633  25-50=57.718  50-75=19.200  75-100=3.358  100-150=0
NOVO:  total 696.746 (self 5.572, cross-UF 182.410) layer 0=5.572 1=29.880 2=66.377 3=136.568 4=458.349
       faixa km: 0-25=23.668  25-50=70.752  50-75=106.794  75-100=137.706  100-150=352.254
superconjunto: 107.481 linhas atuais, 0 ausentes no novo conjunto
```

| Métrica           | Antes                                                        | Depois                                                        |
| ----------------- | ------------------------------------------------------------ | ------------------------------------------------------------- |
| linhas            | 107.481                                                      | **696.746** (6,5×)                                            |
| cross-UF          | 0                                                            | 182.410                                                       |
| self-rows         | 5.572                                                        | 5.572                                                         |
| layer 1 / 2       | 29.880 / 66.377                                              | **29.880 / 66.377** (idênticas, EXCEPT = 0 nos dois sentidos) |
| layer 3           | 5.652 (180 bases — o build antigo só o populou parcialmente) | 136.568 (5.512 bases; as 5.652 antigas mantêm layer 3)        |
| tamanho da tabela | 6,7 MB (backup)                                              | 136 MB (+ pkey 39 MB, índices 10 + 7 MB)                      |
| **tempo**         | —                                                            | cálculo 1,0 s + troca transacional 16,9 s = **18,3 s**        |

Sentinelas gravadas: `braganca-paulista-sp ↔ extrema-mg` **25.44** (layer 4), `atibaia-sp ↔ extrema-mg` **38.10** (4), `atibaia-sp ↔ braganca-paulista-sp` **18.34** (1). Bragança → Campinas 53.92 (layer 4: além do teto legado de 18 no layer 2 — igual ao build antigo, que também não a tinha).

`EXPLAIN ANALYZE` do padrão do motor (`WHERE base_city_id = 4800 AND distance_km <= 150 ORDER BY distance_km`): Index Scan `idx_region_memberships_base_dist`, 235 linhas, **0,605 ms**, 130 buffers.

### Backfill `ads.commercial_model` (snapshot)

```
anúncios: 55 (todos os status) · deriváveis: 49 (89,1 %) {derived: 48, override: 1}
NULL: 6 (10,9 %) — ids 2,3,4,5,6,7: todos status=deleted com brand=NULL e model=NULL (lixo de teste antigo)
a preencher: 49 · 1ª execução: 49 updates em 77 ms · 2ª execução: 0 updates
search_vector sem o modelo comercial: 0
```

Entre os **34 ativos: 34/34 preenchidos (100 %)**. Distribuição (ativos): Onix 6, HB20 4, T-Cross/Pulse/C3/Mobi/Polo/Kwid/HR-V/Fox/Argo 2 cada, Compass/Virtus/Ecosport/Strada/Civic/Renegade 1. `Omoda 5` (override) está num anúncio não ativo. Lista de NULL para revisão antes de F2: só os 6 deletados acima — nenhum anúncio ativo/pausado ficou NULL.

### Sitemaps (8.10 — snapshot × produção)

Comparação `<loc>` a `<loc>` entre o stack local (com `SITEMAP_PUBLIC_ENABLED=true` no backend e no frontend, mesma flag de produção) e `https://www.carrosnacidade.com`: **IDÊNTICOS** nos 5 arquivos (`/sitemap.xml` 9/9, `/sitemaps/cities.xml` 1/1, `/sitemaps/brands.xml` 5/5, `/sitemaps/models.xml` 2/2, `/sitemaps/below-fipe.xml` 1/1 URLs, `diff` vazio após normalizar o host). O snapshot 8.10 fica registrado por esta comparação; o rebuild de `region_memberships` e o backfill não tocam a origem dos sitemaps (`/api/public/seo/sitemap/type/*` deriva de `ads` ativos por cidade).

---

## 5. Divergências em relação ao prompt

1. **`layer` das linhas novas = 4.** §3.1 pede "manter a coluna layer preenchida pela regra antiga". A regra antiga não produz valor para linhas que ela não gerava (outra UF, além dos tetos, 100–150 km) e a coluna é `NOT NULL`. Usei `4` (`LAYER_EXTENDED`) e mantive 1/2/3 exatamente como antes (inclusive os tetos 12/18/40), o que preserva a página regional byte a byte. Sem isso, bases densas mudariam de vizinhas em `layer <= 2`.
2. **Duas funções de trigger, não uma.** §3.2 cita a trigger 019; em produção quem escreve o `search_vector` é `ads_search_vector_update()` (não versionada, dois triggers). A migration 064 cobre as duas — caso contrário o peso A nunca chegaria ao banco de produção. É também a única instrução fora da lista de R3 (`CREATE OR REPLACE FUNCTION`), exigida por §3.2.
3. **Consumidores por distância mudam de resultado (dado, não código).** Duas leituras de `region_memberships` usam só `distance_km` e não filtram UF: `getRadiusMembers` (endpoint `/api/public/cities/:slug/radius`, sem consumidor de página — candidato a remoção em F5) e `findRadiusDonor` (`cities.repository.js:197`, doadora de estoque no fallback territorial, raio `regional.radius_km` = 80). No snapshot: Bragança ≤50 km 29 → 34 vizinhas, ≤100 km 69 → 129; **18 cidades de MG** passam a ter Atibaia/Bragança como doadora possível a ≤80 km. Nenhuma página pública de produção muda hoje (as duas únicas cidades com estoque continuam 200 e a regional é idêntica), mas é uma mudança de superfície latente; anotada para decisão em F2 (o guard de UF pode entrar em `findRadiusDonor` se for regra de produto).
4. **`seed-cities-latlng.mjs` não foi ligado ao worker**: usa `DATABASE_URL1` com cliente próprio (fora do pool); já recomenda `regions:build` ao fim. Só `seed-cities-geo.mjs` (pool do projeto) enfileira.
5. **Testes de sentinela rodam em banco descartável com 8 cidades reais**, não contra a tabela nacional: no CI não há IBGE. A tabela nacional foi validada manualmente no snapshot (§4). Se quiser a validação nacional automatizada, cabe um job apontando para o snapshot.
6. **`docs/Search_Policy_Engine_v2_1_Consolidado.md`** continua ausente — releitura não pôde ser feita.

Nenhuma divergência de comportamento em código de produto.

## 6. DEFAULTS aplicados e dúvidas

- Módulo do construtor em `src/modules/regions/region-memberships.builder.js` (a §12 fixa só os módulos de `search-policy/`; o construtor de território é de `regions`).
- Valor gravado em `commercial_model` = **rótulo** (`"Onix"`, `"Omoda 5"`), não o slug — é o que a faceta exibe e o que o filtro compara em igualdade case-insensitive (complemento do usuário para F2).
- Lotes: 5.000 linhas por `INSERT` no rebuild, 500 no backfill.
- Backup nunca é sobrescrito nem apagado pelo script (limpeza manual: `DROP TABLE region_memberships_backup_<stamp>` após F4).
- `GEO_CHANGED_INLINE_MAX = 50` no seed.

Dúvidas para o usuário:

1. Item 3 de §5: manter `findRadiusDonor` sem filtro de UF (comportamento emergente cross-UF no fallback) ou adicionar `c.state = base.state` em F2?
2. Podem os 6 anúncios `deleted` sem marca/modelo (ids 2–7) ser ignorados na revisão da lista de NULL?

## 7. Como executar em produção, como desligar e como reverter

### Comando exato (pipeline de deploy, após "APROVADO F1" e merge do PR)

Migrations 063/064/065 aplicam no boot (`RUN_MIGRATIONS=true`, padrão do backend) ou por `npm run db:migrate`. Em seguida, no serviço backend (shell do Render ou job one-off, com o `DATABASE_URL` do serviço):

```bash
npm run regions:build:dry-run
npm run regions:build -- --backup-table=region_memberships_backup_prod_f1
npm run ads:backfill-commercial-model:dry-run
npm run ads:backfill-commercial-model
```

Tempo estimado: rebuild **18 s** no snapshot local (PG 18, mesma máquina). Em produção o cálculo (1 s) não muda; a carga de 697 k linhas em 140 lotes + a troca transacional dependem da latência para o Postgres do Render (mesma região do serviço): estimativa **30–90 s**, tabela final ~136 MB + 56 MB de índices (o plano gratuito tem 1 GB; hoje o banco tem 47 MB). O backup ocupa ~7 MB. Backfill: < 1 s (55 anúncios).

Durante a troca, leitores veem a tabela antiga até o COMMIT (transação única); não há janela vazia.

### Desligar

Nada a desligar: nenhum consumidor novo em runtime. A fila `cities.geo-changed` só existe com Redis; `RUN_WORKER_CITY_GEO_CHANGED=false` desativa o worker; sem Redis o recompute é inline e só roda a partir do seed de geo.

### Reverter

- Código: revert do PR de `f1/dados`. `createAd`/`updateAd` deixam de gravar `commercial_model` (a coluna fica, nula para novos anúncios — inofensiva).
- Dados de `region_memberships` (só se necessário — o superconjunto não altera as leituras `layer <= 2`):

```sql
BEGIN;
DELETE FROM region_memberships;
INSERT INTO region_memberships (base_city_id, member_city_id, distance_km, layer)
  SELECT base_city_id, member_city_id, distance_km, layer FROM region_memberships_backup_prod_f1;
COMMIT;
```

- `ads.commercial_model`: `UPDATE ads SET commercial_model = NULL` (o trigger recalcula o search_vector sem o termo). Nenhuma migration precisa ser revertida (aditivas; a função de trigger com o termo extra é inerte com a coluna NULL).
