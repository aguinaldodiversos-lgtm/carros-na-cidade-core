# Alinhamento de Planos Comerciais — Oferta de Lançamento

> **Status:**
> - **Fase 1** (fallbacks + copy): entregue, em main.
> - **Fase 2A** (migration de preço/limite/is_active): **migration pronta + script de auditoria + testes**, AGUARDANDO execução com revisão. Detalhes abaixo.
> - **Fase 2B** (colunas novas: max_photos/weight/video_360_enabled/monthly_highlight_credits): pendente, requer runbook próprio.

## Oferta oficial de lançamento

| Plano | Preço | Anúncios | Fotos | Peso | Vídeo 360 | Destaques/mês incluídos |
|---|---|---|---|---|---|---|
| Grátis CPF | R$ 0 | 3 | 8 | 1 | ❌ | 0 |
| Grátis CNPJ | R$ 0 | 10 | 8 | 1 | ❌ | 0 |
| Lojista Start | **R$ 79,90/mês** | 20 | 12 | 2 | ❌ | 1 |
| Lojista Pro | **R$ 149,90/mês** | ilimitado (trava 1000) | 15 | 3 | ✅ | 3 |
| Destaque 7 dias | **R$ 39,90** (boost avulso) | — | — | 4 enquanto ativo | ❌ | — |

Destaque 7 dias é boost avulso (não plano), válido para CPF e CNPJ, duração 7 dias, **compras duplicadas estendem prazo, não aumentam prioridade**.

## Fonte de verdade

- **Banco/admin** é a fonte de verdade real: tabela `subscription_plans` + endpoint admin (`PATCH /api/admin/plans/:id`).
- **DEFAULT_PLANS** (backend `account.service.js`) e **planSeed** (frontend `plan-store.ts`) são FALLBACK — só expostos quando query do banco retorna vazio ou falha.
- Recomendação: todos os limites editáveis pelo admin no futuro (UI dedicada — fase posterior).

## Fase 1 — entregue (este PR)

**Alterações cirúrgicas, sem migration de banco:**

- `frontend/lib/plans/plan-store.ts` — `planSeed` alinhado à oferta. Campos opcionais novos: `max_photos`, `weight`, `video_360_enabled`, `monthly_highlight_credits`. Planos descontinuados (`cpf-premium-highlight`, `cnpj-evento-premium`) com `is_active=false`.
- `src/modules/account/account.service.js` — `DEFAULT_PLANS` espelha as mesmas mudanças. Trava técnica `PRO_PLAN_AD_LIMIT_GUARD = 1000` para "ilimitado".
- `frontend/app/planos/page.tsx` — copy "Limite gratuito de 20" → "10" (CNPJ).
- `frontend/lib/plans/plan-store.test.ts` (NOVO) — 25 testes travando alinhamento + ausência de Evento Premium na listagem pública.

**O que NÃO foi feito (intencional, fora de escopo):**

- Banco de produção mantém preços antigos (R$ 299,90 / R$ 599,90). Alteração via migration → Fase 2.
- `plan_credits` (tabela de créditos mensais) não existe — concessão automática de destaques mensais ainda não implementada.
- Vídeo 360 não tem coluna no schema — `video_360_enabled` só vive no fallback.
- Hard-cap de fotos no wizard (`frontend/components/painel/new-ad-wizard/WizardSteps.tsx:427` — `totalCount < 10` global) **não foi alterado**: oferta oficial varia (8/12/15) e backend ainda não diferencia por plano.

## Política para assinaturas ativas (Fase 2A)

A migration **não toca** `user_subscriptions` ou `payments`. Política
operacional:

| Caso | Política |
|---|---|
| Lojista com Start ativo (R$ 299,90, ciclo em curso) | Mantém o ciclo até `expires_at`. Mercado Pago não é re-cobrado pela migration; renovação automática usa o preço NOVO (R$ 79,90) lido do banco. |
| Lojista com Pro ativo (R$ 599,90, ciclo em curso) | Idem: ciclo atual continua, próxima cobrança em R$ 149,90. |
| Lojista com `cpf-premium-highlight` (one-time 30 dias) | Mantém destaque até `expires_at`. Não há renovação automática (one-time). Após vencer, plano fica indisponível para nova compra. |
| Lojista com `cnpj-evento-premium` ativo | Cenário improvável (produto desligado por flag). Se existir, mantém até `expires_at`. Não há nova venda possível enquanto flag e is_active estiverem desligados. |
| Nova assinatura criada após migration | Usa preço novo automaticamente (frontend lê de `/api/account/plans`, backend valida `subscription_plans.price` no `createPlanSubscription`). |

