# Runbook — Migration 025 (Antifraude e Moderação)

Última revisão: 2026-05-09

## Objetivo

Aplicar a migration `src/database/migrations/025_ads_antifraud_moderation.sql` em **staging** (validação) e depois em **produção**, garantindo:

- backup íntegro antes de qualquer ALTER;
- nenhuma row com status fora do enum canônico em produção;
- migration idempotente (pode rodar múltiplas vezes sem erro);
- pipeline de criação continua funcional;
- anúncios ACTIVE existentes continuam visíveis;
- dashboard do anunciante carrega anúncios pré-migration sem alteração visual.

> **Importante:** esta migration NÃO inclui `CHECK constraint` em `ads.status`. A constraint só será aplicada numa migration posterior, depois de auditoria explícita dos dados em produção. Ver §9.

## Status atual — produção continua BLOQUEADA

**A migration 025 ainda NÃO foi aplicada em staging real**. A última rodada de validação rodou contra mocks e código (suítes vitest verdes), mas sem `STAGING_DATABASE_URL` no ambiente do operador.

Para liberar produção, TODOS os passos abaixo precisam estar `[x]` em staging real:

- [ ] §3 (audit `SELECT status, COUNT(*)` sem legado fora do enum)
- [ ] §4 (migration 025 aplicada e registrada em `schema_migrations`)
- [ ] §5 (verificações pós-migration — colunas, tabelas, índices)
- [ ] §5.7 (schema readiness check — `/health` retorna `antifraud_schema=ok`)
- [ ] §6 (smoke operacional `npm run smoke:antifraud-staging` — 7/7 cenários PASS)
- [ ] §7 (validação UI `/admin/moderation` + boost bloqueado fora de active)

Bloqueador permanece até o operador conferir cada item.

---

## 1. Pré-requisitos

- [ ] Acesso de DBA ao banco alvo (`psql` ou painel).
- [ ] Janela de manutenção curta agendada (a migration é não-bloqueante, mas o backup pode demorar).
- [ ] Branch `main` no commit `d11b8b30` ou posterior.
- [ ] `npm install` rodado no servidor (apenas se for usar `npm run db:migrate`).
- [ ] Variáveis de ambiente `DATABASE_URL`, `PGSSLMODE` (se aplicável) configuradas.

---

## 2. Backup obrigatório

Antes de **qualquer** ALTER, criar dump da tabela `ads` e das auxiliares que serão tocadas:

```bash
# Snapshot direcionado — rápido e suficiente para rollback de schema.
pg_dump \
  --no-owner \
  --no-acl \
  --table=public.ads \
  --table=public.advertisers \
  --table=public.admin_actions \
  --schema-only \
  "$DATABASE_URL" \
  > backups/$(date +%Y%m%d-%H%M)-pre-025-schema.sql

# Dump de dados (apenas a tabela ads — as auxiliares novas ainda não existem).
pg_dump \
  --no-owner \
  --no-acl \
  --table=public.ads \
  --data-only \
  "$DATABASE_URL" \
  > backups/$(date +%Y%m%d-%H%M)-pre-025-ads-data.sql
```

Verificar tamanho dos arquivos antes de continuar:

```bash
ls -lh backups/*-pre-025-*.sql
```

---

## 3. Auditoria de status existentes (DEVE rodar antes da migration)

```sql
-- Anote o resultado: qualquer status fora de
-- {active, paused, deleted, blocked} requer normalização ANTES.
SELECT status, COUNT(*)::int AS total
FROM ads
GROUP BY status
ORDER BY total DESC;
```

Tabela esperada hoje (baseado em auditoria do código em 2026-05-08):

| status   | situação esperada            |
|----------|------------------------------|
| active   | OK (uso oficial)             |
| paused   | OK (uso oficial)             |
| deleted  | OK (uso oficial — soft)      |
| blocked  | OK (uso oficial — admin)     |

Se aparecer **qualquer outro** valor (`archived`, `pending`, `draft`, etc.) parar e abrir incidente:

```sql
-- Investigar registros suspeitos antes de normalizar.
SELECT id, status, created_at, updated_at, advertiser_id, title
FROM ads
WHERE status NOT IN ('active', 'paused', 'deleted', 'blocked')
ORDER BY created_at DESC
LIMIT 50;
```

