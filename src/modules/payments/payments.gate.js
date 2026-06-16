/**
 * Gate unificado de pagamentos reais — Fase 5.0 (hardening).
 *
 * PROBLEMA QUE RESOLVE (Risco R1 da auditoria):
 *   Antes desta fase, o ÚNICO interruptor entre "mock" e "cobrança real"
 *   era a presença de `MP_ACCESS_TOKEN`. Bastava definir o token (mesmo
 *   por engano, mesmo de teste) para o fluxo de Destaque (boost-7d) virar
 *   real. Assinatura tinha um segundo cadeado (`SUBSCRIPTIONS_LIVE`), mas
 *   o destaque NÃO — qualquer deploy com token ligava cobrança sem revisão.
 *
 * O QUE MUDA:
 *   A decisão "mock vs real" deixa de ser `!MP_ACCESS_TOKEN` e passa a ser
 *   centralizada aqui. Token presente é NECESSÁRIO mas NÃO SUFICIENTE.
 *   Para cobrar de verdade é preciso, ALÉM do token, um opt-in explícito:
 *
 *     - PAYMENTS_LIVE=true            → modo "live"     (produção real)
 *     - MERCADO_PAGO_ENV=sandbox +    → modo "sandbox"  (credencial de teste
 *       PAYMENTS_SANDBOX_ENABLED=true                     do MP, sem produção)
 *
 *   Sem nenhum desses, o sistema fica em "mock" — e se houver um token
 *   presente sem o opt-in (o cenário perigoso), o checkout real é
 *   BLOQUEADO com erro claro em vez de cobrar silenciosamente.
 *
 * REGRA DE OURO:
 *   `MP_ACCESS_TOKEN` SOZINHO nunca habilita cobrança real.
 *
 * Todas as funções leem `process.env` em tempo de chamada (não no import)
 * para serem testáveis sem reimportar o módulo.
 */

import { AppError } from "../../shared/middlewares/error.middleware.js";
import { logger } from "../../shared/logger.js";
import { buildDomainFields } from "../../shared/domainLog.js";

/**
 * Flag ligada? Aceita `"true"` (canônico, exigido pela Fase 5.0) ou `"1"`
 * (convenção legada de `SUBSCRIPTIONS_LIVE`). Qualquer outro valor —
 * incluindo `"TRUE"`, `"yes"`, vazio, undefined — mantém DESLIGADO.
 * Postura "fail closed": na dúvida, não cobra.
 */
function isFlagOn(key) {
  const v = process.env[key];
  return v === "true" || v === "1";
}

function nonEmpty(value) {
  return Boolean(value && String(value).trim());
}

/** MP_ACCESS_TOKEN presente (sem expor o valor). */
export function isMercadoPagoTokenPresent() {
  return nonEmpty(process.env.MP_ACCESS_TOKEN);
}

/** MP_WEBHOOK_SECRET presente (sem expor o valor). */
export function isWebhookSecretPresent() {
  return nonEmpty(process.env.MP_WEBHOOK_SECRET);
}

/** Intenção do operador de ligar cobrança real de produção. */
export function isPaymentsLiveFlagOn() {
  return isFlagOn("PAYMENTS_LIVE");
}

/**
 * Sandbox autorizado? Exige AS DUAS variáveis: `MERCADO_PAGO_ENV=sandbox`
 * e `PAYMENTS_SANDBOX_ENABLED=true`. Uma sozinha não basta — evita que
 * `MERCADO_PAGO_ENV=sandbox` deixado por engano ligue chamadas reais.
 */
export function isPaymentsSandboxFlagOn() {
  return process.env.MERCADO_PAGO_ENV === "sandbox" && isFlagOn("PAYMENTS_SANDBOX_ENABLED");
}

/** Intenção do operador de ligar assinatura recorrente real. */
export function isSubscriptionsLiveFlagOn() {
  return isFlagOn("SUBSCRIPTIONS_LIVE");
}

/**
 * Modo de pagamento EFETIVO: 'mock' | 'sandbox' | 'live'.
 *
 *   - 'live'    → PAYMENTS_LIVE on + token presente
 *   - 'sandbox' → sandbox on + token presente
 *   - 'mock'    → qualquer outro caso (inclui "token presente mas gate
 *                 desligado"; nesse caso o checkout real é bloqueado,
 *                 ver resolveCheckoutExecution)
 *
 * LIVE tem precedência sobre sandbox quando ambos estão ligados.
 */