**Comunicação obrigatória ANTES de rodar 2A em produção** (script de
auditoria mostra a contagem real):

1. E-mail aos lojistas Start/Pro ativos: "a partir de [data], a renovação
   do seu plano será cobrada no valor novo de R$ 79,90 (Start) /
   R$ 149,90 (Pro). Sua assinatura atual continua válida até [expires_at]."
2. Considerar reembolso proporcional para quem renovou ≤ 7 dias antes
   (decisão produto / financeiro).
3. Atualizar página `/planos` apenas após e-mail enviado, para evitar
   cliente novo pagar preço antigo enquanto banco ainda tem 299,90.

## Fase 2A — execução (artefatos prontos, NÃO rodar sem revisão)

Esta seção foi promovida do "proposto" para "pronto para revisão". Os
artefatos abaixo já estão no repo:

| Artefato | Caminho |
|---|---|
| Migration idempotente | [src/database/migrations/023_subscription_plans_launch_alignment.sql](../../src/database/migrations/023_subscription_plans_launch_alignment.sql) |
| Script de auditoria read-only | [scripts/maintenance/audit-subscription-plans.mjs](../../scripts/maintenance/audit-subscription-plans.mjs) |
| Testes de contrato (16 asserts) | [tests/account/list-plans-launch-alignment.test.js](../../tests/account/list-plans-launch-alignment.test.js) |

### 2A.1. Pré-flight — auditoria read-only em produção

**Antes** de rodar a migration, audite o estado real:

```bash
# Saída humana (default) — exit 0 se já alinhado, 1 se divergente
node scripts/maintenance/audit-subscription-plans.mjs

# Saída JSON para dashboard / arquivar evidência
node scripts/maintenance/audit-subscription-plans.mjs --json > reports/plans-pre-023.json
```

Saída esperada hoje (pré-023): exit code 1, com diff detalhando
`cnpj-store-start price=299.9 (esperado 79.9)`, `cnpj-store-pro
price=599.9 (esperado 149.9)`, etc. **Também imprime quantas
subscriptions ativas existem por plano** — informa decisão de comunicar
lojistas antes de rodar.

Manualmente, em `psql`:

```sql
-- Schema: confirmar colunas/tipos antes de tocar
\d subscription_plans

-- Estado atual
SELECT id, type, price::numeric, ad_limit, is_active, priority_level, billing_model
FROM subscription_plans
ORDER BY type, priority_level;

-- Impacto de descontinuar / mudar preço (subscriptions vivas por plano)
SELECT plan_id, COUNT(*) AS active_subs
FROM user_subscriptions
WHERE status = 'active' AND (expires_at IS NULL OR expires_at > NOW())
GROUP BY plan_id ORDER BY plan_id;

-- Constraints (não devem ser violadas pelos novos valores)
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint WHERE conrelid = 'subscription_plans'::regclass;
```

### 2A.2. Aplicar migration

```bash
# Local / staging primeiro:
psql "$DATABASE_URL" -f src/database/migrations/023_subscription_plans_launch_alignment.sql

# A migration:
#  - usa BEGIN/COMMIT (atômica)
#  - valida pré-existência de subscription_plans (DO $$ ... RAISE)
#  - é IDEMPOTENTE: rodar 2x devolve 0 linhas afetadas na 2ª
#  - valida invariantes pós-update (DO $$ ... RAISE EXCEPTION)
```

Espera-se 5 UPDATEs (cnpj-free-store, cnpj-store-start, cnpj-store-pro,
cpf-premium-highlight, cnpj-evento-premium). `cpf-free-essential` não é
tocado — já bate a oferta.

### 2A.3. Validação pós-deploy

```bash
# Auditoria deve agora reportar ALINHADO
node scripts/maintenance/audit-subscription-plans.mjs
# Esperado: exit 0, "✓ ALINHADO com oferta oficial"

# API pública: preço novo
curl -s https://carrosnacidade.com/api/account/plans?type=CNPJ | jq '.plans[] | {id, price, ad_limit}'
# Esperado:
# { "id": "cnpj-free-store",  "price": 0,    "ad_limit": 10 }
# { "id": "cnpj-store-start", "price": 79.9, "ad_limit": 20 }
# { "id": "cnpj-store-pro",   "price": 149.9,"ad_limit": 1000 }
# (Evento NÃO aparece — filtrado por is_active=false + flag)

# Página /planos não menciona preços antigos nem Evento
curl -s https://carrosnacidade.com/planos | grep -E "299,90|599,90|Evento Premium" \
  || echo "OK — sem preços antigos nem Evento"
```

### 2A.4. Rollback (caso emergência)

