/**
 * Permissões comerciais do hub de oportunidades.
 *
 * Durante o lançamento: acesso liberado para qualquer conta CNPJ admitida
 * pela guarda requireDealerAccount (sem consulta de assinatura).
 *
 * Após decisão comercial: habilitar EXATAMENTE
 * OPPORTUNITIES_PAID_GATE_ENABLED=true no backend, somente após homologar
 * as telas bloqueadas, cancelamentos, concessões e métricas do resumo.
 *
 * Nunca confiar em users.plan_id sozinho: uma assinatura vencida pode deixar
 * essa coluna desatualizada. Direitos pagos vêm de assinatura vigente e
 * pagamento ou de cortesia explícita registrada pelo administrador.
 */
import { query } from "../../infrastructure/database/db.js";
import { AppError } from "./error.middleware.js";

export const OPPORTUNITY_FEATURE = Object.freeze({
  BUYERS: "buyers",
  VEHICLE_EVALUATION: "vehicle_evaluation",
});

export function isPaidOpportunityGateEnabled() {
  return process.env.OPPORTUNITIES_PAID_GATE_ENABLED === "true";
}

export function opportunityRightsForPlan(planId) {
  return {
    buyers: planId === "cnpj-store-pro",
    vehicle_evaluation: planId === "cnpj-store-pro" || planId === "cnpj-store-start",
  };
}

export async function getDealerOpportunityRights(userId) {
  if (!isPaidOpportunityGateEnabled()) {
    return { mode: "launch", buyers: true, vehicle_evaluation: true };
  }

  const id = String(userId || "").trim();
  if (!id) throw new AppError("Sessão inválida.", 401);

  const { rows } = await query(
    `
    SELECT us.plan_id
    FROM user_subscriptions us
    WHERE us.user_id = $1
      AND us.plan_id IN ('cnpj-store-start', 'cnpj-store-pro')
      AND (
        (
          us.source = 'admin_grant'
          AND us.status = 'active'
          AND us.expires_at IS NOT NULL
          AND us.expires_at > NOW()
          AND (us.starts_at IS NULL OR us.starts_at <= NOW())
        )
        OR
        (
          COALESCE(us.source, '') <> 'admin_grant'
          AND (
            us.status = 'active'
            OR (
              us.status IN ('canceled', 'cancelled')
              AND COALESCE(us.cancel_at_period_end, false)
            )
          )
          AND (us.payment_id IS NOT NULL OR us.last_payment_id IS NOT NULL)
          AND COALESCE(us.current_period_end, us.expires_at) > NOW()
        )
      )
    ORDER BY CASE WHEN us.plan_id = 'cnpj-store-pro' THEN 0 ELSE 1 END,
             us.created_at DESC
    LIMIT 1
    `,
    [id]
  );

  const rights = opportunityRightsForPlan(rows[0]?.plan_id);
  return { mode: "paid", ...rights };
}

export function requireDealerOpportunity(feature) {
  if (!Object.values(OPPORTUNITY_FEATURE).includes(feature)) {
    throw new TypeError("Direito de oportunidade desconhecido.");
  }

  return async (req, res, next) => {
    try {
      if (!req.user?.id) {
        throw new AppError("Autenticação necessária.", 401);
      }
      const rights = await getDealerOpportunityRights(req.user.id);
      if (!rights[feature]) {
        res.set("Cache-Control", "private, no-store");
        throw new AppError("Funcionalidade indisponível no seu plano.", 403, true, {
          code: "OPPORTUNITY_PLAN_REQUIRED",
          required_plan:
            feature === OPPORTUNITY_FEATURE.BUYERS ? "cnpj-store-pro" : "cnpj-store-start",
        });
      }
      req.dealerOpportunityRights = rights;
      next();
    } catch (error) {
      next(error);
    }
  };
}
