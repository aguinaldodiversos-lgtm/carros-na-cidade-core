# Runbook — Migration 025 (Antifraude e Moderação)

Última revisão: 2026-05-08

## Objetivo

Aplicar a migration `src/database/migrations/025_ads_antifraud_moderation.sql` em **staging** (validação) e depois em **produção**, garantindo:

- backup íntegro antes de qualquer ALTER;
- nenhuma row com status fora do enum canônico em produção;
- migration idempotente (pode rodar múltiplas vezes sem erro);
- pipeline de criação continua funcional;
- anúncios ACTIVE existentes continuam visíveis;
- dashboard do anunciante carrega anúncios pré-migration sem alteração visual.

> **Importante:** esta migration NÃO inclui `CHECK constraint` em `ads.status`. A constraint só será aplicada numa migration posterior, depois de auditoria explícita dos dados em produção. Ver §6.

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

---

## 6. Smoke do pipeline de criação

Em staging (NÃO em produção), criar um anúncio novo de teste para validar o pipeline completo:

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

---

## 7. Rollback

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

## 8. Quando aplicar CHECK constraint em `ads.status`

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

## 9. Critérios de "pronto para produção"

- [x] Migration aplicada em staging.
- [x] Verificações §5 passaram.
- [x] Smoke §6 passou (Caso A → ACTIVE, B → PENDING_REVIEW, C → REJECTED).
- [x] Suite de testes backend rodou (`npm test` ou `npx vitest run`).
- [ ] **Bloqueador:** auditoria §3 NÃO retornou status fora do enum **em produção**.
- [ ] **Bloqueador:** painel admin abre `/admin/moderation` sem erros.
- [ ] **Bloqueador:** filtros públicos validados (busca pública só retorna ACTIVE).

Quando todos os bloqueadores estiverem checados, agendar janela de produção e seguir §2 → §6.

---

## Referências

- Migration: [src/database/migrations/025_ads_antifraud_moderation.sql](../../src/database/migrations/025_ads_antifraud_moderation.sql)
- Pipeline: [src/modules/ads/ads.create.pipeline.service.js](../../src/modules/ads/ads.create.pipeline.service.js)
- Service de risco: [src/modules/ads/risk/ad-risk.service.js](../../src/modules/ads/risk/ad-risk.service.js)
- Endpoints admin: [src/modules/admin/admin.routes.js](../../src/modules/admin/admin.routes.js) (seção MODERATION)
- Enum canônico: [src/shared/constants/status.js](../../src/shared/constants/status.js)
