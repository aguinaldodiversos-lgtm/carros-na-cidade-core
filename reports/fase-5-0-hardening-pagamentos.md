# Fase 5.0 — Hardening/gate de segurança de pagamentos

> **Objetivo:** impedir ativação acidental de cobrança real no Mercado Pago e
> preparar o projeto para um smoke sandbox seguro. **Sem** nova arquitetura de
> pagamento, sem novas tabelas `payments`, sem novo webhook, sem novo checkout.
>
> **Status:** implementado, testado (suíte verde), pronto para deploy.
> Produção continua em **mock** até o checklist final ser executado.

---

## 1. Causa do risco (R1)

Antes da Fase 5.0, o **único interruptor** entre "mock" e "cobrança real" era a
presença de `MP_ACCESS_TOKEN`. Cada checkout fazia, no backend:

```js
if (!MP_ACCESS_TOKEN) { ...mock...; return }
// senão → chamada REAL ao Mercado Pago
```

Consequência: **definir `MP_ACCESS_TOKEN` (mesmo de teste, mesmo por engano)
ligava cobrança real do Destaque (boost-7d) sem nenhum segundo cadeado.** A
assinatura tinha um gate adicional (`SUBSCRIPTIONS_LIVE`), mas só na BFF do
frontend — e o destaque não tinha equivalente algum. Esse era o R1 (🔴 crítico)
da auditoria: ativação acidental de cobrança por um simples env.

---

## 2. Solução — gate unificado

Foi criado um **gate central** (`src/modules/payments/payments.gate.js`) por
onde passam todas as decisões "mock vs real". **Regra de ouro:
`MP_ACCESS_TOKEN` sozinho nunca habilita cobrança real.** É necessário, além do
token, um opt-in explícito:

| Condição                                                              | Modo efetivo | Cobra? |
| --------------------------------------------------------------------- | ------------ | ------ |
| Sem `MP_ACCESS_TOKEN`                                                  | `mock`       | Não    |
| Token presente, **sem** `PAYMENTS_LIVE`/sandbox                       | (bloqueado)  | **Não — `403 PAYMENTS_NOT_LIVE`** |
| Token + `MERCADO_PAGO_ENV=sandbox` + `PAYMENTS_SANDBOX_ENABLED=true`  | `sandbox`    | Sim (credencial de teste) |
| Token + `PAYMENTS_LIVE=true`                                           | `live`       | Sim (produção) |

Assinatura recorrente exige um cadeado **adicional e subordinado**:
`PAYMENTS_LIVE` (ou sandbox) **E** `SUBSCRIPTIONS_LIVE`.

---

## 3. Arquivos alterados

| Arquivo                                                  | Mudança                                                                                                  |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `src/modules/payments/payments.gate.js`                  | **NOVO.** Gate unificado: `resolvePaymentsMode`, `resolveCheckoutExecution`, `assertSubscriptionsRealAllowed`, `getPaymentsGateDiagnostics`, `logPaymentsGateStatus`. Lê `process.env` em call-time. |
| `src/modules/payments/payments.service.js`               | `createBoostCheckout`, `createPlanCheckout`, `createPlanSubscription` deixam de usar `if (!MP_ACCESS_TOKEN)` e passam pelo gate. Assinatura ganha `assertSubscriptionsRealAllowed` no caminho real. Removido import morto `listBoostOptions`. |
| `src/modules/admin/payments/admin-payments.service.js`   | Novo `getPaymentsHealth()` → expõe `getPaymentsGateDiagnostics()`.                                       |
| `src/modules/admin/admin.routes.js`                      | Nova rota `GET /api/admin/payments/health` (admin-only, herda `authMiddleware` + `requireAdmin`).        |
| `src/index.js`                                           | `logPaymentsGateStatus()` no boot — registra o modo no Render Logs (sem expor tokens).                   |
| `.env.example`                                           | Documenta `PAYMENTS_LIVE`, `MERCADO_PAGO_ENV`, `PAYMENTS_SANDBOX_ENABLED`, `SUBSCRIPTIONS_LIVE`.         |
| `tests/payments/payments-gate.test.js`                   | **NOVO.** 24 testes unitários do gate.                                                                   |
| `tests/payments/payments-live-gate-flow.test.js`         | **NOVO.** 6 testes de integração no service (bloqueio real + mock preservado).                           |
| `docs/runbooks/mercado-pago-boost-7d.md`                 | Atualizado: gate da Fase 5.0, sandbox flags, kill-switch `PAYMENTS_LIVE`, correção do "priority +8".     |
| `docs/admin-api-contracts.md`                            | Documenta `GET /api/admin/payments/health`.                                                              |

