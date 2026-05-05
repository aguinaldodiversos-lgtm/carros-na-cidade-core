# Shutdown do produto Evento (Feirão / Banner Regional / Impulsionamento Geolocalizado)

> **Decisão de produto (2026-05-04):** o produto Evento Premium fica
> **DORMENTE** até o portal ter volume real de visitantes, anunciantes
> recorrentes e operação comercial madura.
>
> **Status:** desligado por feature flags em todas as camadas. **Código
> preservado**, dados preservados, migrations preservadas. Reativação
> exige flags + revisão deste runbook.
>
> **NÃO confundir com Boost de anúncio (Destaque pago):** o `Plano
> Destaque Premium`, o `Boost 7d/30d`, a página `/impulsionar/[adId]` e
> os componentes `BoostCheckout`/`BoostModal` continuam **funcionando
> normalmente**. Eles são parte do produto principal, não do produto
> Evento.

---

## 1. Por que desligar

Auditoria do banco em produção (2026-05-04) revelou:

- Único registro em `events`: `id=?`, `title='FeirÆo de Seminovos'`,
  `status='paid'`, `payment_status='paid'`, `price=499`, `city_id=1`
  (cidade quebrada, ver
  [cities-sao-paulo-duplicate-cleanup.md](./cities-sao-paulo-duplicate-cleanup.md)).
- O evento foi teste operacional de geração de imagem com IA, **não
  venda real**. Ainda assim os scripts de auditoria classificam como
  sensível por causa do `status='paid'`.
- O produto não tem demanda comercial confirmada; os 7 workers que o
  suportam consumiriam crédito OpenAI (DALL-E) em produção.
- O plano `cnpj-evento-premium` (R$ 999,90/mês) está exposto em
  `/planos` mas não é vendido — só ocupa espaço e gera ruído no
  funil de conversão.

A decisão é **desligar por flags, sem deletar nada**. Reativação fica
disponível quando o portal ganhar tração.

---

## 2. Superfície de Eventos — mapa completo

