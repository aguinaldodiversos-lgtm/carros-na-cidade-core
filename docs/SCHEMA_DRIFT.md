# Schema drift — objetos em produção sem migration

Aberto na F2 (2026-09-08) a pedido do item 2 da aprovação, para **decisão em F5**. Nada aqui é ação desta fase.

O problema: existem objetos no banco de produção que nenhuma migration versionada cria. Eles não aparecem em banco novo (CI, bancos descartáveis dos testes), então código que os assume passa no snapshot e quebra no CI — ou o contrário. A F1 topou com o primeiro caso (a função do `search_vector`) e a F2 com o segundo (`cities.normalized_name`).

**Regra prática adotada até F5:** código novo lê **só** colunas versionadas. Quando um objeto não versionado for necessário, derivar do versionado (foi o que a F2 fez com `normalized_name`) ou promovê-lo a migration primeiro.

## Como este levantamento foi feito, e onde ele erra

Sonda de grep sobre o snapshot de produção (2026-09-07) contra `src/database/migrations/*.sql`: cada nome de tabela, coluna, função e trigger é procurado no texto das migrations. Objetos de extensão (`pg_trgm`, `unaccent`) excluídos.

A heurística tem um viés conhecido e ele **já produziu dois falsos negativos**, os dois corrigidos abaixo na revisão de 2026-09-08: **nome citado em comentário conta como "versionado"**. Foi o que aconteceu com os triggers `trg_ads_search_vector_update` / `trigger_ads_search_vector` (§1) e com a tabela `notification_queue` (§2). Onde o veredito importa, ele foi confirmado executando as migrations do zero e comparando com o snapshot — não pelo grep.

## 1. Os dois casos que já mordemos

### `cities.normalized_name` (+ `state_name`, `ibge_code`)

- **Criada por script, não por migration:** `scripts/import-ibge-cities.js:118` (no `CREATE TABLE`) e `:131` (`ADD COLUMN IF NOT EXISTS`), preenchida em `:153`.
- **Consequência:** o banco descartável dos testes de integração **não tem** a coluna. O `SELECT` do dicionário de cidades da F2 quebrou com `column c.normalized_name does not exist`.
- **Como está hoje:** o motor não a lê. `src/modules/ads/search-policy/dictionaries.js:87` seleciona só colunas versionadas e deriva a forma normalizada de `name` com o mesmo `normalizeText` aplicado ao texto da busca.
- **Outro consumidor:** `scripts/maintenance/audit-sao-paulo-duplicate.mjs`.
- **Decisão para F5:** promover a migration (`ADD COLUMN IF NOT EXISTS` + backfill idempotente, aditivo) ou aposentar a coluna. Se promovida, o dicionário pode voltar a lê-la e ganha o acento correto para os 52 municípios em que `normalized_name` difere da derivação ingênua de `name`.

### `search_vector` de `ads` — o que a 064 faz, e o que ela **não** faz

Revisado em 2026-09-08. A versão anterior desta seção dizia que a 064 "recriou os triggers"; **isso estava errado**. O que a 064 faz:

| Instrução na 064                                                                 | Linha    | Condicional?                                           |
| -------------------------------------------------------------------------------- | -------- | ------------------------------------------------------ |
| `CREATE OR REPLACE FUNCTION ads_search_vector_refresh()`                         | `:49`    | **não** — incondicional                                |
| `CREATE OR REPLACE FUNCTION ads_search_vector_update()`                          | `:64`    | **não** — incondicional                                |
| `DROP TRIGGER IF EXISTS ads_search_vector_trigger` + `CREATE TRIGGER` (o da 019) | `:83-84` | incondicional, mas **só este trigger**                 |
| `trg_ads_search_vector_update`, `trigger_ads_search_vector`                      | `:31-32` | **só em comentário** — a 064 não os cria nem os altera |

Ou seja: as **funções** são criadas incondicionalmente (um banco novo termina com as duas), mas os **dois triggers não versionados não são criados por migration nenhuma** — os nomes deles só existem num bloco de comentário. Foi esse comentário que enganou a sonda de grep.

**Verificação executada** (migrations do zero num banco descartável, 66 migrations, contra o snapshot):

|                                  | banco novo (CI)                                             | produção (snapshot)                                                                                                                       |
| -------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| triggers em `ads`                | `ads_search_vector_trigger` → `ads_search_vector_refresh()` | os três: `ads_search_vector_trigger` → `refresh()`, `trg_ads_search_vector_update` → `update()`, `trigger_ads_search_vector` → `update()` |
| funções `ads_%search_vector%`    | `ads_search_vector_refresh`, `ads_search_vector_update`     | `ads_search_vector_refresh`, `ads_search_vector_update`, `ads_set_search_vector`                                                          |
| quem **vence** e escreve o vetor | `ads_search_vector_refresh()`                               | `ads_search_vector_update()`                                                                                                              |

