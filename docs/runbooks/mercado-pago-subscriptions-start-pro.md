# Runbook — Assinaturas mensais Start/Pro via Mercado Pago (Fase 3C)

> **Status:** arquitetura pronta + endpoints dedicados + subscription
> client + testes + migration 024 (NÃO aplicada). Aguarda
> validação ponta a ponta em sandbox antes de:
> 1. Aplicar migration 024 em produção
> 2. Trocar CTAs de `/planos` para usar `/api/payments/subscriptions/checkout`
> 3. Configurar credenciais MP de produção

## Política comercial desta fase

| Plano | Preço/mês | ID canônico | Visível em /planos? | Checkout pronto? |
|---|---|---|---|---|
| Lojista Start | R$ 79,90 | `cnpj-store-start` | sim, com CTA `/anunciar?plano=start` (não MP) | sim, atrás de endpoint dedicado |
| Lojista Pro | R$ 149,90 | `cnpj-store-pro` | sim, com CTA `/anunciar?plano=pro` (não MP) | sim, atrás de endpoint dedicado |
| ~~Evento Premium~~ | bloqueado | `cnpj-evento-premium` | NÃO (flag desligada + is_active=false no fallback) | endpoint REJEITA com 410 |
| ~~CPF Premium Highlight~~ | descontinuado | `cpf-premium-highlight` | NÃO | endpoint REJEITA com 410 |

**Trava de produto:** `/planos` continua estática até checklist final ser validado em sandbox. Os endpoints abaixo são acessíveis via JWT autenticado e podem ser testados por admin/sandbox sem expor para usuário comum.

## Variáveis de ambiente

Mesmas da Fase 3B (boost-7d):

| Var | Sandbox | Produção |
|---|---|---|
| `MP_ACCESS_TOKEN` | `TEST-...` | `APP_USR-...` (NÃO configurar até migration 024 aplicada e checklist completo) |
| `MP_WEBHOOK_SECRET` | qualquer | obrigatório (boot falha sem ele em prod) |
| `MP_PUBLIC_KEY` | `TEST-pk-...` | `APP_USR-pk-...` |
| `APP_BASE_URL` | URL pública staging | URL pública prod |

Sem `MP_ACCESS_TOKEN`, todo o fluxo cai em modo MOCK: cliente devolve preapproval id sintético, webhook não recebe nada real. Útil em dev local.

## Migration 024 (NÃO aplicada)

`src/database/migrations/024_user_subscriptions_phase3c.sql` adiciona:

- `provider TEXT` — sempre `'mercado_pago'` na Fase 3C
- `provider_preapproval_id TEXT` (UNIQUE quando NOT NULL) — idempotência absoluta
- `external_reference TEXT` — UUID local que liga payment_intents → user_subscriptions
- `current_period_start TIMESTAMPTZ` / `current_period_end TIMESTAMPTZ`
- `cancel_at_period_end BOOLEAN DEFAULT false`
- `last_payment_id TEXT`
- `metadata JSONB DEFAULT '{}'`
- `updated_at TIMESTAMPTZ DEFAULT NOW()`

Atualiza `user_subscriptions_status_check` para incluir 6 estados locais alvo (`pending, active, paused, cancelled, payment_failed, expired`) **mantendo `canceled` legado** para compat de rows pré-migration.

Garantias:
- 100% idempotente (`ADD COLUMN IF NOT EXISTS`, `CREATE UNIQUE INDEX IF NOT EXISTS`)
- Zero DROP/DELETE de coluna ou linha
- Validação `DO $$ ... RAISE EXCEPTION` no fim — falha se schema inconsistente

### Como aplicar em staging