**Não tocados (intencionalmente):** webhook (`handleWebhookNotification`,
`verifyWebhookSignature`), `applyBoostApproval` (continua mexendo só em
`highlight_until`, nunca em `priority`), tabelas, BFF do frontend.

---

## 4. Comportamento antes/depois

| Cenário                                                          | Antes                          | Depois                                            |
| --------------------------------------------------------------- | ------------------------------ | ------------------------------------------------- |
| Sem token (dev/CI/prod atual)                                   | mock                           | mock (inalterado)                                 |
| **Token presente, sem `PAYMENTS_LIVE`** (boost-7d)              | **cobra REAL** 🔴              | **`403 PAYMENTS_NOT_LIVE`** (não cobra) ✅         |
| Token presente, sem `PAYMENTS_LIVE` (plano one-time)            | cobra REAL                     | `403 PAYMENTS_NOT_LIVE`                           |
| Token + `PAYMENTS_LIVE=true` (boost/plano)                      | cobra REAL                     | cobra REAL (intencional)                          |
| Token + `PAYMENTS_LIVE=true`, sem `SUBSCRIPTIONS_LIVE` (assin.) | cobrava REAL (backend)         | `403 SUBSCRIPTIONS_NOT_LIVE`                      |
| Token + sandbox flags                                           | cobrava REAL (prod)            | caminho real **sandbox** (credencial de teste)    |
| `applyBoostApproval` (aprovação)                                | `highlight_until` (sem priority) | inalterado — `highlight_until`, nunca `priority` |

---

## 5. Envs novas

```bash
# Liga cobrança real de produção. Apenas "true" (ou "1") ativa. Default off.
PAYMENTS_LIVE=false

# Sandbox seguro: caminho real contra credencial de TESTE, sem ligar produção.
# Exige AS DUAS variáveis + MP_ACCESS_TOKEN de sandbox.
MERCADO_PAGO_ENV=          # sandbox
PAYMENTS_SANDBOX_ENABLED=false

# Assinatura recorrente: cadeado ADICIONAL, subordinado a PAYMENTS_LIVE/sandbox.
SUBSCRIPTIONS_LIVE=
```

Semântica de "ligado": `"true"` ou `"1"`. Qualquer outro valor (incl. `"TRUE"`,
`"yes"`, vazio) = **desligado** (fail-closed). Sandbox exige `MERCADO_PAGO_ENV`
exatamente `sandbox` **e** `PAYMENTS_SANDBOX_ENABLED` ligado.

---

## 6. Testes

`npx vitest run tests/payments/` → **107 testes verdes** (8 arquivos), sendo:

- **24 novos** em `payments-gate.test.js` — modo mock/sandbox/live, precedência
  live > sandbox, sandbox exige as duas vars, fail-closed, bloqueio
  `PAYMENTS_NOT_LIVE`/`SUBSCRIPTIONS_NOT_LIVE`, diagnóstico **sem vazar token**,
  warnings corretos.
- **6 novos** em `payments-live-gate-flow.test.js` — boost e assinatura
  bloqueiam cobrança real sem o gate; mock continua funcionando sem token;
  sandbox libera o caminho real.
- **77 existentes** sem regressão (boost-7d, assinaturas, idempotência,
  `highlight_until` sem `priority`, webhook, anti-evento).

Cobertura dos testes obrigatórios do escopo:

- ✅ `MP_ACCESS_TOKEN` presente + `PAYMENTS_LIVE=false` → checkout real bloqueado
- ✅ boost-7d respeita `PAYMENTS_LIVE`
- ✅ assinatura respeita `PAYMENTS_LIVE` **e** `SUBSCRIPTIONS_LIVE`
- ✅ mock continua funcionando quando token ausente
- ✅ endpoint health não expõe tokens
- ✅ endpoint health mostra warnings corretos
- ✅ webhook continua não quebrado (suíte de webhook/idempotência verde)
- ✅ approved mock não duplica destaque (teste existente verde)
- ✅ destaque continua mexendo em `highlight_until`, não em `priority=9`

