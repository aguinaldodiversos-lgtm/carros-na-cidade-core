/**
 * Guards de assinatura recorrente — extraídos para arquivo NEUTRO
 * (sem dependência de payments.service.js) para permitir uso tanto
 * pela camada nova (subscriptions.service.js) quanto pelo
 * createPlanSubscription legado em payments.service.js, sem criar
 * import cycle.
 *
 * **Defesa em profundidade**: estes guards rodam em TODAS as entradas
 * que criam preapproval Mercado Pago. Mesmo que uma rota futura
 * esqueça de aplicar, o service base já barra.
 */

import { AppError } from "../../shared/middlewares/error.middleware.js";
import { query } from "../../infrastructure/database/db.js";

/**
 * Único conjunto de planos comerciais permitidos no fluxo de
 * assinatura recorrente da Fase 3C. Hardcoded (whitelist) para evitar
 * que admin cadastre um plano novo no banco e ele escape acidentalmente
 * para esse fluxo sem revisão de produto.
 */
export const ALLOWED_SUBSCRIPTION_PLAN_IDS = Object.freeze([
  "cnpj-store-start",
  "cnpj-store-pro",
]);

/**
 * Planos explicitamente REJEITADOS mesmo que retornem como
 * is_active=true no banco ou flag de Evento ligue inadvertidamente.
 *
 *   - cnpj-evento-premium: produto Evento dormente
 *   - cpf-premium-highlight: descontinuado, substituído por boost-7d
 */
const REJECTED_PLAN_IDS = Object.freeze([
  "cnpj-evento-premium",
  "cpf-premium-highlight",
]);

/**
 * Estados locais que contam como "assinatura ainda viva". Bloqueiam
 * criar uma nova nesse momento (evita cobrar 2x por engano).
 *
 * `paused` também conta: lojista deve REATIVAR a existente em vez
 * de criar uma nova.
 *
 * Inclui 'canceled' (com 1 'l', legado da migration 020) e 'cancelled'
 * (canônico Fase 3C, com 2 'l') NÃO — sub cancelada libera nova compra.
 */
const LIVE_SUBSCRIPTION_STATUSES = Object.freeze(["active", "pending", "paused"]);

/**
 * Whitelist + blacklist explícita.
 *
 *   - planId em REJECTED_PLAN_IDS    → 410 (anti-revival)
 *   - planId NÃO em ALLOWED_*        → 400 (mensagem cita whitelist)
 *
 * Roda ANTES de qualquer chamada à API do MP. Não toca banco.
 */
export function assertSubscriptionPlanAllowed(planId) {
  const id = String(planId || "").trim();
  if (REJECTED_PLAN_IDS.includes(id)) {
    throw new AppError(
      `Plano ${id} indisponivel para assinatura recorrente.`,
      410
    );
  }
  if (!ALLOWED_SUBSCRIPTION_PLAN_IDS.includes(id)) {
    throw new AppError(
      `plan_id deve ser um dos: ${ALLOWED_SUBSCRIPTION_PLAN_IDS.join(", ")}.`,
      400
    );
  }
}

/**
 * Procura uma assinatura "viva" (status active/pending/paused) do user.
 * Retorna a row mais recente ou null. Não filtra por provider — qualquer
 * sub local viva bloqueia.
 */
export async function findLiveSubscriptionForUser(userId) {
  const result = await query(
    `
    SELECT
      user_id,
      plan_id,
      status,
      expires_at,
      payment_id,
      created_at
    FROM user_subscriptions
    WHERE user_id = $1
      AND status = ANY($2::text[])
    ORDER BY created_at DESC
    LIMIT 1
    `,
    [userId, LIVE_SUBSCRIPTION_STATUSES]
  );
  return result.rows[0] || null;
}

/**
 * Bloqueio de duplicata: 409 quando user já tem sub viva. Lança
 * `AppError.statusCode=409` com mensagem detalhada (plano + status)
 * para o frontend orientar o user.
 */
export async function assertNoLiveSubscriptionFor(userId) {
  const live = await findLiveSubscriptionForUser(userId);
  if (live) {
    throw new AppError(
      `Usuario ja possui assinatura ativa (plano: ${live.plan_id}, status: ${live.status}).`,
      409
    );
  }
}