```bash
# 1. Pré-flight: snapshot do schema
psql "$DATABASE_URL" -c "\d user_subscriptions" > reports/user_subs-pre-024.txt

# 2. Aplicar
psql "$DATABASE_URL" -f src/database/migrations/024_user_subscriptions_phase3c.sql

# 3. Validar
psql "$DATABASE_URL" -c "
  SELECT column_name, data_type
  FROM information_schema.columns
  WHERE table_name = 'user_subscriptions'
  ORDER BY ordinal_position;
"
# Esperado: 9 colunas novas + 6 originais

psql "$DATABASE_URL" -c "
  SELECT pg_get_constraintdef(oid)
  FROM pg_constraint
  WHERE conrelid = 'user_subscriptions'::regclass
    AND conname = 'user_subscriptions_status_check';
"
# Esperado: CHECK (status IN (pending, active, paused, cancelled, canceled, payment_failed, expired))
```

### Rollback

A migration é `ADD COLUMN` + `ADD CONSTRAINT`. Não há `DROP` para reverter colunas (elas são inofensivas se não usadas). Para remover a constraint nova:

```sql
BEGIN;
ALTER TABLE user_subscriptions DROP CONSTRAINT user_subscriptions_status_check;
-- Restaura constraint da migration 020 (apenas 4 estados):
ALTER TABLE user_subscriptions
  ADD CONSTRAINT user_subscriptions_status_check
  CHECK (status IN ('active', 'expired', 'canceled', 'pending'));
COMMIT;
```

## Endpoints (já no código, NÃO acionados pela /planos)

| Método | Rota | Auth | Body | Comportamento |
|---|---|---|---|---|
| POST | `/api/payments/subscriptions/checkout` | JWT | `{ plan_id }` | whitelist Start/Pro, anti-Evento, bloqueia duplicata, cria preapproval no MP, retorna `init_point` |
| POST | `/api/payments/subscriptions/cancel` | JWT | `{}` | cancela sub viva do user no MP, marca `cancel_at_period_end=true`, status local pelo `mapPreapprovalStatusToLocal` |
| POST | `/api/payments/webhook` | nenhuma (HMAC) | payload MP | já trata preapproval; idempotente via `payment_resource_id UNIQUE` + `FOR UPDATE` |

### Defesas no checkout

| Risco | Defesa |
|---|---|
| Cliente assinar Evento Premium | Whitelist explícita em `ALLOWED_SUBSCRIPTION_PLAN_IDS` rejeita com **410** |
| Cliente assinar CPF Premium Highlight (descontinuado) | Mesma whitelist rejeita com **410** |
| Cliente alterar preço (R$ 0,01) | `createPlanSubscription` lê preço de `subscription_plans.price` (banco) ou `DEFAULT_PLANS` (fallback). Função NÃO aceita `amount/price/unit_price` na assinatura |
| Cliente criar 2 subs simultâneas (cobrar 2x) | `findLiveSubscriptionForUser` rejeita com **409** se status `active/pending/paused` |
| Cliente cancelar sub de outro user | `cancelUserSubscription` busca a sub VIA `userId` autenticado — não aceita `subscription_id` arbitrário no body |
| Webhook duplicado renovar período 2x | `payment_intents.payment_resource_id UNIQUE` + `FOR UPDATE` lock + check `intent.status === 'approved'` antes de renovar |
| `payment_failed` cancelar acesso imediato | Política conservadora: status local vira `payment_failed` (visível no painel), mas `users.plan_id` NÃO é rebaixado até `expired` |

## Estados locais — fluxos

| Estado | Origem | Ação no painel | `users.plan_id` |
|---|---|---|---|
| `pending` | Checkout criado, aguardando autorização MP | Avisar usuário pra completar pagamento | inalterado |
| `active` | Webhook autorização recebido (status=approved/authorized) | Acesso liberado | atualizado para Start/Pro |
| `paused` | User pausou no portal MP | Aviso + botão "reativar" | mantém Start/Pro até expirar |
| `cancelled` | User cancelou (endpoint local ou portal MP) | Confirmação cancelamento | rebaixa para Free no fim do período |
| `payment_failed` | Cobrança recusada | Aviso vermelho + botão "atualizar cartão" | mantém Start/Pro (1 ciclo de carência) |
| `expired` | Vigência terminou sem renovar | Convite a reassinar | rebaixa para Free |

