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
export const ALLOWED_SUBSCRIPTION_PLAN_IDS = Object.freeze(["cnpj-store-start", "cnpj-store-pro"]);

/**
 * Planos explicitamente REJEITADOS mesmo que retornem como
 * is_active=true no banco ou flag de Evento ligue inadvertidamente.
 *
 *   - cnpj-evento-premium: produto Evento dormente
 *   - cpf-premium-highlight: descontinuado, substituído por boost-7d
 */
const REJECTED_PLAN_IDS = Object.freeze(["cnpj-evento-premium", "cpf-premium-highlight"]);

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
 * Origem de uma concessão MANUAL de plano (cortesia/teste do admin). Espelha
 * `GRANT_SOURCE` em src/modules/admin/advertisers/advertiser-plan-grant.constants.js
 * — definida localmente para não acoplar o módulo de pagamentos ao de admin.
 *
 * Cortesia (admin_grant) NÃO conta como assinatura paga: o lojista de cortesia
 * pode fazer upgrade para o plano pago sem bater no bloqueio de duplicata.
 */
const ADMIN_GRANT_SOURCE = "admin_grant";

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
    throw new AppError(`Plano ${id} indisponivel para assinatura recorrente.`, 410);
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
 * Procura uma assinatura PAGA "viva" (active/pending/paused) do user — exclui
 * concessão de cortesia (source='admin_grant'). "Paga" = source != admin_grant
 * E (payment_id OU provider não-nulo). Mesmo critério de
 * admin-advertisers.repository.findLivePaidSubscription.
 *
 * Usada SÓ pelo bloqueio de duplicata: uma cortesia (admin_grant) não impede o
 * lojista de assinar o plano pago (upgrade cortesia → pago).
 */
export async function findLivePaidSubscriptionForUser(userId) {
  const result = await query(
    `
    SELECT
      user_id,
      plan_id,
      status,
      source,
      payment_id,
      provider,
      created_at
    FROM user_subscriptions
    WHERE user_id = $1
      AND COALESCE(source, '') <> $2
      AND (payment_id IS NOT NULL OR provider IS NOT NULL)
      AND status = ANY($3::text[])
      AND (expires_at IS NULL OR expires_at > NOW())
    ORDER BY created_at DESC
    LIMIT 1
    `,
    [userId, ADMIN_GRANT_SOURCE, LIVE_SUBSCRIPTION_STATUSES]
  );
  return result.rows[0] || null;
}

/**
 * Bloqueio de duplicata: 409 quando user já tem assinatura PAGA viva. Uma
 * concessão de cortesia (admin_grant) NÃO bloqueia — o lojista de cortesia
 * pode fazer upgrade para o plano pago.
 *
 * APOSENTADORIA DA CORTESIA (Fase 2): quando a assinatura paga ATIVAR (via
 * webhook subscription_preapproval/authorized_payment), a ativação deve
 * cancelar o admin_grant ainda ativo do usuário — paga substitui cortesia.
 * Isso é responsabilidade da Fase 2 (ativação), NÃO deste guard. Motivo: se as
 * duas convivessem ativas, o sweep de expiração da cortesia
 * (expireDueGrantsForUser → revertEffectivePlanInTx) poderia, ao vencer o
 * prazo da cortesia, REBAIXAR um cliente que está pagando. Ver
 * src/modules/admin/advertisers/admin-advertisers.repository.js (createGrant já
 * faz essa substituição entre concessões manuais — a Fase 2 fará o equivalente
 * de pago sobre cortesia).
 */
export async function assertNoLiveSubscriptionFor(userId) {
  const live = await findLivePaidSubscriptionForUser(userId);
  if (live) {
    throw new AppError(
      `Usuario ja possui assinatura paga ativa (plano: ${live.plan_id}, status: ${live.status}).`,
      409
    );
  }
}