A migration é só `UPDATE` — rollback é `UPDATE` inverso. **Não há
DROP/DELETE** para reverter. Estado pré-023 documentado:

```sql
BEGIN;
UPDATE subscription_plans SET ad_limit = 20,
  benefits = '["Ate 20 anuncios ativos","Perfil de loja ativo","Sem comissao nas vendas"]'::jsonb,
  updated_at = NOW()
WHERE id = 'cnpj-free-store';

UPDATE subscription_plans SET price = 299.90, ad_limit = 80,
  benefits = '["Ate 80 anuncios","Perfil de loja personalizado","Destaques configuraveis"]'::jsonb,
  updated_at = NOW()
WHERE id = 'cnpj-store-start';

UPDATE subscription_plans SET price = 599.90, ad_limit = 200,
  benefits = '["Ate 200 anuncios","Destaque automatico","Dashboard de performance por cidade"]'::jsonb,
  updated_at = NOW()
WHERE id = 'cnpj-store-pro';

UPDATE subscription_plans SET is_active = true, updated_at = NOW()
WHERE id IN ('cpf-premium-highlight', 'cnpj-evento-premium');
COMMIT;
```

Note que o rollback do `is_active` em `cnpj-evento-premium` ainda mantém
o filtro de Eventos via `EVENTS_PUBLIC_ENABLED` (flag), então rollback
sozinho não re-expõe Evento Premium publicamente.

### 2A.5. Critérios de aceite

- ✅ `audit-subscription-plans.mjs` exit code 0 (alinhado)
- ✅ `curl /api/account/plans?type=CNPJ` devolve `cnpj-store-start price=79.9`, `cnpj-store-pro price=149.9, ad_limit=1000`, `cnpj-free-store ad_limit=10`
- ✅ `curl /api/account/plans` NÃO devolve `cnpj-evento-premium` (filtrado por is_active + flag)
- ✅ `/planos` HTML não contém "R$ 299,90" / "R$ 599,90" / "Evento Premium"
- ✅ subscriptions ativas pré-migration continuam funcionando até `expires_at`
- ✅ `tests/account/list-plans-launch-alignment.test.js` continua verde

## Fase 2B — colunas novas (não executar agora)

Continuação documentada (schema dedicado para max_photos / weight / etc.):

### 2.1. Migration de schema (`subscription_plans`)

```sql
-- Adicionar colunas opcionais (default seguro: NULL = comportamento legado)
ALTER TABLE subscription_plans
  ADD COLUMN IF NOT EXISTS max_photos INTEGER,
  ADD COLUMN IF NOT EXISTS weight SMALLINT,
  ADD COLUMN IF NOT EXISTS video_360_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS monthly_highlight_credits INTEGER DEFAULT 0;

-- Constraint defensiva: weight 1..4 (espelha commercial_layer SQL)
ALTER TABLE subscription_plans
  ADD CONSTRAINT subscription_plans_weight_check
  CHECK (weight IS NULL OR weight BETWEEN 1 AND 4);
```

### 2.2. Backfill / atualização de preços de planos

```sql
BEGIN;

-- Grátis CNPJ: ad_limit 20 → 10
UPDATE subscription_plans
SET ad_limit = 10, max_photos = 8, weight = 1,
    video_360_enabled = false, monthly_highlight_credits = 0,
    benefits = '["Ate 10 anuncios ativos","Ate 8 fotos por anuncio","Perfil de loja ativo","Sem comissao nas vendas"]'::jsonb
WHERE id = 'cnpj-free-store';

-- Grátis CPF: campos opcionais
UPDATE subscription_plans
SET max_photos = 8, weight = 1, video_360_enabled = false, monthly_highlight_credits = 0
WHERE id = 'cpf-free-essential';

-- Start CNPJ: R$ 299,90 → R$ 79,90; ad_limit 80 → 20
UPDATE subscription_plans
SET price = 79.90, ad_limit = 20, max_photos = 12, weight = 2,
    video_360_enabled = false, monthly_highlight_credits = 1,
    benefits = '["Ate 20 anuncios ativos","Ate 12 fotos por anuncio","1 destaque mensal incluido","Perfil de loja personalizado"]'::jsonb
WHERE id = 'cnpj-store-start';

-- Pro CNPJ: R$ 599,90 → R$ 149,90; ad_limit 200 → 1000 (trava); vídeo 360
UPDATE subscription_plans
SET price = 149.90, ad_limit = 1000, max_photos = 15, weight = 3,
    video_360_enabled = true, monthly_highlight_credits = 3,
    benefits = '["Anuncios ilimitados (trava tecnica configuravel pelo admin)","Ate 15 fotos por anuncio","3 destaques mensais inclusos","Video 360 habilitado","Dashboard de performance por cidade"]'::jsonb
WHERE id = 'cnpj-store-pro';

-- Descontinuar planos legados (NÃO deletar — preserva FKs em user_subscriptions/payments)
UPDATE subscription_plans SET is_active = false WHERE id IN ('cpf-premium-highlight','cnpj-evento-premium');

-- Validação obrigatória ANTES do COMMIT:
SELECT id, price, ad_limit, weight, video_360_enabled, monthly_highlight_credits, is_active
FROM subscription_plans ORDER BY type, priority_level;

-- Se diferir do esperado: ROLLBACK; investigar; rerunar
COMMIT;
```