## Sandbox — primeiro fluxo ponta a ponta

```bash
# 1. Aplicar migration em staging (ver acima)

# 2. Configurar envs sandbox
export MP_ACCESS_TOKEN=TEST-...
export MP_WEBHOOK_SECRET=$(openssl rand -hex 32)
export APP_BASE_URL=https://staging.carrosnacidade.com

# 3. Cadastrar webhook URL no painel MP sandbox:
#    https://staging.carrosnacidade.com/api/payments/webhook
#    Eventos: payment, preapproval, subscription_authorized_payment

# 4. Criar checkout para user CNPJ verificado de teste
JWT=$(./scripts/get-test-jwt.sh u-test-cnpj)
curl -X POST https://staging.carrosnacidade.com/api/payments/subscriptions/checkout \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"plan_id":"cnpj-store-start"}'
# Esperado: { plan_id, init_point, mercado_pago_id, local_intent_id }

# 5. Abrir init_point no browser, autorizar com cartão TEST do MP
#    APRO 5031 4332 1540 6351 (aprova)

# 6. Webhook recebido → confirmar
psql "$DATABASE_URL" -c "
  SELECT user_id, plan_id, status, provider_preapproval_id, current_period_end
  FROM user_subscriptions
  WHERE user_id = 'u-test-cnpj'
  ORDER BY created_at DESC LIMIT 3;
"
# Esperado: status='active', provider_preapproval_id preenchido

# 7. Idempotência: replay do mesmo webhook payload
curl -X POST https://staging.carrosnacidade.com/api/payments/webhook \
  -H "x-signature: <captured>" -H "x-request-id: <captured>" \
  -d '<original payload>'
# Esperado: status='active' (sem mudança), nenhum INSERT duplicado

# 8. Cancelar via endpoint
curl -X POST https://staging.carrosnacidade.com/api/payments/subscriptions/cancel \
  -H "Authorization: Bearer $JWT" -d '{}'
# Esperado: { cancelled: true, status: 'cancelled', cancel_at_period_end: true }

# 9. Confirmar no banco
psql "$DATABASE_URL" -c "
  SELECT status, cancel_at_period_end, updated_at FROM user_subscriptions
  WHERE user_id='u-test-cnpj' ORDER BY created_at DESC LIMIT 1;
"
```

## Smoke pós-deploy em produção (após checklist)

```bash
# 1. Endpoint responde 401 sem JWT
curl -i -X POST https://carrosnacidade.com/api/payments/subscriptions/checkout \
  -d '{"plan_id":"cnpj-store-start"}'
# Esperado: 401

# 2. Endpoint responde 410 para Evento (se algum cliente legado tentar)
curl -i -X POST https://carrosnacidade.com/api/payments/subscriptions/checkout \
  -H "Authorization: Bearer $JWT_PROD" \
  -d '{"plan_id":"cnpj-evento-premium"}'
# Esperado: 410 + body com indisponivel

# 3. Endpoint responde 400 para plan_id desconhecido
curl -i -X POST https://carrosnacidade.com/api/payments/subscriptions/checkout \
  -H "Authorization: Bearer $JWT_PROD" \
  -d '{"plan_id":"x"}'
# Esperado: 400 + mensagem cita whitelist

# 4. Cancel responde 404 quando user não tem sub
curl -i -X POST https://carrosnacidade.com/api/payments/subscriptions/cancel \
  -H "Authorization: Bearer $JWT_USER_SEM_SUB" -d '{}'
# Esperado: 404

# 5. Webhook responde 200 ao GET (health)
curl -i https://carrosnacidade.com/api/payments/webhook
# Esperado: 200 { ok: true }
```

## Checklist antes de produção

Antes de ligar Start/Pro em produção:

