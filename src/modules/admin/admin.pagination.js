/**
 * Política ÚNICA de paginação para os endpoints administrativos de listagem.
 *
 * Antes da Admin U1, cada rota chamava `parseIntParam(req.query.limit, 50)`,
 * que aceita qualquer inteiro >= 0. Isso deixava passar dois pedidos que nenhum
 * caller legítimo faz:
 *
 *   ?limit=0        → `LIMIT 0` devolve lista vazia com HTTP 200. A tela mostra
 *                     "Nenhum registro" e o operador conclui que o banco está
 *                     vazio. Falha silenciosa, que é o modo de falha mais caro
 *                     deste projeto.
 *   ?limit=999999   → o Postgres tenta materializar tudo. Numa tabela de contas
 *                     que só cresce, é o caminho mais curto para derrubar o
 *                     admin a partir de uma URL digitada à mão.
 *
 * Clamp em vez de erro 400 de propósito: paginação é parâmetro de conveniência,
 * não de correção. Um `?limit=500` devolve 100 registros úteis — recusar seria
 * transformar um exagero inofensivo em tela quebrada. O que NÃO é aceitável é
 * devolver 0 ou 999999.
 */

export const ADMIN_PAGE_LIMIT_MIN = 1;
export const ADMIN_PAGE_LIMIT_MAX = 100;
export const ADMIN_PAGE_LIMIT_DEFAULT = 30;

/**
 * @param {unknown} value — `req.query.limit` cru
 * @param {number} [fallback] — default quando ausente/ilegível
 * @returns {number} inteiro em [ADMIN_PAGE_LIMIT_MIN, ADMIN_PAGE_LIMIT_MAX]
 */
export function parseAdminLimit(value, fallback = ADMIN_PAGE_LIMIT_DEFAULT) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed < ADMIN_PAGE_LIMIT_MIN) return ADMIN_PAGE_LIMIT_MIN;
  if (parsed > ADMIN_PAGE_LIMIT_MAX) return ADMIN_PAGE_LIMIT_MAX;
  return parsed;
}

/**
 * Offset negativo vira 0 (o Postgres recusaria `OFFSET -1` com erro de sintaxe
 * em runtime, e um 500 por causa de querystring é ruído no log de produção).
 *
 * @param {unknown} value — `req.query.offset` cru
 * @returns {number} inteiro >= 0
 */
export function parseAdminOffset(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
}