Só em produção: os triggers `trg_ads_search_vector_update` e `trigger_ads_search_vector`, e a função `ads_set_search_vector`. Só em banco novo: nada.

**Conclusões:**

1. **O CI não tem o mesmo emaranhado.** Continua sendo **drift** (objeto que existe só em produção), não "versionado errado". A prioridade do item em F5 não muda por esse lado.
2. **Mas os dois ambientes escrevem o `search_vector` com funções e pesos diferentes.** Postgres dispara triggers do mesmo evento em ordem alfabética e o último vence: em banco novo vence a `refresh()` (peso A só para `commercial_model`, o resto sem `setweight`); em produção vence a `update()` (A = `commercial_model` + `title`, B = `brand`/`model`, C = `city`, D = `description`). **Nenhum teste de CI pode provar a ponderação que roda em produção** — foi por isso que a prova do lexema "Onix" da F1 teve de ser feita contra o snapshot. Isso é mais sério do que o drift em si e é o que deve guiar a F5.
3. `ads_search_vector_update()` é **órfã em banco novo** (existe, nenhum trigger a usa — a própria 064 diz "inerte"), espelhando `ads_set_search_vector()`, que é órfã em produção.
4. **Decisão para F5:** consolidar em **uma** função e **um** trigger, versionados, iguais nos dois ambientes, e derrubar os redundantes. Enquanto não for feito, toda mudança de peso do `search_vector` precisa tocar as duas funções (foi o que a 064 fez).

## 2. Outros achados da mesma sonda

### Funções próprias sem migration

| Função                              | Situação                                                                              |
| ----------------------------------- | ------------------------------------------------------------------------------------- |
| `ads_set_search_vector()`           | **órfã em produção** — nenhum trigger a usa. Candidata a `DROP` em F5.                |
| `set_updated_at()`                  | **viva** — chamada por `trg_cities_updated_at` em `cities`, tabela que o motor lê.    |
| `update_timestamp()`                | **viva** — chamada por `update_events_timestamp` em `events`.                         |
| `update_city_dominance()`           | não verificada; `city_dominance` tem 0 linhas.                                        |
| `block_request_audit_logs_insert()` | **viva** — chamada por `trg_block_request_audit_logs_insert` em `request_audit_logs`. |

### Triggers sem migration

`trg_cities_updated_at` (cities), `update_events_timestamp` (events), `trg_block_request_audit_logs_insert` (request_audit_logs) — mais os dois de `ads` do §1, que a sonda tinha deixado passar. O de `cities` é o que mais importa: roda em toda alteração da tabela que o motor lê.

### Colunas sem migration em tabelas versionadas — auditoria de uso

45 no total (a sonda dizia 47; duas eram de `notification_queue`, que não é tabela versionada — ver abaixo). As 11 que tocam superfícies vivas foram auditadas uma a uma por grep em `src/` (arquivos `.js`/`.mjs`/`.ts`/`.tsx`, fora de `migrations/`):

