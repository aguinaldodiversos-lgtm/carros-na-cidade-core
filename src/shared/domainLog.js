/**
 * Campos padronizados para logs de domínio (Pino): action, result, requestId, userId.
 * Omitir requestId/userId quando não existirem evita ruído e custo de indexação.
 *
 * @param {object} fields
 * @param {string} fields.action — ex.: `auth.login`, `payments.checkout.create`
 * @param {'success'|'error'} fields.result
 * @param {string} [fields.requestId]
 * @param {string|number} [fields.userId]
 */
export function buildDomainFields({ action, result, requestId, userId, ...extra }) {
  const o = {
    domain: "app",
    action,
    result,
    ...extra,
  };

  if (requestId != null && String(requestId).trim() !== "") {
    o.requestId = String(requestId).trim();
  }
  if (userId != null && userId !== "") {
    o.userId = String(userId);
  }

  return o;
}