- [ ] Migration 024 aplicada em staging + smoke tests passaram
- [ ] Migration 024 aplicada em produção (em janela de baixo tráfego)
- [ ] Migration 023 (alinhamento de planos R$ 79,90 / R$ 149,90) aplicada em produção
- [ ] `MP_ACCESS_TOKEN` PROD configurado no Render
- [ ] `MP_WEBHOOK_SECRET` PROD configurado no Render
- [ ] Webhook URL PROD cadastrado no painel MP
- [ ] Sandbox ponta-a-ponta validou: criar → autorizar → renovar → cancelar
- [ ] Idempotência testada via replay manual de webhook
- [ ] Comunicação aos lojistas com sub ativa do preço novo (ver runbook plans-launch-alignment.md §Política de assinaturas ativas)
- [ ] Frontend `/planos`: trocar CTAs Start/Pro de `/anunciar?plano=X` para chamar `/api/payments/subscriptions/checkout` (criar `SubscriptionCheckoutButton` analogamente ao `BoostCheckoutButton`)
- [ ] Página `/painel/assinaturas` para user gerenciar (cancelar, ver status)

## Rollback

Em ordem de menor para maior impacto:

1. **Pausar Start/Pro sem rollback de código**: `unset MP_ACCESS_TOKEN`. Endpoints continuam respondendo, mas caem em modo mock — não criam preapproval real no MP. Frontend recebe `init_point` mock e não redireciona pra MP real.

2. **Rollback da UI** (revert do PR que troca CTAs em `/planos`): Start/Pro voltam a apontar para `/anunciar?plano=X` (sem MP). Endpoints `/api/payments/subscriptions/*` continuam disponíveis para admin/sandbox.

3. **Rollback do código completo**: revert do commit Fase 3C remove rotas `/subscriptions/checkout` e `/subscriptions/cancel`. Endpoint legacy `/api/payments/subscription` (singular) continua funcionando — qualquer cliente já apontando para ele não quebra.

4. **Rollback da migration 024**: ver §Rollback na seção da migration. Coloca `user_subscriptions_status_check` de volta nos 4 estados originais (depois de garantir que nenhuma row está em `paused`/`payment_failed`).

## O que NÃO foi feito nesta fase

- `/planos` continua usando CTAs `/anunciar?plano=X` para Start/Pro (não MP). **Nenhum link público chama os endpoints novos.**
- Migration 024 NÃO foi aplicada (apenas criada no repo).
- Migration 023 (preços oficiais R$ 79,90 / R$ 149,90 no banco) continua pendente — mesmo runbook de antes.
- `SubscriptionCheckoutButton` no painel: pendente. Quando criado, vai espelhar `BoostCheckoutButton` mas chamar `/api/payments/subscriptions/checkout`.
- Página `/painel/assinaturas` para user gerenciar: pendente.
- Vídeo 360, créditos mensais, 15 fotos no Pro: continuam fora do escopo.

## Critérios de aceite (Fase 3C)

- ✅ Migration 024 idempotente, com defesas DO $$ pré e pós, sem DROP/DELETE
- ✅ Endpoint `/api/payments/subscriptions/checkout` rejeita Evento (410) + CPF Premium Highlight (410) + plano desconhecido (400)
- ✅ Endpoint cria preapproval com R$ 79,90 (Start) ou R$ 149,90 (Pro) lendo do banco/fallback
- ✅ Endpoint bloqueia duplicata (409) quando user tem sub `active/pending/paused`
- ✅ Endpoint `/api/payments/subscriptions/cancel` retorna 404 quando user não tem sub
- ✅ Cancel chama `cancelPreapproval` no MP, marca local `cancelled` + `cancel_at_period_end=true`
- ✅ `mapPreapprovalStatusToLocal` cobre todos os 6 estados locais alvo
- ✅ Subscription **não** toca `ads.highlight_until` (boost-7d intacto)
- ✅ Webhook de boost-7d (Fase 3B) continua funcionando (zero regressão)
- ✅ Testes unitários cobrem: whitelist, preço fixo, anti-spoof, duplicata, cancellation, mapping de status, isolamento de boost
