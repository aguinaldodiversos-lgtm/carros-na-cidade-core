# Auditoria — Pagamentos / Mercado Pago

> **Data:** 2026-06-15 · **Commit base:** `main` @ `ac0a5b69`
> **Escopo:** Inventário de planos, assinaturas, billing, pagamentos e destaque ANTES de "implementar" Mercado Pago.
> **Modo:** somente leitura. Nenhum código, migration, rota ou tela foi alterado.

---

## A. Sumário executivo

⚠️ **Achado principal — a premissa "Mercado Pago ainda não foi cadastrado/integrado" está DESATUALIZADA.**

O Mercado Pago **já está integrado em código** (Fases 3B e 3C): há checkout real (preference para destaque, preapproval para assinatura), webhook com validação de assinatura HMAC, idempotência por constraints UNIQUE no banco, tabelas de pagamento completas, telas de checkout no painel do anunciante, páginas de sucesso/erro e painel admin de pagamentos/planos/destaques. **O que falta é ATIVAR**, não construir.

O sistema roda hoje em **modo MOCK** porque `MP_ACCESS_TOKEN` está ausente — nesse modo, todos os endpoints devolvem ids sintéticos e não cobram. **Basta definir `MP_ACCESS_TOKEN` (mesmo de teste) para o fluxo de destaque virar real.** As assinaturas têm um segundo cadeado (`SUBSCRIPTIONS_LIVE=1`); o **destaque (boost-7d) NÃO tem** — esse é o maior risco de ativação acidental.

**Conclusão de produto:** a próxima fase **NÃO deve criar tabelas/rotas/serviços de pagamento** — quase tudo existe. Deve focar em **hardening/gate, conciliação, política de reembolso e validação sandbox→prod**, reaproveitando o que está pronto.

### Estado em uma frase por área
- **Banco:** completo — `subscription_plans`, `user_subscriptions` (+ colunas MP da 024), `payments`, `payment_intents`, todos com idempotência. **Nada a criar.**
- **Backend:** integração MP real e gated por `MP_ACCESS_TOKEN`; webhook seguro (prod); guards de assinatura; boost só em anúncio `active`; auditoria. **Reaproveitar.**
- **Frontend:** `/planos` é estático (CTAs → `/anunciar`); painel do anunciante tem botões de destaque/assinatura que chamam rotas reais; páginas sucesso/erro existem; admin de pagamentos/planos/destaques existe.
- **Destaque:** usa `highlight_until` (camada comercial 4 do ranking), **nunca `ads.priority`** — o bug do `priority=9` está resolvido.

---

## B. O que já existe

| Camada | Existe | Evidência |
|---|---|---|
| Tabelas de planos/assinatura/pagamento | ✅ | migration 020/023/024/031 |
| Idempotência (UNIQUE em ids MP) | ✅ | `payments.mercado_pago_id`, `payment_intents.payment_resource_id`, `user_subscriptions.provider_preapproval_id` |
| Checkout destaque (one-time/preference) | ✅ | `createBoostCheckout` ([payments.service.js](src/modules/payments/payments.service.js)) |
| Checkout plano (preapproval/recorrente) | ✅ | `createPlanSubscription` + `createSubscriptionCheckout` ([subscriptions.service.js](src/modules/payments/subscriptions.service.js)) |
| Webhook + HMAC + idempotência | ✅ | `handleWebhookNotification`, `verifyWebhookSignature` |
| Liberar plano na aprovação | ✅ | `upsertUserSubscription` + update `users.plan_id` |
| Aplicar destaque na aprovação | ✅ | `applyBoostApproval` (mexe em `highlight_until`) |
| Cliente MP de assinatura (Fase 3C) | ✅ | [mercadopago-subscription.client.js](src/modules/payments/mercadopago-subscription.client.js) |
| Guards de assinatura (whitelist/dupla) | ✅ | [subscriptions.guards.js](src/modules/payments/subscriptions.guards.js) |
| Destaque manual admin (reason+auditoria) | ✅ | `grantManualBoost`/`setAdHighlight` ([admin-ads.service.js](src/modules/admin/ads/admin-ads.service.js)) |
| Telas de checkout (anunciante) | ✅ | `PublicationPlanSelector`, `BoostCheckoutButton`, `/impulsionar/[adId]` |
| Páginas sucesso/erro | ✅ | `/pagamento/sucesso` (polling), `/pagamento/erro` |
| Admin pagamentos/planos/destaques/regras | ✅ | `/admin/pagamentos`, `/admin/comercial` |
| Runbooks de go-live | ✅ | `docs/runbooks/mercado-pago-boost-7d.md`, `…subscriptions-start-pro.md` |
| Testes | ✅ | `tests/payments/*`, `tests/admin/admin-payments-summary.test.js` |
| SDK MP no frontend | ❌ (não precisa) | só usa `init_point` do backend |

