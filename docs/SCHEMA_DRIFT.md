# Schema drift — objetos em produção sem migration

Aberto na F2 (2026-09-08) a pedido do item 2 da aprovação, para **decisão em F5**. Nada aqui é ação desta fase.

O problema: existem objetos no banco de produção que nenhuma migration versionada cria. Eles não aparecem em banco novo (CI, bancos descartáveis dos testes), então código que os assume passa no snapshot e quebra no CI — ou o contrário. A F1 topou com o primeiro caso (a função do `search_vector`) e a F2 com o segundo (`cities.normalized_name`).

**Regra prática adotada até F5:** código novo lê **só** colunas versionadas. Quando um objeto não versionado for necessário, derivar do versionado (foi o que a F2 fez com `normalized_name`) ou promovê-lo a migration primeiro.

Levantamento feito com uma sonda de grep sobre o snapshot de produção (2026-09-07) contra `src/database/migrations/*.sql`: cada nome de tabela, coluna, função e trigger é procurado no texto das migrations. É **heurística** — nome mencionado em comentário conta como "versionado", e nome genérico pode casar por acaso. Serve para priorizar, não como veredito. Objetos pertencentes a extensões (`pg_trgm`, `unaccent`) foram excluídos.

## 1. Os dois casos que já mordemos

### `cities.normalized_name` (+ `state_name`, `ibge_code`)

- **Criada por script, não por migration:** `scripts/import-ibge-cities.js:118` (no `CREATE TABLE`) e `:131` (`ADD COLUMN IF NOT EXISTS`), preenchida em `:153`.
- **Consequência:** o banco descartável dos testes de integração **não tem** a coluna. O `SELECT` do dicionário de cidades da F2 quebrou com `column c.normalized_name does not exist`.
- **Como está hoje:** o motor não a lê. `src/modules/ads/search-policy/dictionaries.js:87` seleciona só colunas versionadas e deriva a forma normalizada de `name` com o mesmo `normalizeText` aplicado ao texto da busca.
- **Outro consumidor:** `scripts/maintenance/audit-sao-paulo-duplicate.mjs`.
- **Decisão para F5:** promover a migration (`ADD COLUMN IF NOT EXISTS` + backfill idempotente, aditivo) ou aposentar a coluna. Se promovida, o dicionário pode voltar a lê-la e ganha o acento correto para os 52 municípios em que `normalized_name` difere da derivação ingênua de `name`.

### `ads_search_vector_update()` e seus dois triggers

- **Origem não versionada:** nenhuma migration **cria** a função; a 019 cria outra (`ads_search_vector_refresh()`). Achado da F1 (§2.2a do relatório dela): em produção quem escreve o `search_vector` é `ads_search_vector_update()`, chamada por **dois** triggers (`trg_ads_search_vector_update` e `trigger_ads_search_vector`), ambos de origem desconhecida.
- **Estado atual:** a migration 064 fez `CREATE OR REPLACE` da função e recriou os triggers para incluir `commercial_model`, então os nomes hoje **aparecem** nas migrations — mas só como substituição de algo que a versão nunca criou. Em banco novo, quem escreve o vetor é a `ads_search_vector_refresh()` da 019; em produção, três triggers coexistem.
- **Decisão para F5:** consolidar em **uma** função e **um** trigger, versionados, e derrubar os redundantes. Enquanto não for feito, toda mudança de peso do `search_vector` precisa tocar as duas funções (foi o que a 064 fez).

## 2. Outros achados da mesma sonda (não investigados)

### Funções próprias sem migration

| Função                              | Situação                                                                              |
| ----------------------------------- | ------------------------------------------------------------------------------------- |
| `ads_set_search_vector()`           | **órfã** — nenhum trigger a usa (0 em `pg_trigger`). Candidata a `DROP` em F5.        |
| `set_updated_at()`                  | **viva** — chamada por `trg_cities_updated_at` em `cities`, tabela que o motor lê.    |
| `update_timestamp()`                | **viva** — chamada por `update_events_timestamp` em `events`.                         |
| `update_city_dominance()`           | não verificada; `city_dominance` tem 0 linhas.                                        |
| `block_request_audit_logs_insert()` | **viva** — chamada por `trg_block_request_audit_logs_insert` em `request_audit_logs`. |

### Triggers sem migration

`trg_cities_updated_at` (cities), `update_events_timestamp` (events), `trg_block_request_audit_logs_insert` (request_audit_logs). O primeiro é o que mais importa: roda em toda alteração de `cities`.

### Colunas sem migration em tabelas versionadas

47 no total. Além das três de `cities`, as que tocam superfícies vivas: `ads.ranking_score`, `advertisers.mp_subscription_id`, `users.avatar_url`, `users.last_login_at`, `users.failed_login_attempts`, `users.alert_plan`, `leads.buyer_email`, `subscriptions.started_at`, `refresh_tokens.replaced_by`, `notification_queue.alert_id`, `notification_queue.last_error`. O resto está em tabelas do motor de SEO/crescimento (`seo_publications`, `seo_cluster_plans`, `city_opportunities`, `events`, `dealer_leads`).

### Tabelas sem migration

58 de 108. Cinco são backups datados (`ads_cambio_backup_20260727`, `ads_images_backup_20260726`, `blog_posts_images_backup_20260726`, `home_sections_images_backup_20260726`, `region_memberships_backup_f1`) — limpeza manual, não drift. As outras 53 são de eras anteriores do projeto (autopilot, growth, competitors, city\_\*, auth\_\*), quase todas com **0 linhas**; as com dado são `login_logs` (235), `schema_migrations` (66, é a própria tabela de controle), `alerts` (6), `dealer_message_variants` (3), `api_tokens`/`auth_providers`/`city_status`/`seller_scores`/`system_settings` (1 cada).

## 3. Como refazer o levantamento

A sonda usada está em `scratchpad` (não versionada). Reproduzir é curto: listar `information_schema.columns`, `pg_proc` (excluindo `pg_depend.deptype = 'e'`), `pg_trigger` (`NOT tgisinternal`) e `pg_tables` do schema `public`, e procurar cada nome no texto concatenado de `src/database/migrations/*.sql`. Rodar **sempre contra o snapshot**, nunca contra produção.