export function resolvePaymentsMode() {
  const tokenPresent = isMercadoPagoTokenPresent();
  if (isPaymentsLiveFlagOn() && tokenPresent) return "live";
  if (isPaymentsSandboxFlagOn() && tokenPresent) return "sandbox";
  return "mock";
}

/** Cobrança real (live OU sandbox) está efetivamente habilitada? */
export function isRealChargeEnabled() {
  return resolvePaymentsMode() !== "mock";
}

/**
 * Decide COMO um checkout de cobrança deve executar e aplica o gate.
 *
 * Retorna `{ mode }` quando o caller deve prosseguir:
 *   - mode 'mock'    → caller produz payload sintético (NÃO cobra)
 *   - mode 'live'    → caller chama o Mercado Pago real (produção)
 *   - mode 'sandbox' → caller chama o Mercado Pago real (sandbox)
 *
 * LANÇA AppError quando uma cobrança real é TENTADA mas está desabilitada:
 *   - 403: token presente mas nem live nem sandbox ligados → bloqueio R1.
 *          "Pagamentos reais estão desativados neste ambiente."
 *   - 500: live/sandbox ligado mas token ausente → misconfiguração
 *          (não dá para cobrar sem credencial).
 *
 * @param {object} ctx — usado apenas para log seguro (sem dados sensíveis).
 * @param {string} ctx.productType — 'boost' | 'plan' | 'subscription'
 * @param {string} [ctx.userId]
 * @param {string} [ctx.adId]
 * @param {string} [ctx.planId]
 * @param {string} [ctx.requestId]
 */
export function resolveCheckoutExecution(ctx = {}) {
  const { productType, userId, adId, planId, requestId } = ctx;
  const tokenPresent = isMercadoPagoTokenPresent();
  const mode = resolvePaymentsMode();

  if (mode === "live" || mode === "sandbox") {
    // Caminho real habilitado. resolvePaymentsMode() só retorna live/sandbox
    // quando o token está presente, então a credencial existe.
    return { mode };
  }

  // mode === 'mock'
  if (tokenPresent) {
    // Token presente mas o gate (PAYMENTS_LIVE / sandbox) está DESLIGADO.
    // Esse é exatamente o cenário de ativação acidental (R1): recusamos
    // alto e claro em vez de cobrar — e em vez de mockar silenciosamente
    // um token que parece de produção.
    logger.warn(
      {
        ...buildDomainFields({
          action: "payments.gate.block",
          result: "error",
          requestId,
          userId,
        }),
        productType: productType || null,
        adId: adId || null,
        planId: planId || null,
        reason: "payments_not_live",
        tokenPresent: true,
        paymentsLive: isPaymentsLiveFlagOn(),
        sandbox: isPaymentsSandboxFlagOn(),
      },
      "[payments] checkout real BLOQUEADO: token presente mas PAYMENTS_LIVE/sandbox desligado"
    );
    throw new AppError("Pagamentos reais estão desativados neste ambiente.", 403, true, {
      code: "PAYMENTS_NOT_LIVE",
    });
  }

  // Sem token → mock puro (dev / CI / produção atual antes da ativação).
  return { mode: "mock" };
}

/**
 * Gate ADICIONAL e subordinado para assinatura recorrente real.
 *
 * Política da Fase 5.0:
 *   - PAYMENTS_LIVE (ou sandbox) precisa estar ON para QUALQUER cobrança;
 *   - SUBSCRIPTIONS_LIVE precisa estar ON ADICIONALMENTE para assinatura.
 *
 * Só se aplica ao caminho REAL: em modo mock (sem token) a assinatura
 * continua mockando normalmente (dev/CI), sem exigir SUBSCRIPTIONS_LIVE.
 *
 * Chamar DEPOIS de resolveCheckoutExecution, passando o `mode` retornado.
 */