---

## C. O que está ATIVO (em produção, hoje)

- **Em modo MOCK** (sem `MP_ACCESS_TOKEN`): todos os endpoints de checkout respondem `init_point` sintético (`?mock=1`) e o webhook trata como aprovado para testes. **Não há cobrança real.**
- **Rotas montadas e respondendo** (`app.use("/api/payments", …)`): `/create`, `/subscription`, `/subscriptions/checkout`, `/subscriptions/cancel`, `/boost-7d/checkout`, `/webhook`. Todas exigem login (`authMiddleware`).
- **Admin read-only ativo:** `/admin/pagamentos` lista `payment_intents` e mostra KPIs; `/admin/comercial` edita planos e regras comerciais (com reason+auditoria).
- **Destaque manual admin ATIVO e real** (não depende de MP): `PATCH /api/admin/ads/:id/highlight` aplica/estende/remove `highlight_until` com reason obrigatório.
- **Boot guard ATIVO:** em `NODE_ENV=production`, ausência de `MP_WEBHOOK_SECRET` **derruba o boot** ([payments.service.js:58-62](src/modules/payments/payments.service.js)).

---

## D. O que está MOCKADO / PARCIAL

- **Modo mock global:** gated por `isMercadoPagoMockMode() = !MP_ACCESS_TOKEN`. `createPlanCheckout`, `createPlanSubscription`, `createBoostCheckout`, `fetchPaymentStatus`, e o cliente de preapproval retornam payloads sintéticos quando o token falta.
- **Assinaturas Start/Pro (Fase 3C):** código completo, mas **propositalmente atrás de `SUBSCRIPTIONS_LIVE=1`** na BFF ([subscriptions/checkout/route.ts:25-28](frontend/app/api/payments/subscriptions/checkout/route.ts)) — devolve `503` em produção até o checklist sandbox↔prod. `/planos` **não** chama essas rotas (CTAs vão para `/anunciar?plano=X`).
- **Plano de Evento (`cnpj-evento-premium`):** dormente — bloqueado por `EVENTS_PAYMENTS_ENABLED` (410) e pela blacklist de assinatura.
- **Conciliação/reembolso:** **inexistentes** — não há log de eventos brutos do webhook nem fluxo de estorno (só cancelamento de assinatura).
- **Migration 024 — status a confirmar:** o runbook diz "NÃO aplicada", mas isso é texto **provavelmente desatualizado** (escrito na Fase 3C). Como `RUN_MIGRATIONS` default `true` e `runMigrations()` roda no boot ([src/index.js:100-102](src/index.js)) aplicando TODAS as migrations em sequência, e as migrations 035 (blog) e 036 (analytics) já estão em produção, a **024 necessariamente foi aplicada** (não dá para pular 024 e chegar na 035). **Confirmar** com o smoke (seção E.K).

---

## E. O que pode ser REAPROVEITADO (não duplicar)

**Tudo.** Especificamente:
- **Tabelas:** `payment_intents` já cobre `context IN ('plan','boost')` com idempotência (`payment_resource_id UNIQUE`). `payments` para o registro do pagamento (one-time/recurring). `user_subscriptions` com colunas MP (`provider`, `provider_preapproval_id UNIQUE`, períodos, `cancel_at_period_end`, `metadata`). **Não criar `payments`/`payment_events`/`subscriptions` novas.**
- **Serviços:** `createBoostCheckout`, `createSubscriptionCheckout`, `handleWebhookNotification`, `applyBoostApproval`, `upsertUserSubscription`, `mercadopago-subscription.client.js`, `subscriptions.guards.js`.
- **Destaque:** `applyBoostApproval` (pago) e `grantManualBoost`/`setAdHighlight` (admin) compartilham a mesma mecânica de `highlight_until`. O destaque **pago reaproveita** a função; não criar lógica nova de priority.
- **Frontend:** `PublicationPlanSelector`, `BoostCheckoutButton`, páginas de retorno, admin de pagamentos/planos/regras.
- **Config comercial:** `platform_settings` (`commercial.boost_*`) já parametriza preço/dias/duplicidade do destaque, editável no admin.

---