| Camada | Arquivo | Função | Estado pós-PR |
|---|---|---|---|
| **Backend / data** | `cities`, `events` (out-of-band, sem migration), `subscription_plans` | Tabelas | **mantidas intactas**; `events` row de teste preservada para auditoria. |
| **Backend / plano** | [src/modules/account/account.service.js](../../src/modules/account/account.service.js) `DEFAULT_PLANS[5]` | Plano `cnpj-evento-premium` hardcoded | **mantido**, mas FILTRADO por `listPlans` quando `EVENTS_PUBLIC_ENABLED!="true"`. |
| **Backend / plano** | [src/database/migrations/020_subscription_plans_and_billing.sql](../../src/database/migrations/020_subscription_plans_and_billing.sql) | Seed SQL do plano evento | **mantida**; cleanup do row em `subscription_plans` (se quiser remover do banco) é runbook próprio. |
| **Backend / payments** | [src/modules/payments/payments.service.js](../../src/modules/payments/payments.service.js) `createPlanCheckout`, `createPlanSubscription` | Mercado Pago checkout | **bloqueado para `cnpj-evento-premium`** se `EVENTS_PAYMENTS_ENABLED!="true"` — retorna 410 Gone. |
| **Backend / rotas** | [src/events/bannerApproval.routes.js](../../src/events/bannerApproval.routes.js) | POST /:eventId/approve, /:eventId/reject | **órfão**; middleware retorna 410 Gone se montado e `EVENTS_CREATION_ENABLED!="true"`. |
| **Backend / rotas** | [src/modules/ads/events.routes.js](../../src/modules/ads/events.routes.js) e `ads.events.routes.js` | POST /api/events e /api/ads/event | **NÃO bloqueada** — registra impressão/clique de anúncio (ad_events), nada a ver com produto Evento. Permanece como está. |
| **Backend / workers** | [src/workers/event_scheduler.worker.js](../../src/workers/event_scheduler.worker.js) | Ativa/finaliza eventos por janela | **órfão**; `startEventSchedulerWorker` aborta se flag false. |
| **Backend / workers** | [src/workers/event_broadcast.worker.js](../../src/workers/event_broadcast.worker.js) | Marca eventos como broadcast_sent | **órfão**; guard idem. |
| **Backend / workers** | [src/workers/event_dispatch.worker.js](../../src/workers/event_dispatch.worker.js) | Dispara WhatsApp/Email/Social | **órfão**; guard idem. |
| **Backend / workers** | [src/workers/event_fail_safe.worker.js](../../src/workers/event_fail_safe.worker.js) | Detecta eventos vencidos paid e alerta admin | **órfão**; guard idem. |
| **Backend / workers** | [src/workers/event_banner.worker.js](../../src/workers/event_banner.worker.js) | Gera banner via DALL-E | **órfão**; guard de worker + guard de IA em `generateBanner`. |
| **Backend / workers** | [src/workers/banner_generator.worker.js](../../src/workers/banner_generator.worker.js) | DALL-E `generateBanner` (versão 2) | **órfão**; guard de IA em `generateBanner`. |
| **Backend / workers** | [src/workers/banner_auto_approve.worker.js](../../src/workers/banner_auto_approve.worker.js) | Auto-aprova banners pending por 48h | **órfão**; guard idem. |
| **Backend / config** | [src/shared/config/features.js](../../src/shared/config/features.js) | Feature flags | **6 flags novas**: `eventsEnabled`, `eventsPublicEnabled`, `eventsCreationEnabled`, `eventsPaymentsEnabled`, `eventsWorkerEnabled`, `eventsAiBannerEnabled` (todas `envBoolStrict` — somente `"true"` libera). |
| **Backend / guard** | [src/workers/_events_guard.cjs](../../src/workers/_events_guard.cjs) | Helper kill-switch CommonJS | **novo**; usado pelos 7 workers. |
| **Frontend / planos** | [frontend/lib/plans/plan-store.ts](../../frontend/lib/plans/plan-store.ts) linhas 159-178 | Plano `cnpj-evento-premium` em fallback local | **não tocado**; backend `/api/plans` filtra antes do frontend receber. Card `PlanCard` simplesmente não renderiza porque o plano não chega no array. **Zero alteração de layout/components.** |
| **Frontend / boost** | `frontend/app/impulsionar/[adId]/page.tsx`, `BoostCheckout`, `BoostModal` | **PRODUTO PRINCIPAL** — destaque pago de anúncio | **NÃO tocado**, NÃO bloqueado. |
| **Frontend / página regional** | `frontend/lib/env/feature-flags.ts` `REGIONAL_PAGE_ENABLED` | Flag pré-existente (default false) | **não tocada**; rota `/regiao/[slug]` continua off como já estava. |
| **SEO** | `seo_cluster_plans` cluster_types | `city_home`, `city_below_fipe`, `city_opportunities`, `city_brand`, `city_brand_model` | **nenhum cluster_type de evento existe**. Sitemap não tem nem nunca teve URL de evento. |
| **SEO** | `frontend/lib/seo/sitemap-static.ts` | Sitemap estático | **nenhuma entry de evento**. Confirmado por grep. |
| **Documentação** | `.env.example` | Referência de flags | **6 flags EVENTS_\* documentadas, todas comentadas (default off)**. |

---

## 3. Flags introduzidas

Todas em `src/shared/config/features.js`. Usam `envBoolStrict` — apenas
`"true"` (lowercase exato) ativa. `"TRUE"`, `"1"`, `"yes"`, `"on"`,
vazio ou ausência = `false`. Default fechado.

| Flag (env var) | Propriedade JS | Domínio que controla |
|---|---|---|
| `EVENTS_ENABLED` | `features.eventsEnabled` | **Master kill-switch.** Se `false`, todas as outras EVENTS_* são efetivamente off (gate AND). |
| `EVENTS_PUBLIC_ENABLED` | `features.eventsPublicEnabled` | Plano `cnpj-evento-premium` em `/planos`, exposição pública. |
| `EVENTS_CREATION_ENABLED` | `features.eventsCreationEnabled` | Rotas POST de aprovação/rejeição/criação de evento. |
| `EVENTS_PAYMENTS_ENABLED` | `features.eventsPaymentsEnabled` | Checkout/subscription Mercado Pago para plano de evento. |
| `EVENTS_WORKER_ENABLED` | `features.eventsWorkerEnabled` | 7 workers `event_*` / `banner_*`. |
| `EVENTS_AI_BANNER_ENABLED` | `features.eventsAiBannerEnabled` | Chamadas a DALL-E (custo OpenAI). |

Helper de composição: `isEventsDomainEnabled("public" | "creation" |
"payments" | "worker" | "ai_banner")` retorna `true` apenas se master
E o domínio específico estiverem em `"true"`.

---

## 4. O que continua funcionando (para evitar pânico)

- ✅ **Anúncios** (CRUD, listagem, busca, sitemap por cidade).
- ✅ **Planos Grátis / Start / Pro / Destaque Premium** — listados em `/planos`.
- ✅ **Boost de anúncio** (`/impulsionar/[adId]`, `BoostCheckout`,
   `BoostModal`, `Boost 7d/30d`) — pagamento Mercado Pago intacto.
