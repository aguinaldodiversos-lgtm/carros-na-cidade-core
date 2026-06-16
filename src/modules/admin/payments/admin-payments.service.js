import * as repo from "./admin-payments.repository.js";
import { getPaymentsGateDiagnostics } from "../../payments/payments.gate.js";

/**
 * Diagnóstico seguro do gate de pagamentos (Fase 5.0).
 *
 * Expõe o estado do kill-switch unificado para o admin verificar, sem
 * deploy, em que modo o ambiente está (mock | sandbox | live) e se há
 * misconfiguração. NUNCA retorna o valor de token/segredo — apenas
 * presença booleana. Ver src/modules/payments/payments.gate.js.
 */
export function getPaymentsHealth() {
  return getPaymentsGateDiagnostics();
}

/**
 * Lists payment_intents (both plan and boost contexts).
 *
 * This is the LOCAL payment intent log — it tracks every checkout attempt
 * and its final status as reported by the Mercado Pago webhook.
 *
 * WHAT IT REPRESENTS:
 * - Each row is a checkout attempt initiated by a user.
 * - `status=approved` means the Mercado Pago webhook confirmed payment.
 * - `amount` is the price at checkout time (not necessarily collected net).
 *
 * WHAT IT DOES NOT REPRESENT:
 * - Actual bank settlement (no Mercado Pago reconciliation).
 * - Net revenue after fees (MP fees are not tracked).
 * - Refunds (not implemented — no refund flow exists).
 */
export async function listPayments(filters) {
  return repo.listPaymentIntents(filters);
}

/**
 * Returns a financial summary for the given period.
 *
 * KNOWN LIMITATIONS (documented for frontend consumers):
 * - `total_approved_amount` = SUM of approved payment_intents.amount.
 *   This is GROSS checkout value, NOT net after MP fees.
 * - No reconciliation with Mercado Pago API.
 * - No refund tracking (no refund flow exists).
 * - No monthly breakdown (single-period aggregate only).
 * - `plan_approved_amount` + `boost_approved_amount` = `total_approved_amount`.
 * - In mock mode (no MP_ACCESS_TOKEN), amounts are real but payments are simulated.
 */
export async function getPaymentsSummary(options) {
  return repo.getPaymentsSummary(options);
}