| Coluna                           | Lida pelo código?                                                                                                                                                                   |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ads.ranking_score`              | **não referenciada** — zero ocorrências do nome                                                                                                                                     |
| `advertisers.mp_subscription_id` | **não referenciada**                                                                                                                                                                |
| `users.avatar_url`               | **não referenciada por nome** (ver nota sobre `SELECT *`)                                                                                                                           |
| `users.last_login_at`            | **não referenciada por nome**                                                                                                                                                       |
| `users.failed_login_attempts`    | **não referenciada por nome**                                                                                                                                                       |
| `users.alert_plan`               | **não referenciada por nome**                                                                                                                                                       |
| `leads.buyer_email`              | **não referenciada**                                                                                                                                                                |
| `subscriptions.started_at`       | **não referenciada** — o único `started_at` do código é de outra tabela (`worker_runs`, `src/shared/observability/worker.metrics.js:7`)                                             |
| `refresh_tokens.replaced_by`     | **não referenciada**                                                                                                                                                                |
| `notification_queue.alert_id`    | **nomeada** em `src/services/alertMatcher.service.js:81` (`SELECT … FROM notification_queue WHERE alert_id = $1`) e `:97` (`INSERT INTO notification_queue (user_id, alert_id, …)`) |
| `notification_queue.last_error`  | **não referenciada** — o único `last_error` do código é de outra tabela (`growth_jobs`, `src/workers/growth_jobs.worker.js:52`)                                                     |

**Sobre a única que é lida, e por que o CI não quebra.** A pergunta era se o caminho não tem teste ou se o teste mocka o banco. **Nenhuma das duas: o módulo é código morto.** `src/services/alertMatcher.service.js` não tem **nenhum importador** no repositório (busca por conteúdo em todos os `.js`/`.mjs`/`.ts`/`.tsx` fora de `node_modules`), e nenhum arquivo em `tests/` o menciona. O outro consumidor da tabela, `src/workers/notification.worker.js`, também não tem importador e **não está no registro de workers** (`src/workers/bootstrap/bootstrap.registry.js`), então nem `npm run workers` o carrega. O SQL nunca é executado por ninguém — não há caminho a testar.

**Nota sobre `SELECT *`.** Existem dois `SELECT * FROM users` (`src/modules/auth/auth.service.js:297`, `src/modules/auth/sessions/refreshToken.repository.js:94`). Em produção eles trazem `avatar_url`, `last_login_at`, `failed_login_attempts` e `alert_plan` como propriedades da linha; em banco novo, não. O código nunca lê essas propriedades, e — importante — **coluna ausente num `SELECT *` não levanta erro**, só devolve menos chaves. Então essa família de drift jamais quebraria o CI: falharia em silêncio, entregando `undefined`. É o padrão que já mordeu neste projeto em outras frentes.

### `notification_queue`: código vivo grava colunas que não existem

Apareceu ao auditar as duas colunas acima e é o achado mais afiado desta página, porque é o drift virando falha de execução. Duas cópias de `enqueueUpgradeOffers()` fazem:

```sql
INSERT INTO notification_queue (user_id, type, payload, status, created_at)
```

`src/brain/engines/growth-brain.engine.js:102` e `src/modules/growth/growth-brain-pipeline.js:96`, mais a leitura de `n.type` em `:118` e `:112`. A tabela **não tem `type` nem `payload`**: no snapshot ela é `id, user_id, alert_id, ad_id, channel, status, attempts, last_error, created_at`. Todo `INSERT` desses cairia em `42703 column "type" ... does not exist`.

Alcance verificado:

| Cópia                         | Chamada por                                                | Alcançável?                                                                                                                                                                 |
| ----------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `growth-brain.engine.js:99`   | `runGrowthBrainEngine():183` → `growth-brain.worker.js:17` | **sim, se ligado** — o worker está no registry com gate `RUN_WORKER_GROWTH_BRAIN`, `defaultValue: "false"` (`bootstrap.registry.js:95-102`)                                 |
| `growth-brain-pipeline.js:93` | `runGrowthBrainPipeline():151`                             | **não** — nenhum chamador; `growth-autopilot.service.js` só reexporta e não tem importador. `runOpportunityScoringOnly()`, que o Opportunity Worker usa, não passa por aqui |

Ou seja: a única coisa que separa esse caminho de um erro garantido é a flag estar desligada por padrão. E se alguém a ligar, o `try/catch` de `growth-brain.worker.js:18-19` engole a exceção num `logger.error` e aborta o resto do run — o padrão de falha silenciosa que já custou caro neste projeto. **Para F5:** decidir entre criar a tabela por migration com as colunas que o código espera, corrigir o SQL para as colunas que existem, ou remover o caminho morto. Não deixar como está.

### Tabelas sem migration

58 de 108 pela sonda, mais `notification_queue`, que a sonda classificou errado: o nome dela aparece nas migrations **só num comentário** (`src/database/migrations/049_user_notifications.sql:6` e `:9`) — e esse comentário justamente declara que a tabela não é criada por migration nenhuma. Não há `CREATE TABLE notification_queue` em lugar algum do repositório; no snapshot ela existe com `id, user_id, alert_id, ad_id, channel, status, attempts, last_error, created_at`.

Das demais: cinco são backups datados (`ads_cambio_backup_20260727`, `ads_images_backup_20260726`, `blog_posts_images_backup_20260726`, `home_sections_images_backup_20260726`, `region_memberships_backup_f1`) — limpeza manual, não drift. As outras 53 são de eras anteriores do projeto (autopilot, growth, competitors, city\_\*, auth\_\*), quase todas com **0 linhas**; as com dado são `login_logs` (235), `schema_migrations` (66, é a própria tabela de controle), `alerts` (6), `dealer_message_variants` (3), `api_tokens`/`auth_providers`/`city_status`/`seller_scores`/`system_settings` (1 cada).

## 3. Como refazer o levantamento

A sonda usada está em `scratchpad` (não versionada). Reproduzir é curto: listar `information_schema.columns`, `pg_proc` (excluindo `pg_depend.deptype = 'e'`), `pg_trigger` (`NOT tgisinternal`) e `pg_tables` do schema `public`, e procurar cada nome no texto concatenado de `src/database/migrations/*.sql`. Rodar **sempre contra o snapshot**, nunca contra produção.

Para qualquer item que vá virar decisão, **não pare no grep**: crie um banco descartável, rode `scripts/run-migrations.mjs` do zero e compare o catálogo com o do snapshot. Foi assim que os dois falsos negativos desta página apareceram.
