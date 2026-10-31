import { query } from "../../infrastructure/database/db.js";

/**
 * Conferência de retorno do checkout somente por referência do próprio
 * usuário autenticado. Não usa status da query string do Mercado Pago como
 * prova de aprovação; somente payment_intents atualizado por webhook.
 *
 * Endpoint estritamente READ-ONLY: não altera pagamentos ou anúncios.
 */
export async function getMyPaymentReturnStatus({ userId, reference }) {
  const cleanReference = String(reference || "").trim();

  // O Checkout Pro retorna external_reference ou payment_id na back_url.
  if (!/^[a-zA-Z0-9_-]{8,128}$/.test(cleanReference)) {
    return null;
  }

  const result = await query(
    `
    SELECT
      pi.context,
      pi.status,
      pi.plan_id,
      pi.boost_option_id,
      (a.id IS NOT NULL
        AND a.status = 'active'
        AND a.highlight_until IS NOT NULL
        AND a.highlight_until > NOW()) AS boost_active
    FROM payment_intents pi
    LEFT JOIN ads a
      ON a.id::text = pi.ad_id::text
    WHERE (pi.id = $1 OR pi.payment_resource_id = $1 OR pi.checkout_resource_id = $1)
      AND pi.user_id = $2
      AND pi.context IN ('boost', 'plan')
    LIMIT 1
    `,
    [cleanReference, String(userId)]
  );

  const intent = result.rows[0];
  if (!intent) return null;

  return {
    context: intent.context,
    status: intent.status,
    boost_active:
      intent.context === "boost" && intent.status === "approved"
        ? Boolean(intent.boost_active)
        : false,
    plan_id: intent.context === "plan" ? intent.plan_id : null,
    product: intent.context === "boost" ? "Destaque de 7 dias" : "Plano contratado",
  };
}