### Estratégia de normalização (apenas se necessário)

| Encontrado    | Ação                                       |
|---------------|--------------------------------------------|
| `archived`    | `UPDATE ads SET status='deleted' WHERE status='archived';` (alinhar ao soft-delete real) |
| `pending`     | Investigar — pode ser legado de subscription confundido. NÃO migrar sem confirmar dono do dado. |
| `draft`       | Manter — a migration 025 já adiciona DRAFT ao enum canônico. |
| outro         | Triagem manual com PO antes de qualquer UPDATE. |

> Toda normalização deve ser feita em transação:
> ```sql
> BEGIN;
> UPDATE ads SET status='deleted' WHERE status='archived';
> SELECT status, COUNT(*)::int FROM ads GROUP BY status ORDER BY total DESC;
> -- Conferir antes de COMMIT.
> COMMIT;
> ```

---

## 4. Aplicar a migration

```bash
# Caminho oficial via CLI do projeto (registra em schema_migrations).
npm run db:migrate
```

Saída esperada (trecho):

```
[migrate] applying 025_ads_antifraud_moderation.sql
[migrate] OK 025_ads_antifraud_moderation.sql
```

Caso prefira aplicar manualmente:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f src/database/migrations/025_ads_antifraud_moderation.sql

# E registrar no controle de migrations:
psql "$DATABASE_URL" -c \
  "INSERT INTO schema_migrations(version) VALUES ('025_ads_antifraud_moderation') \
   ON CONFLICT DO NOTHING;"
```

A migration é **idempotente** — todas as cláusulas são `ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`. Pode ser re-executada com segurança.

---

## 5. Verificações pós-migration

### 5.1 Colunas adicionadas em `ads`

```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'ads'
  AND column_name IN (
    'risk_score','risk_level','risk_reasons',
    'reviewed_at','reviewed_by','rejection_reason','correction_requested_reason',
    'fipe_reference_value','fipe_diff_percent','structural_change_count'
  )
ORDER BY column_name;
```

Esperado: 10 linhas; defaults `0`, `'low'`, `'[]'::jsonb` etc.

### 5.2 Tabelas auxiliares

```sql
SELECT to_regclass('public.ad_risk_signals') AS risk_signals,
       to_regclass('public.ad_moderation_events') AS moderation_events;
```

Esperado: ambas não-nulas.

### 5.3 Índices

```sql
SELECT indexname FROM pg_indexes
WHERE tablename IN ('ads','ad_risk_signals','ad_moderation_events')
  AND indexname IN (
    'idx_ads_status_risk',
    'idx_ads_pending_review_priority',
    'idx_ad_risk_signals_ad_id',
    'idx_ad_risk_signals_code',
    'idx_ad_moderation_events_ad_id',
    'idx_ad_moderation_events_event_type'
  );
```

Esperado: 6 linhas.

### 5.4 Sanidade dos anúncios pré-existentes

```sql
-- Status (deve bater com o levantado em §3).
SELECT status, COUNT(*)::int FROM ads GROUP BY status ORDER BY 2 DESC;