## F. O que NÃO deve ser duplicado
- ❌ Nova tabela `payments` → já existe (e `payment_intents`).
- ❌ Nova tabela de assinaturas → `user_subscriptions` já tem colunas MP (024).
- ❌ Novo webhook → `/api/payments/webhook` já existe com HMAC + idempotência.
- ❌ Nova lógica de destaque/priority → reaproveitar `highlight_until` (camada 4).
- ❌ Novo cliente MP → `mpRequest` + `mercadopago-subscription.client.js`.
- ❌ Novo painel admin de pagamentos → já existe (read-only); só falta conciliação.

---

## G. Tabelas atuais

| Tabela | Migration | Finalidade | Campos-chave | Idempotência | Status | Recomendação |
|---|---|---|---|---|---|---|
| `subscription_plans` | 020 (+023/031) | catálogo de planos | `id`(TEXT), `price`, `ad_limit`, `max_photos`, `priority_level`, `weight`, `video_360_enabled`, `monthly_highlight_credits`, `billing_model`(free/one_time/monthly), `is_active`, `public_visible` | — | **ativo** | reaproveitar |
| `user_subscriptions` | 020 (+024) | assinatura do usuário | `user_id`,`plan_id`(FK),`status`,`expires_at`,`provider`,`provider_preapproval_id`,`current_period_*`,`cancel_at_period_end`,`last_payment_id`,`metadata` | `provider_preapproval_id` UNIQUE | **ativo** (024) | reaproveitar |
| `payments` | 020 | registro de pagamento | `mercado_pago_id` UNIQUE, `status`(pending/approved/rejected/canceled), `amount`, `payment_type`(one_time/recurring) | `mercado_pago_id` UNIQUE | **ativo** | reaproveitar |
| `payment_intents` | 020 | intenção de checkout | `id`,`context`(plan/boost),`plan_id`,`ad_id`,`boost_option_id`,`checkout_resource_id`,`payment_resource_id` UNIQUE,`status`,`metadata` | `payment_resource_id` UNIQUE | **ativo** | reaproveitar (é o "ledger" do checkout) |
| `platform_settings` | 027 (+031 seed) | config comercial | `commercial.boost_default_price_cents`(3990), `…_days`(7), `…_duplicate_behavior`, `…_max_extension_days`, `allow_boost_cpf/cnpj`, `pro_ad_limit_guard` | — | **ativo** | reaproveitar |
| `admin_actions` | 014 | auditoria | `action`,`target_type`,`target_id`,`old/new_value`,`reason` | — | **ativo** | reaproveitar |
| `ads`.`highlight_until` / `priority` | 004 | destaque/ordenação | `highlight_until`(TIMESTAMPTZ), `priority`(INT default 1) | — | **ativo** | destaque usa `highlight_until`; **não** mexer em `priority` |

**Planos seedados (020 → ajustados 023/031):**
| id interno | nome | preço | billing | ad_limit | priority_level | ativo |
|---|---|---|---|---|---|---|
| `cpf-free-essential` | Grátis (CPF) | R$ 0 | free | 3 | 0 | ✅ |
| `cnpj-free-store` | Grátis Loja (CNPJ) | R$ 0 | free | 10 | 5 | ✅ |
| `cnpj-store-start` | Lojista Start | **R$ 79,90** | monthly | 20 | 60 | ✅ |
| `cnpj-store-pro` | Lojista Pro | **R$ 149,90** | monthly | 1000 | 80 | ✅ |
| `cpf-premium-highlight` | (destaque legado) | — | one_time | — | 50 | ❌ descontinuado (virou boost-7d em `platform_settings`) |
| `cnpj-evento-premium` | Evento | — | monthly | — | 100 | ❌ dormente (flag) |

> O **Destaque avulso R$ 39,90/7 dias** NÃO é um plano — é `boost-7d` parametrizado em `platform_settings` + `commercial-rules.service.js` (`BOOST_OPTIONS_FALLBACK`).

---

## H. Rotas atuais

**Backend (`/api/payments`, todas com `authMiddleware`):**
| Método | Rota | Handler | Observação |
|---|---|---|---|
| POST | `/create` | `createBoostCheckout`/`createPlanCheckout` | genérico (ad+boost_option OU plan_id) |
| POST | `/subscription` | `createPlanSubscription` | legado (qualquer plano monthly) |
| POST | `/subscriptions/checkout` | `createSubscriptionCheckout` | Fase 3C — whitelist Start/Pro |
| POST | `/subscriptions/cancel` | `cancelUserSubscription` | cancela preapproval |
| POST | `/boost-7d/checkout` | `createBoostCheckout` (fixa `boost-7d`) | preço do backend |
| POST/GET | `/webhook` | `handleWebhookNotification` | HMAC + idempotência |

