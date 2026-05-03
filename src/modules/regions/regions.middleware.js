/**
 * Auth do endpoint /api/internal/regions/*.
 *
 * Política deliberada: SEMPRE responder 404 quando o token está ausente,
 * vazio em prod, ou diferente do esperado — nunca 401/403. Isso evita
 * que um atacante descubra que /api/internal/regions/:slug existe via
 * resposta diferenciada (enumeração de superfície de ataque).
 *
 * Em dev/test, se INTERNAL_API_TOKEN não estiver configurado, o endpoint
 * fica indisponível (404). Para usá-lo localmente, exporte a variável.
 */
export function requireInternalToken(req, res, next) {
  const expected = String(process.env.INTERNAL_API_TOKEN || "").trim();

  if (!expected) {
    return res.status(404).json({ ok: false, error: "Not Found" });
  }

  const provided = String(req.header("x-internal-token") || "").trim();

  if (!provided || provided !== expected) {
    return res.status(404).json({ ok: false, error: "Not Found" });
  }

  return next();
}