-- Risk_score = 0 e risk_level = 'low' para tudo que existia antes.
SELECT risk_score, risk_level, COUNT(*)::int
FROM ads
WHERE created_at < NOW() - INTERVAL '5 minutes'
GROUP BY risk_score, risk_level
ORDER BY 3 DESC;
```

Esperado: 100% das rows pré-existentes em `risk_score=0` / `risk_level='low'` (defaults da migration).

### 5.5 Dashboard do anunciante

Abrir `/dashboard/meus-anuncios` (PF) e `/dashboard-loja/meus-anuncios` (CNPJ) com pelo menos um anúncio ACTIVE pré-migration. Verificar:

- [ ] anúncio aparece com badge "Ativo";
- [ ] preço e foto carregam normalmente;
- [ ] botões Pausar/Excluir/Impulsionar habilitados;
- [ ] nenhum anúncio antigo virou "Em análise" ou "Rejeitado".

### 5.6 Feed público

```bash
curl -s "$APP_URL/api/ads/search?limit=5" | jq '.ads[].status'
```

Esperado: todas `"active"`. Nenhuma row `pending_review`/`rejected` aparecendo.

### 5.7 Schema readiness check (defesa contra deploy sem migration)

A partir desta rodada o backend valida no boot e em `/health` que a migration 025 está aplicada. Em `production`/`staging`, schema incompleto:

- impede o boot (`SCHEMA_READINESS_MISSING_MIGRATION_025`);
- degrada `/health` para HTTP 503 com `checks.antifraud_schema = "missing"`.

Conferir manualmente em staging:

```bash
curl -s "$APP_URL/health" | jq '{ok, status, antifraud: .checks.antifraud_schema, missing: .checks.antifraud_schema_missing}'
```

Esperado pós-migration:

```json
{ "ok": true, "status": "healthy", "antifraud": "ok", "missing": null }
```

Se aparecer `"antifraud": "missing"`, **parar** — o pipeline tem `try/catch` que mascara a ausência das colunas e a auditoria fica vazia. A migration 025 precisa rodar antes de promover qualquer release.

Implementação:
- check puro: [src/infrastructure/database/schema-readiness.js](../../src/infrastructure/database/schema-readiness.js)
- hook de boot: [src/index.js](../../src/index.js) (`verifyAntifraudSchemaReady`)
- exposição em healthcheck: [src/routes/health.js](../../src/routes/health.js)

---

## 6. Smoke operacional automatizado (`npm run smoke:antifraud-staging`)

A partir desta rodada existe um script que executa os 7 cenários do plano de validação contra um ambiente real e reporta `PASS|FAIL|SKIP|FATAL` por linha. Rodar **em staging** (o script recusa rodar contra produção sem `ALLOW_PRODUCTION=true` explícito).

```bash
export STAGING_BASE_URL="https://staging-api.carrosnacidade.com"
export STAGING_PUBLIC_BASE_URL="https://staging.carrosnacidade.com"   # opcional
export STAGING_QA_EMAIL="qa-cpf@example.com"
export STAGING_QA_PASSWORD="••••••••"
# Opcional: se a city_id 1 não existir no staging, ajuste:
# export STAGING_CITY_ID=42

npm run smoke:antifraud-staging
```

Cenários executados:

| ID | Cenário                                         | PASS quando                                      |
|----|-------------------------------------------------|--------------------------------------------------|
| PRE| `/health` healthy + `antifraud_schema=ok`       | migration 025 está aplicada                      |
| LOGIN | autentica com QA user                        | `access_token` retornado                         |
| A  | preço compatível com FIPE                       | ad criado com `status=active`                    |
| B  | preço −30% FIPE (códigos canônicos)             | ad criado com `status=pending_review`            |
| C  | preço −45% FIPE                                 | `pending_review` + `risk_level=critical`         |
| D  | preço inválido (R$ 0)                           | HTTP 400, sem INSERT                             |
| E  | sem códigos FIPE (provider indisponível)        | ad criado, `risk_reasons` contém `FIPE_UNAVAILABLE` |
| F  | busca pública após cenário B                    | ad de B NÃO aparece, todos os listados são `active` |
| G  | tentativa de boost no ad de B (`pending_review`)| HTTP 400 (`ad ativo` na mensagem)                |

Exit codes:
- `0` — todos os cenários PASS/SKIP justificado.
- `1` — algum FAIL ou FATAL — produção continua bloqueada.
- `2` — env obrigatória ausente ou guard de produção bloqueou.

Limpeza pós-smoke: o ad criado no cenário B fica em `pending_review` para o cenário G poder usar; o script imprime o `id` e o comando para soft-delete:

```bash
psql "$STAGING_DATABASE_URL" -c \
  "UPDATE ads SET status='deleted' WHERE id=<ID>;"
