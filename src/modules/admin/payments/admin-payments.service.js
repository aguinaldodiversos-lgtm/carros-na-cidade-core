import * as repo from "./admin-payments.repository.js";

export async function listPayments(filters) {
  return repo.listPaymentIntents(filters);
}

/**
 * Returns a financial summary for the given period.
 *
 * KNOWN LIMITATIONS:
 * - No reconciliation with Mercado Pago (amounts are from local payment_intents).
 * - No split between gross/net (no fees data available yet).
 * - No refund tracking (not implemented).
 * - Monthly breakdown not yet implemented (would require GROUP BY month).
 */
export async function getPaymentsSummary(options) {
  return repo.getPaymentsSummary(options);
}