export function assertSubscriptionsRealAllowed({ mode, userId, planId, requestId } = {}) {
  if (mode === "mock") return; // mock não cobra — segue sem exigir o flag
  if (isSubscriptionsLiveFlagOn()) return; // real + flag ligado → ok

  logger.warn(
    {
      ...buildDomainFields({
        action: "payments.gate.block",
        result: "error",
        requestId,
        userId,
      }),
      productType: "subscription",
      planId: planId || null,
      reason: "subscriptions_not_live",
      mode,
    },
    "[payments] assinatura real BLOQUEADA: SUBSCRIPTIONS_LIVE desligado"
  );
  throw new AppError("Assinaturas recorrentes reais estão desativadas neste ambiente.", 403, true, {
    code: "SUBSCRIPTIONS_NOT_LIVE",
  });
}

/**
 * Diagnóstico seguro do gate para o endpoint admin de saúde.
 * NUNCA inclui o valor de nenhum token/segredo — apenas presença booleana.
 *
 * Distingue INTENÇÃO (flags ligados) de EFEITO (cobrança realmente possível):
 *   - payments_live_enabled / subscriptions_live_enabled = flags (intenção)
 *   - checkout_real_enabled / subscriptions_real_enabled  = efetivo
 */
export function getPaymentsGateDiagnostics() {
  const mode = resolvePaymentsMode();
  const tokenPresent = isMercadoPagoTokenPresent();
  const webhookSecretPresent = isWebhookSecretPresent();
  const paymentsLiveFlag = isPaymentsLiveFlagOn();
  const sandboxFlag = isPaymentsSandboxFlagOn();
  const subscriptionsLiveFlag = isSubscriptionsLiveFlagOn();
  const checkoutRealEnabled = mode !== "mock";
  const subscriptionsRealEnabled = checkoutRealEnabled && subscriptionsLiveFlag;

  const warnings = [];

  if (paymentsLiveFlag && !tokenPresent) {
    warnings.push(
      "PAYMENTS_LIVE=true mas MP_ACCESS_TOKEN ausente: checkouts reais falharão (sem credencial)."
    );
  }
  if (!checkoutRealEnabled && tokenPresent) {
    warnings.push(
      "MP_ACCESS_TOKEN presente mas PAYMENTS_LIVE/sandbox desligado: checkouts reais serão BLOQUEADOS (não cobram, não mockam)."
    );
  }
  if (checkoutRealEnabled && !webhookSecretPresent) {
    warnings.push(
      "Cobrança real habilitada sem MP_WEBHOOK_SECRET: webhook fica spoofável — defina o segredo antes de operar."
    );
  }
  if (paymentsLiveFlag && sandboxFlag) {
    warnings.push("PAYMENTS_LIVE e sandbox ligados ao mesmo tempo: 'live' tem precedência.");
  }
  if (mode === "live" && process.env.NODE_ENV !== "production") {
    warnings.push(
      `mode=live fora de NODE_ENV=production (atual: ${process.env.NODE_ENV || "undefined"}).`
    );
  }
  if (subscriptionsLiveFlag && !checkoutRealEnabled) {
    warnings.push(
      "SUBSCRIPTIONS_LIVE ligado mas PAYMENTS_LIVE/sandbox desligado: assinatura real continua OFF (subordinada a PAYMENTS_LIVE)."
    );
  }

  return {
    mode,
    payments_live_enabled: paymentsLiveFlag,
    subscriptions_live_enabled: subscriptionsLiveFlag,
    mercado_pago_token_present: tokenPresent,
    webhook_secret_present: webhookSecretPresent,
    checkout_real_enabled: checkoutRealEnabled,
    subscriptions_real_enabled: subscriptionsRealEnabled,
    sandbox_enabled: sandboxFlag,
    warnings,
  };
}

/**
 * Log seguro do estado do gate no boot. Útil para auditar, no Render Logs,
 * em que modo o serviço subiu — sem nunca imprimir token/segredo.
 */
export function logPaymentsGateStatus() {
  const diag = getPaymentsGateDiagnostics();
  logger.info(
    {
      domain: "payments.gate",
      action: "boot",
      mode: diag.mode,
      paymentsLive: diag.payments_live_enabled,
      subscriptionsLive: diag.subscriptions_live_enabled,
      tokenPresent: diag.mercado_pago_token_present,
      webhookSecretPresent: diag.webhook_secret_present,
      checkoutRealEnabled: diag.checkout_real_enabled,
      warningsCount: diag.warnings.length,
    },
    `[payments] gate iniciado em modo '${diag.mode}'`
  );
  for (const warning of diag.warnings) {
    logger.warn({ domain: "payments.gate", action: "boot" }, `[payments] ${warning}`);
  }
}