```

Implementação: [scripts/staging-antifraud-smoke.mjs](../../scripts/staging-antifraud-smoke.mjs).

### 6.1 Sinais de falha no smoke

| Sintoma                                | Diagnóstico                                                    |
|----------------------------------------|----------------------------------------------------------------|
| `[PRE][FATAL] migration 025 ausente…`  | rodar §4 antes de tentar de novo                               |
| `[LOGIN][FATAL] login HTTP 401`        | senha do QA user errada ou conta bloqueada                     |
| `[A][FAIL] esperado active, recebido pending_review` | regras FIPE_REVIEW_PCT/CRITICAL_PCT em valor inesperado, ou provider FIPE retornou preço diferente do esperado |
| `[B][FAIL] esperado pending_review, recebido active` | `fipe_brand_code/model/year` inválidos para staging — backend caiu em FIPE_UNAVAILABLE; ajustar `STAGING_FIPE_*` |
| `[F][FAIL] vazamento`                  | `ads-filter.builder` regrediu o WHERE `status='active'`. INCIDENTE |
| `[G][FAIL] HTTP 200`                   | webhook/checkout aceitou boost em `pending_review`. INCIDENTE  |

Mantenha a saída do smoke arquivada antes de qualquer release de produção.

### 6.2 Apêndice — smoke manual via curl

Útil quando o script não está disponível (ex.: bastion sem npm). Mesmo conjunto de cenários, formato `curl + jq`:

```bash
# Login com user de teste (CPF verificado).
TOKEN=$(curl -s -X POST $APP_URL/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"qa-cpf@example.com","password":"..."}' \
  | jq -r .access_token)

# Caso A — preço compatível (deve nascer ACTIVE)
curl -s -X POST $APP_URL/api/ads \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{ "title":"Civic 2018 LX", "price": 80000, "fipe_value": 85000,
        "city_id": 1, "city":"Atibaia", "state":"SP",
        "brand":"Honda","model":"Civic","year":2018,"mileage":50000,
        "images":["https://r2.example/qa/1.webp"] }' | jq .data.status
# Esperado: "active"

# Caso B — preço 30% abaixo da FIPE (deve nascer PENDING_REVIEW)
curl -s -X POST $APP_URL/api/ads \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{ "title":"Civic 2018 LX", "price": 70000, "fipe_value": 100000, ... }' \
  | jq '.data.status, .data.moderation_status'
# Esperado: "pending_review", "pending_review"

# Caso C — preço 0 (deve REJEITAR)
curl -s -X POST $APP_URL/api/ads \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{ "price": 0, ... }'
# Esperado: HTTP 400 com code: ADS_REJECTED_INVALID_DATA
```

Conferir que anúncio do **Caso B** aparece em `GET /api/admin/moderation/ads` e NÃO aparece em `GET /api/ads/search`.

## 7. Validação manual da UI admin / boost

Depois do smoke automatizado, o operador valida manualmente:

- [ ] login com user comum (`role=user`) → `/admin/moderation` redireciona para `/login?next=/admin`;
- [ ] login com user admin → fila lista os ads dos cenários B e C ordenados por `risk_score`;
- [ ] aprovar o ad do cenário B → status muda para `active`, aparece no feed público;
- [ ] rejeitar (com motivo) outro ad pending_review → status `rejected`, NÃO aparece no público;
- [ ] tentar `POST /api/payments/boost-7d/checkout` em ad rejeitado → HTTP 400.

---

## 8. Rollback

A migration é puramente aditiva (não remove dados). Para reverter sem perder nada:

```sql
BEGIN;

-- Tabelas (drop é seguro — vazias logo após a migration).
DROP TABLE IF EXISTS public.ad_moderation_events;
DROP TABLE IF EXISTS public.ad_risk_signals;

-- Índices em ads.
DROP INDEX IF EXISTS public.idx_ads_status_risk;
DROP INDEX IF EXISTS public.idx_ads_pending_review_priority;

-- Colunas em ads. ALERTA: dados gravados após a migration são perdidos.
ALTER TABLE public.ads
  DROP COLUMN IF EXISTS risk_score,
  DROP COLUMN IF EXISTS risk_level,
  DROP COLUMN IF EXISTS risk_reasons,
  DROP COLUMN IF EXISTS reviewed_at,
  DROP COLUMN IF EXISTS reviewed_by,
  DROP COLUMN IF EXISTS rejection_reason,
  DROP COLUMN IF EXISTS correction_requested_reason,
  DROP COLUMN IF EXISTS fipe_reference_value,
  DROP COLUMN IF EXISTS fipe_diff_percent,
  DROP COLUMN IF EXISTS structural_change_count;

-- Schema_migrations:
DELETE FROM public.schema_migrations
 WHERE version = '025_ads_antifraud_moderation';

-- Inspecione antes de COMMIT.
COMMIT;
```

Se houver anúncios em PENDING_REVIEW ou REJECTED no momento do rollback, ANTES disso rodar:

```sql
UPDATE ads SET status = 'paused'
 WHERE status IN ('pending_review','rejected');