### 2.3. Comunicação aos lojistas existentes

Antes de rodar 2.2 em produção:

- **Lojistas atuais com Start (R$ 299,90) ou Pro (R$ 599,90)**: assinaturas vivas continuam válidas até vencer (`user_subscriptions.expires_at`). Próxima renovação cai no preço novo.
- Mandar e-mail informando: data da queda de preço, novo limite de fotos, novos destaques mensais inclusos.
- Considerar reembolso proporcional para quem renovou há ≤ 7 dias (decisão produto).

### 2.4. Implementações dependentes (issues separadas)

| Item | Onde | Bloqueia oferta? |
|---|---|---|
| Tabela `plan_credits` + worker mensal de concessão | `src/database/migrations/0XX_plan_credits.sql` | ✅ destaques mensais inclusos |
| Coluna `ads.video_360_url` + upload no wizard | `src/database/migrations/0XX_ads_video_360.sql` | ✅ vídeo 360 do Pro |
| Validação `max_photos` por plano no controller de criar/editar ad | `src/modules/ads/ads.controller.js` | ⚠️ usuário pode contornar UI sem isso |
| Desativar hard-cap global de 10 fotos no wizard | `frontend/components/painel/new-ad-wizard/WizardSteps.tsx:427` | ⚠️ Pro travado em 10 fotos hoje |
| UI admin para editar planos | `frontend/app/admin/planos/page.tsx` (novo) | ❌ não bloqueia lançamento |

### 2.5. Pós-deploy — smoke tests

```bash
# 1. Endpoint público devolve preços novos
curl -s https://carrosnacidade.com/api/account/plans?type=CNPJ | jq '.plans[] | {id, price, ad_limit}'

# Esperado:
# { "id": "cnpj-free-store",  "price": 0,     "ad_limit": 10 }
# { "id": "cnpj-store-start", "price": 79.9,  "ad_limit": 20 }
# { "id": "cnpj-store-pro",   "price": 149.9, "ad_limit": 1000 }

# 2. Página /planos não menciona R$ 299,90 / R$ 599,90 / Evento
curl -s https://carrosnacidade.com/planos | grep -E "299,90|599,90|Evento Premium" || echo "OK — sem preços antigos nem Evento"

# 3. Plano Evento não vaza
curl -s https://carrosnacidade.com/api/account/plans | jq '.plans[] | select(.id == "cnpj-evento-premium")'
# Esperado: vazio (filtrado por is_active + EVENTS_PUBLIC_ENABLED)
```

## Riscos remanescentes (Fase 1)

1. **Banco de produção continua com preços antigos.** Frontend chama backend (`fetchPlansFromAPI`); enquanto banco não for migrado, a página `/planos` mostra R$ 299,90 / R$ 599,90 — não os números novos do fallback. **Fallback só aparece se backend cair.**
2. **`cpf-premium-highlight`** continua ativo no banco (priority_level=50 → boost de ranking peso 2). Se algum usuário ainda tiver subscription ativa nesse plano, ele segue ganhando peso 2 até `expires_at`. Sem ação adicional necessária.
3. **`PRO_PLAN_AD_LIMIT_GUARD=1000`** é trava arbitrária — admin precisa decidir o número final. 1000 cobre 99% dos casos atuais sem permitir abuso.

## Ranking — confirmação (sem alteração)

Já alinhado em `src/modules/ads/filters/ads-ranking.sql.js:60-67`:

```sql
CASE
  WHEN a.highlight_until > NOW() THEN 4    -- Destaque 7 dias ativo
  WHEN sp.priority_level >= 80 THEN 3      -- Pro
  WHEN sp.priority_level >= 50 THEN 2      -- Start (e cpf-premium-highlight legado)
  ELSE 1                                    -- Grátis (CPF/CNPJ) e demais
END
```

`priority_level` real do banco já bate com a hierarquia. Nenhuma mudança de SQL nesta fase.