- ✅ **Sitemap piloto** (`/carros-em/atibaia-sp` etc.) — não toca eventos.
- ✅ **Workers de cidade/anúncio/SEO** (cluster-planner, sitemap, etc).
- ✅ **Login, dashboard, admin** — nenhum CTA público de evento existia
   (confirmado por mapeamento), nada a esconder.
- ✅ **Rotas `/api/events` e `/api/ads/event`** — apesar do nome,
   registram impressão/clique de **anúncio** (ad_events), não evento
   do produto Evento.

## 5. O que está bloqueado (com flag false)

- ❌ Plano `cnpj-evento-premium` na resposta de `/api/plans` (filtrado
  no backend).
- ❌ `createPlanCheckout({ planId: "cnpj-evento-premium" })` — retorna
  `AppError("Plano de Evento esta indisponivel...", 410)`.
- ❌ `createPlanSubscription({ planId: "cnpj-evento-premium" })` — idem.
- ❌ Rotas `POST /<eventId>/approve` e `/<eventId>/reject` (em
  `bannerApproval.routes.js`) — middleware retorna 410 Gone antes do
  pool.query.
- ❌ `startEventSchedulerWorker`, `startEventBroadcastWorker`,
  `startEventDispatchWorker`, `startEventFailSafeWorker`,
  `startEventBannerWorker`, `startBannerAutoApproveWorker` — todos
  abortam early com log INFO.
- ❌ `generateBanner(event)` em `event_banner.worker.js` e
  `banner_generator.worker.js` — retorna `null` antes de `openai.images.generate`.

Em todos os casos: log claro identifica a tentativa, **nada toca o
banco/OpenAI**.

## 6. Read-only que continua disponível

Como nada foi deletado, queries SQL read-only contra `events`,
`subscription_plans` (com `id='cnpj-evento-premium'`), e os workers
órfãos continuam funcionando para auditoria. Use:

```sql
-- Estado atual da row de teste:
SELECT id, title, status, payment_status, price, city_id
FROM events;

-- Plano Evento Premium no banco:
SELECT id, name, price, is_active, billing_model
FROM subscription_plans
WHERE id = 'cnpj-evento-premium';

-- Confirmar que /planos não expõe (após deploy):
curl https://www.carrosnacidade.com/api/plans?type=CNPJ
-- Esperado: array sem cnpj-evento-premium.
```

---

## 7. Tratamento do dado de teste (FeirÆo / id=1)

**NÃO foi alterado neste PR.** O evento teste continua no banco como:

```
events.id        = ?
events.city_id   = 1  (linha quebrada, ver cities-sao-paulo-duplicate-cleanup.md)
events.title     = 'FeirÆo de Seminovos'
events.status    = 'paid'
events.price     = 499
```

Cleanup desse row deve seguir o runbook próprio
[`cities-sao-paulo-duplicate-cleanup.md`](./cities-sao-paulo-duplicate-cleanup.md).
Lá há checklist completo + scripts (`audit-sao-paulo-duplicate.mjs` e
`cleanup-sao-paulo-duplicate.mjs`). Os scripts continuam abortando
qualquer cleanup automático enquanto este event paid existir — por
design.

---

## 8. Como reativar Eventos no futuro (checklist)

> Não fazer nada disto sem decisão de produto + alinhamento comercial.
> Reativar em produção sem volume real **vai expor lojistas a um
> produto vazio** e a um banner gerado por IA que pode falhar.

1. ✅ Confirmar que o portal tem volume real de visitantes/sessões
   (definir baseline).
2. ✅ Confirmar que existe demanda comercial — pelo menos N lojistas
   pagantes querendo o produto.
3. ✅ Cleanup do row de teste em `events` (`cities-sao-paulo-duplicate-cleanup.md`).
4. ✅ Auditoria de `region_memberships` — Eventos depende de
   "abrangência regional" para banner geolocalizado, e hoje há linhas
   de seed apontando para cidade quebrada.
5. ✅ Validar pricing — R$ 999,90/mês foi seed de teste; preço real
   precisa ser definido pela área comercial.
6. ✅ Validar conteúdo gerado por IA — DALL-E não é determinístico;
   precisa de revisão humana ou template antes de ir pra produção.
7. ✅ Definir o orquestrador de workers — hoje os 7 workers são
   órfãos. Quem os inicia? Render Cron? Worker dyno? `RUN_WORKERS`?
8. ✅ Atualizar copy comercial em `/planos` e `/anunciar` —
   mensagem honesta sobre o que o produto entrega.