```

(Decisão arquitetural: prefere `paused` porque mantém o ad sob controle do dono e não-público.)

---

## 9. Quando aplicar CHECK constraint em `ads.status`

Migration separada, **não nesta rodada**. Pré-requisitos:

1. Auditoria do §3 sem nenhuma row fora do enum por **7 dias seguidos**.
2. Toda mutation no código passou a usar `AD_STATUS.*` (sem strings cruas) — confirmar com grep:
   ```bash
   grep -RInE "status\s*=\s*'(active|paused|deleted|blocked|pending_review|rejected|sold|expired|draft)'" src/modules/{admin,leads,seo,growth,public,dealers,cities,advertisers}
   ```
3. Plano de rollback testado em staging.

Esboço (NÃO aplicar agora):

```sql
ALTER TABLE ads
  ADD CONSTRAINT ads_status_check
  CHECK (status IN (
    'draft','pending_review','active','paused','sold','expired','rejected','deleted','blocked'
  )) NOT VALID;

-- Validar lote a lote:
ALTER TABLE ads VALIDATE CONSTRAINT ads_status_check;
```

---

## 10. Critérios de "pronto para produção"

Todos os checks abaixo precisam estar ✅ **em staging real**:

- [ ] Migration aplicada em staging (§4).
- [ ] Verificações §5 passaram (colunas, tabelas, índices, dados pré-existentes).
- [ ] `/health` em staging retorna `antifraud_schema=ok` (§5.7).
- [ ] `npm run smoke:antifraud-staging` retorna **exit 0** com 7/7 cenários PASS (§6).
- [ ] Validação manual de admin / boost (§7).
- [ ] Suítes locais limpas (`npm test` raiz e `cd frontend && npm test`).
- [ ] Auditoria §3 em **produção** confirmou ausência de status fora do enum.

Só depois, agendar janela de produção e seguir §2 → §7. **Não promover a release sem o ✅ explícito de cada item acima**: o backend, a partir desta rodada, recusa subir em production sem a migration 025; ainda assim, o operador precisa checar manualmente que o smoke passou em staging antes da release.

---

## Referências

- Migration: [src/database/migrations/025_ads_antifraud_moderation.sql](../../src/database/migrations/025_ads_antifraud_moderation.sql)
- Pipeline: [src/modules/ads/ads.create.pipeline.service.js](../../src/modules/ads/ads.create.pipeline.service.js)
- Service de risco: [src/modules/ads/risk/ad-risk.service.js](../../src/modules/ads/risk/ad-risk.service.js)
- **Backend FIPE Service**: [src/modules/fipe/fipe.service.js](../../src/modules/fipe/fipe.service.js)
- Endpoints admin: [src/modules/admin/admin.routes.js](../../src/modules/admin/admin.routes.js) (seção MODERATION)
- Enum canônico: [src/shared/constants/status.js](../../src/shared/constants/status.js)
- **Schema readiness check**: [src/infrastructure/database/schema-readiness.js](../../src/infrastructure/database/schema-readiness.js) (boot guard + `/health`)
- **Smoke operacional**: [scripts/staging-antifraud-smoke.mjs](../../scripts/staging-antifraud-smoke.mjs) (`npm run smoke:antifraud-staging`)

---

## Apêndice A — Comandos manuais para validação em staging

Esta seção é para o operador que executa o smoke fora deste ambiente
(ex: terminal com acesso direto ao Postgres de staging). Todos os
comandos abaixo são idempotentes ou somente leitura; nenhum aplica
mutation destrutiva.

### A.1 Verificação de pré-condição (env)

```bash
# Confirmar que estamos apontando para STAGING (não produção):
psql "$DATABASE_URL" -c "SELECT current_database(), inet_server_addr();"
# A linha 'current_database' deve indicar staging. Aborte se estiver em prod.
```

### A.2 Backup direcionado (espelha §2 do runbook)

```bash
mkdir -p backups
TS=$(date +%Y%m%d-%H%M)
pg_dump --no-owner --no-acl \
  --table=public.ads --table=public.advertisers --table=public.admin_actions \
  --schema-only "$DATABASE_URL" > "backups/${TS}-pre-025-schema.sql"
pg_dump --no-owner --no-acl \
  --table=public.ads --data-only "$DATABASE_URL" > "backups/${TS}-pre-025-ads-data.sql"