**Admin (`/api/admin`, `requireAdmin`):** `GET /payments`, `GET /payments/summary`, `GET/POST/PATCH /plans`, `PATCH /plans/:id/status`, `GET /highlights`, `GET /highlights/summary`, `PATCH /ads/:id/highlight`, `GET/PATCH /commercial-settings`.

**Frontend BFF (`/api/payments/*`):** `create`, `subscription`, `subscriptions/checkout` (gated `SUBSCRIPTIONS_LIVE`), `boost-7d/checkout`, `webhook`. Encaminham só ids ao backend (preço/option fixados no servidor).

---

## I. Telas atuais

| Tela | Caminho | Tipo | Chama backend? |
|---|---|---|---|
| Planos (marketing) | `/planos` | estática | ❌ CTAs → `/anunciar` |
| Seletor de publicação | `PublicationPlanSelector` (`/painel/anuncios/[id]/upgrade`) | checkout real | ✅ boost-7d / subscriptions |
| Botão destaque 7d | `BoostCheckoutButton` | checkout real | ✅ `/api/payments/boost-7d/checkout` |
| Impulsionar | `/impulsionar/[adId]` | checkout real (ownership server-side) | ✅ |
| Sucesso | `/pagamento/sucesso` | polling `/api/dashboard/me` | ✅ |
| Erro | `/pagamento/erro` | estática | ❌ |
| Admin pagamentos | `/admin/pagamentos` | read-only | ✅ list+summary |
| Admin comercial | `/admin/comercial` | planos(editor)/destaques(view)/regras(editor) | ✅ |

**Sem risco de botão público sem backend:** `/planos` não inicia checkout; os botões reais exigem login e enviam só `ad_id`/`plan_id` (preço fixado no servidor). Não há SDK MP nem `NEXT_PUBLIC_MP_*` no frontend.

---

## J. Riscos (produção)

| # | Sev | Risco | Estado | Mitigação |
|---|---|---|---|---|
| R1 | 🔴 Crítico | **`MP_ACCESS_TOKEN` liga cobrança REAL do destaque sem segundo cadeado** — boost-7d é gated SÓ pelo token (assinatura tem `SUBSCRIPTIONS_LIVE`, boost não) | aberto | **Fase 5.0:** kill-switch unificado `PAYMENTS_LIVE` cobrindo boost; só ligar token após checklist |
| R2 | 🟠 Alto | Webhook spoofável **se `MP_WEBHOOK_SECRET` ausente** (`verifyWebhookSignature` retorna `true`) | mitigado em prod (boot guard) / **aberto em staging** | exigir secret também em staging; nunca expor `/webhook` sem secret |
| R3 | 🟡 Médio | **Sem log de eventos brutos do webhook** → conciliação MP×banco difícil | aberto | tabela `payment_events` (append-only) — única adição nova justificável |
| R4 | 🟡 Médio | **Sem fluxo de reembolso/estorno**; só cancelamento de assinatura | aberto | política + endpoint admin de estorno (Fase 5.2) |
| R5 | 🟡 Médio | **Migration 024 — confirmar aplicada** (assinatura quebra sem `provider_preapproval_id`) | provavelmente OK (auto-boot) | `SELECT … FROM schema_migrations` (E) |
| R6 | 🟢 Baixo | Pagamento recusado liberar benefício | coberto | webhook só aplica em `status='approved'` + ad `active` + `!alreadyApproved` |
| R7 | 🟢 Baixo | Webhook duplicado liberar 2× | coberto | `FOR UPDATE` + `alreadyApproved` + UNIQUE (`payment_resource_id`/`mercado_pago_id`) |
| R8 | 🟢 Resolvido | Prioridade errada (`priority=9`) | resolvido | destaque mexe só em `highlight_until` (camada 4); `priority` intocado (Fase 3.3) |
| R9 | 🟢 Baixo | Inadimplência de plano mensal | parcial | webhook mapeia `payment_failed`/`paused`; falta job de degradação automática |

---

## K. Arquitetura recomendada (sem duplicação)

**A. Destaque avulso (one-time / Checkout Pro):** já implementado. `createBoostCheckout` → `payment_intents(context='boost', payment_resource_id UNIQUE)` → MP preference (`X-Idempotency-Key=intentId`) → webhook (HMAC + `FOR UPDATE` + `!alreadyApproved`) → `applyBoostApproval` estende `highlight_until` (sem priority). **Ação:** validar sandbox + adicionar gate (R1).