---

## 7. Smoke pós-deploy (produção, ainda em mock)

**A. Confirmar env sem token real:** no Render, `MP_ACCESS_TOKEN` ausente,
`PAYMENTS_LIVE` ausente/`false`.

**B. Render Shell — migration 024 aplicada (read-only):**

```bash
psql "$DATABASE_URL" -c "SELECT filename FROM schema_migrations WHERE filename LIKE '024%';"
# Esperado: 1 linha (024_user_subscriptions_phase3c.sql). Como 035/036 já estão
# em produção e migrations rodam em sequência, a 024 necessariamente foi aplicada.
```

**C. Health admin (logado como admin, console do navegador):**

```js
fetch("/api/admin/payments/health", { credentials: "include" })
  .then((r) => r.json())
  .then(console.log);
```

Esperado:

```json
{
  "ok": true,
  "data": {
    "mode": "mock",
    "payments_live_enabled": false,
    "checkout_real_enabled": false,
    "subscriptions_real_enabled": false,
    "mercado_pago_token_present": false,
    "webhook_secret_present": false,
    "warnings": []
  }
}
```

**D. Tentar checkout de destaque sem live:** o checkout responde mock
(`init_point` com `?mock=1`) — sem token — ou, se houver token sem
`PAYMENTS_LIVE`, responde `403 PAYMENTS_NOT_LIVE`. **Nunca** gera cobrança real
acidental.

**E. Boot log (Render Logs):** procurar `"[payments] gate iniciado em modo
'mock'"` para confirmar o modo de subida.

---

## 8. Como ativar sandbox com segurança

1. Garantir `MP_WEBHOOK_SECRET` definido (HMAC anti-spoof do webhook).
2. Definir, no ambiente de staging:
   ```bash
   MP_ACCESS_TOKEN=TEST-...            # credencial de TESTE do MP
   MERCADO_PAGO_ENV=sandbox
   PAYMENTS_SANDBOX_ENABLED=true
   # NÃO definir PAYMENTS_LIVE
   ```
3. `GET /api/admin/payments/health` deve mostrar `mode: "sandbox"`,
   `checkout_real_enabled: true`, e warning se faltar `MP_WEBHOOK_SECRET`.
4. Rodar o smoke ponta a ponta do runbook
   [mercado-pago-boost-7d.md](../docs/runbooks/mercado-pago-boost-7d.md)
   (criar checkout → pagar com cartão TEST → conferir webhook →
   `highlight_until` aplicado → replay não duplica).
5. Para assinatura em sandbox, adicionar `SUBSCRIPTIONS_LIVE=1`.

---

## 9. Checklist ANTES de ligar produção real (`PAYMENTS_LIVE=true`)

- [ ] Smoke sandbox do boost-7d passou ponta a ponta (checkout → webhook →
      `highlight_until` → replay idempotente).
- [ ] `MP_WEBHOOK_SECRET` definido em produção (boot já falha sem ele, mas
      confirmar). `webhook_secret_present: true` no health.
- [ ] `MP_ACCESS_TOKEN` de **produção** (`APP_USR-...`) configurado no secret
      manager — nunca commitado.
- [ ] `GET /api/admin/payments/health` revisado: sem warnings inesperados.
- [ ] Conciliação/reembolso (Fase 5.2) e job de inadimplência (Fase 5.3) ainda
      são **fora de escopo** — confirmar que não há expectativa de estorno
      automático antes de cobrar.
- [ ] Definir `PAYMENTS_LIVE=true` (e, para assinatura, `SUBSCRIPTIONS_LIVE=1`)
      apenas no momento do go-live, com monitoramento ativo.
- [ ] Validar primeiro pagamento real de baixo valor + conferir
      `payment_intents`/`payments` no admin.

---

## 10. Fora de escopo (confirmado não implementado)

Nova tabela `payments` · `payment_events` · novo webhook · reembolso/estorno ·
conciliação avançada · assinatura Start/Pro real em produção · checkout
transparente · split · nota fiscal. Esses itens seguem nas Fases 5.2/5.3 da
auditoria ([auditoria-pagamentos-mercado-pago.md](auditoria-pagamentos-mercado-pago.md)).