ls -lh backups/${TS}-pre-025-*.sql
```

### A.3 Auditoria de status (§3)

```bash
psql "$DATABASE_URL" -c "
  SELECT status, COUNT(*)::int AS total
  FROM ads
  GROUP BY status
  ORDER BY total DESC;
"
```

Se aparecer qualquer status fora de
`active|paused|deleted|blocked|pending_review|rejected|sold|expired|draft`,
**parar** e abrir issue antes da migration.

### A.4 Aplicar migration (§4)

```bash
# Caminho oficial:
npm run db:migrate

# Confirma versão registrada:
psql "$DATABASE_URL" -c "
  SELECT version, applied_at FROM schema_migrations
  WHERE version LIKE '025_%' ORDER BY applied_at DESC LIMIT 1;
"
```

### A.5 Verificações pós-migration (§5)

```bash
psql "$DATABASE_URL" <<'SQL'
-- 5.1 Colunas novas em ads
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'ads'
  AND column_name IN (
    'risk_score','risk_level','risk_reasons',
    'reviewed_at','reviewed_by','rejection_reason','correction_requested_reason',
    'fipe_reference_value','fipe_diff_percent','structural_change_count'
  )
ORDER BY column_name;

-- 5.2 Tabelas auxiliares
SELECT to_regclass('public.ad_risk_signals')      AS risk_signals,
       to_regclass('public.ad_moderation_events') AS moderation_events;

-- 5.3 Índices
SELECT indexname FROM pg_indexes
 WHERE tablename IN ('ads','ad_risk_signals','ad_moderation_events')
   AND indexname IN (
     'idx_ads_status_risk','idx_ads_pending_review_priority',
     'idx_ad_risk_signals_ad_id','idx_ad_risk_signals_code',
     'idx_ad_moderation_events_ad_id','idx_ad_moderation_events_event_type'
   );

-- 5.4 Sanidade dos anúncios pré-existentes
SELECT risk_score, risk_level, COUNT(*)::int
  FROM ads
 WHERE created_at < NOW() - INTERVAL '5 minutes'
 GROUP BY risk_score, risk_level
 ORDER BY 3 DESC;
SQL
```

### A.6 Smoke A/B/C/D do pipeline (§6)

Substitua `$APP_URL`, `$EMAIL`, `$PASSWORD` antes de executar.

```bash
APP_URL="https://staging.carrosnacidade.com.br"
EMAIL="qa-cpf@example.com"
PASSWORD="..."

TOKEN=$(curl -sS -X POST "$APP_URL/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" \
  | jq -r .access_token)
echo "TOKEN=${TOKEN:0:8}…"

# Caso A — preço compatível, com códigos FIPE canônicos.
# Esperado: HTTP 201, status="active".
curl -sS -X POST "$APP_URL/api/ads" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{
    "title":"Civic 2018 LX",
    "price": 80000,
    "city_id": 1, "city":"Atibaia", "state":"SP",
    "brand":"Honda","model":"Civic","year":2018,"mileage":50000,
    "images":["https://r2.example/qa/1.webp"],
    "fipe_brand_code":"23","fipe_model_code":"5585","fipe_year_code":"2018-1"
  }' | jq '.data | {id, status, risk_level, risk_score}'

# Caso B — -30% abaixo da FIPE.
# Esperado: HTTP 201, status="pending_review", PRICE_BELOW_FIPE_REVIEW.
curl -sS -X POST "$APP_URL/api/ads" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{
    "title":"Civic 2018 LX",
    "price": 70000,
    "city_id": 1, "city":"Atibaia", "state":"SP",
    "brand":"Honda","model":"Civic","year":2018,"mileage":50000,
    "images":["https://r2.example/qa/1.webp"],
    "fipe_brand_code":"23","fipe_model_code":"5585","fipe_year_code":"2018-1"
  }' | jq '.data | {id, status, risk_level, risk_reasons}'

# Caso C — preço inválido (zero / R$1).
# Esperado: HTTP 400 code="ADS_REJECTED_INVALID_DATA".
curl -i -sS -X POST "$APP_URL/api/ads" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{ "title":"x", "price": 0, "city_id": 1, "city":"A", "state":"SP",
        "brand":"Honda","model":"Civic","year":2018,"mileage":0,
        "images":["https://r2.example/qa/1.webp"] }' | head -25