**B. Plano mensal (preapproval/recorrente):** já implementado (Fase 3C). `createSubscriptionCheckout` (whitelist Start/Pro, `assertNoLiveSubscriptionFor`) → `mercadopago-subscription.client.createPreapproval` → `user_subscriptions(provider_preapproval_id UNIQUE)` → webhook mapeia status (`mapPreapprovalStatusToLocal`) → `users.plan_id`. Cancelamento via `/subscriptions/cancel`. **Ação:** confirmar 024, validar sandbox, ligar `SUBSCRIPTIONS_LIVE` só após checklist.

**C. Admin pagamentos:** reaproveitar `/admin/pagamentos` (read-only). **Adicionar** conciliação (comparar `payment_intents`/`payments` com o MP) e, se necessário, a tabela `payment_events` (R3). **Não** criar painel novo.

---

## Decisão sobre tabelas (resposta direta ao §8)
- **Criar `payments` nova?** ❌ Não — existe e tem `mercado_pago_id UNIQUE`.
- **Criar `payment_events` nova?** ⚠️ **Opcional/recomendado** — não existe log bruto de webhook; é a única tabela nova que se justifica (append-only, sem FK forte, para conciliação/auditoria).
- **`user_subscriptions` suporta MP?** ✅ Sim (migration 024: provider/preapproval/períodos/metadata).
- **`subscription_plans` suporta preços comerciais?** ✅ Sim (price/billing_model/limites/priority_level/weight) e é editável no admin.
- **Migration de compatibilidade?** Só se a 024 NÃO estiver aplicada (improvável — ver R5). Caso contrário, nenhuma.
- **Renomear algo?** Não.
- **Evitar FK forte p/ histórico?** ✅ Já evitado — `payment_intents.ad_id` é TEXT sem FK; uma futura `payment_events` deve seguir o mesmo princípio.

---

## L. Plano de implementação em fases

**Fase 5.0 — Hardening / gate de pagamentos** *(antes de qualquer token)*
- Kill-switch unificado **`PAYMENTS_LIVE`** cobrindo **boost-7d** (hoje sem cadeado próprio) + assinaturas. Default desligado.
- Confirmar migration 024 aplicada (R5); exigir `MP_WEBHOOK_SECRET` em staging (R2).
- (Opcional) tabela `payment_events` para conciliação (R3).
- Credenciais sandbox + URL do webhook registrada no painel MP.

**Fase 5.1 — Destaque pago via Checkout Pro (Sandbox)**
- Ligar `MP_ACCESS_TOKEN` (TEST) + `PAYMENTS_LIVE` em staging; testar boost-7d ponta a ponta (checkout → webhook → `highlight_until`); validar idempotência (webhook duplicado) e anúncio não-`active` (sem liberar).

**Fase 5.2 — Webhook + conciliação + admin pagamentos**
- Log de eventos + tela de conciliação no `/admin/pagamentos`; política e endpoint de **reembolso/estorno**; alertas de divergência.

**Fase 5.3 — Assinaturas Mercado Pago (Start/Pro)**
- Validar preapproval em sandbox; ligar `SUBSCRIPTIONS_LIVE=1`; expor CTAs Start/Pro em `/planos`; job de inadimplência (`payment_failed`→degradar plano).

---

## Próxima etapa proposta
Começar pela **Fase 5.0 (hardening/gate)** — especificamente o **`PAYMENTS_LIVE` cobrindo o boost-7d** (corrige o R1, o único risco crítico) e a confirmação da migration 024. Só depois Fase 5.1 (boost em sandbox). **Não** ligar `MP_ACCESS_TOKEN` em produção até a 5.0 fechar.

---

### Apêndice — comandos de verificação (read-only, Render Shell)
```bash
# R5 — migration 024 aplicada?
psql "$DATABASE_URL" -c "SELECT filename FROM schema_migrations WHERE filename LIKE '024%';"
psql "$DATABASE_URL" -c "\d user_subscriptions" | grep -E "provider_preapproval_id|provider|current_period"

# Estado de ativação (deve estar VAZIO para 'mock/não cobra'):
node -e "console.log('MP_ACCESS_TOKEN set?', !!process.env.MP_ACCESS_TOKEN, '| WEBHOOK_SECRET?', !!process.env.MP_WEBHOOK_SECRET, '| SUBSCRIPTIONS_LIVE?', process.env.SUBSCRIPTIONS_LIVE)"

# Há pagamentos/assinaturas reais? (esperado 0 em mock)
psql "$DATABASE_URL" -c "SELECT status, COUNT(*) FROM payment_intents GROUP BY status;"
psql "$DATABASE_URL" -c "SELECT status, COUNT(*) FROM user_subscriptions GROUP BY status;"
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM payments;"
```