9. ✅ Setar **na ordem**:
   - `EVENTS_ENABLED=true`
   - `EVENTS_PUBLIC_ENABLED=true`
   - `EVENTS_CREATION_ENABLED=true`
   - `EVENTS_PAYMENTS_ENABLED=true`
   - `EVENTS_WORKER_ENABLED=true`
   - `EVENTS_AI_BANNER_ENABLED=true`
   Idealmente em ondas — ativar `PUBLIC` primeiro (apenas listar plano)
   sem ativar `PAYMENTS`/`CREATION` para validar interesse, depois
   habilitar checkout, depois workers.
10. ✅ Smoke test em staging antes de produção.
11. ✅ Atualizar este runbook com data e responsável da reativação.

---

## 9. Riscos se alguém ativar indevidamente

- ⚠️ **`EVENTS_AI_BANNER_ENABLED=true` sem revisão humana** — DALL-E
  gera imagens não-determinísticas. Banner pode sair com texto em
  alemão, cores fora da identidade, ou conteúdo sensível. **Custo
  OpenAI** pode escalar (gpt-image-1 não é barato).
- ⚠️ **`EVENTS_WORKER_ENABLED=true` sem orquestrador** — os 7 workers
  hoje são órfãos. Se alguém ligar a flag E adicionar um orquestrador
  no boot, podem rodar simultaneamente em loop, gerando milhares de
  inserts/updates em `events` e tentativas de DALL-E.
- ⚠️ **`EVENTS_PAYMENTS_ENABLED=true` sem cleanup do row de teste** —
  o checkout do plano evento começa a aceitar dinheiro real, mas o row
  `id=?` (paid R$ 499 fake) ainda confunde scripts de auditoria.
- ⚠️ **`EVENTS_PUBLIC_ENABLED=true` sem demanda real** — usuário vê
  produto premium R$ 999,90 sem entrega clara. Pode prejudicar
  conversão dos planos Pro/Start.

---

## 10. Relação com planos comerciais (NÃO afeta)

| Plano | Status pós-shutdown | Onde |
|---|---|---|
| Plano Gratuito (CPF) | ✅ ativo | `cpf-free-essential` |
| Plano Destaque Premium (CPF, one_time R$79,90) | ✅ ativo | `cpf-premium-highlight` |
| Plano Gratuito Loja (CNPJ) | ✅ ativo | `cnpj-free-store` |
| Plano Loja Start (CNPJ, R$299,90/mês) | ✅ ativo | `cnpj-store-start` |
| Plano Loja Pro (CNPJ, R$599,90/mês) | ✅ ativo | `cnpj-store-pro` |
| **Plano Evento Premium (CNPJ, R$999,90/mês)** | ❌ **OCULTO** (filtrado de `/api/plans`) | `cnpj-evento-premium` |
| Boost 7d (R$39,90 avulso) | ✅ ativo | `boost-7d` |
| Boost 30d (R$129,90 avulso) | ✅ ativo | `boost-30d` |

---

## 11. Próximos passos recomendados

1. **Deploy no Render** — flags ausentes do ambiente significa default
   `false`, comportamento esperado: produto Evento OFF.
2. **Smoke test em produção:**
   ```bash
   curl https://www.carrosnacidade.com/api/plans?type=CNPJ | jq '.data[].id'
   # Esperado: NÃO contém "cnpj-evento-premium".
   ```
3. **Não definir** nenhuma `EVENTS_*=true` em produção até alinhamento
   comercial.
4. **Cleanup do row de teste** (`events.id=?`, `FeirÆo de Seminovos`)
   em PR/runbook próprio (cities-sao-paulo-duplicate-cleanup.md).
5. **Quando reativar:** seguir §8 deste runbook.

---

## 12. Travas absolutas mantidas neste PR

- ✅ Não deletadas tabelas, migrations, dados.
- ✅ Não executados UPDATE/INSERT/DELETE.
- ✅ Não rodados scripts com `--yes`.
- ✅ Não alterados layout, frontend (components/), styles, Home,
   catálogo, header/footer.
- ✅ Não alterados sitemap em código, canonical, robots, rotas
   públicas, ranking, planos principais.
- ✅ Não criada Página Regional, não rodado bootstrap de cluster plans.
- ✅ Não alteradas RUN_WORKERS, env do Render, `frontend/lib/env/feature-flags.ts`.
- ✅ Boot do backend continua íntegro (módulo de features adicionado;
   imports em payments.service.js e account.service.js compatíveis;
   workers órfãos não afetam boot).
- ✅ Build do frontend não tocado.