# Caso D — preço 45%+ abaixo da FIPE.
# Esperado: status="pending_review", risk_level="critical".
curl -sS -X POST "$APP_URL/api/ads" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{
    "title":"Civic 2018 LX",
    "price": 55000,
    "city_id": 1, "city":"Atibaia", "state":"SP",
    "brand":"Honda","model":"Civic","year":2018,"mileage":50000,
    "images":["https://r2.example/qa/1.webp"],
    "fipe_brand_code":"23","fipe_model_code":"5585","fipe_year_code":"2018-1"
  }' | jq '.data | {id, status, risk_level}'

# Caso E — anti-spoof: cliente envia fipe_value alto SEM códigos.
# Esperado: status="active" e risk_reasons contém FIPE_UNAVAILABLE
# (hint do cliente é registrado em ad_moderation_events mas não é
# fonte autoritativa).
curl -sS -X POST "$APP_URL/api/ads" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{
    "title":"Civic 2018 LX",
    "price": 70000,
    "fipe_value": 200000,
    "city_id": 1, "city":"Atibaia", "state":"SP",
    "brand":"Honda","model":"Civic","year":2018,"mileage":50000,
    "images":["https://r2.example/qa/1.webp"]
  }' | jq '.data | {id, status, risk_reasons}'
```

### A.7 Conferência manual da fila admin

Login com usuário admin (ver A.8) e abrir
`https://staging.carrosnacidade.com.br/admin/moderation`.

Esperado:
- Caso B e Caso D aparecem na lista, ordenados por `risk_score` ↓.
- Caso A não aparece (foi para `active`).
- Botão "Revisar" leva ao detalhe; ações `approve / reject / request-correction`
  funcionam e atualizam o status.

### A.8 Promover usuário a admin em staging (se necessário)

```bash
# 1) Confirme o id do usuário a promover:
psql "$DATABASE_URL" -c "SELECT id, email, role FROM users WHERE email = 'admin@staging.local' LIMIT 1;"

# 2) Promover (idempotente):
psql "$DATABASE_URL" -c "UPDATE users SET role = 'admin' WHERE email = 'admin@staging.local' RETURNING id, role;"
```

### A.9 Conferência do feed público (Tarefa 5)

```bash
# Lista pública: nenhum status diferente de active.
curl -sS "$APP_URL/api/ads/search?limit=20" | jq '[.ads[].status] | unique'
# Esperado: ["active"]

# Detalhe direto pelo slug do ad B (deve 404 enquanto pending_review):
curl -i -sS "$APP_URL/api/ads/<slug-do-ad-B>" | head -3
# Esperado: HTTP/1.1 404 Not Found
```

### A.10 Teste do anti-spoof FIPE (Tarefa 7/8)

```bash
# Cria ad com price=70k tentando enviar fipe_value=70k (igual ao preço)
# E códigos canônicos válidos. O backend cota e descobre o valor real.
# Se o real for 100k+, esperado: pending_review.
# (Mesma chamada do Caso B em A.6 — o anti-spoof é exatamente isto:
# o backend usa o snapshot do provider, ignorando o fipe_value do cliente.)
```

Para auditar o que o backend FIPE service registrou:

```sql
SELECT id, ad_id, event_type, metadata->>'confidence' AS confidence,
       metadata->>'source' AS source, metadata->>'used_client_hint' AS used_hint,
       metadata->>'value' AS server_value, metadata->>'client_hint_value' AS hint_value,
       created_at
FROM ad_moderation_events
WHERE event_type = 'fipe_resolved'
ORDER BY created_at DESC
LIMIT 20;
```

### A.11 Verificar variáveis de ambiente do FIPE

```bash
# Configure (ou herde de .env):
#   FIPE_API_BASE_URL  default: https://parallelum.com.br/fipe/api/v1
#   FIPE_BACKEND_DISABLED=true   → desliga lookup (modo seguro/dev)
#   FIPE_ALLOW_CLIENT_HINT=false → bloqueia até o registro do hint do cliente

# Para staging recomendado:
#   FIPE_BACKEND_DISABLED=false (default)
#   FIPE_ALLOW_CLIENT_HINT=true (default)
#   FIPE_API_BASE_URL = endpoint da parallelum ou mirror caching interno
```
