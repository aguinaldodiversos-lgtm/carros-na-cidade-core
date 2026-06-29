import { handleWebhookNotification } from "./payments.service.js";

/**
 * Controller compartilhado do webhook Mercado Pago.
 *
 * Montado em dois caminhos (ver src/app.js e payments.routes.js):
 *   - POST /webhook/mercadopago    (canônico — URL cadastrada no painel do MP)
 *   - POST /api/payments/webhook   (alias legado — preserva preferences antigas)
 *
 * `req.rawBody` é capturado globalmente por express.json({ verify }) em
 * app.js, necessário para a verificação HMAC da assinatura. O `data.id` vem
 * da query string (?data.id=...) — é exatamente o valor que entra no
 * manifesto da assinatura do Mercado Pago (fallback para o corpo).
 */
export async function mercadoPagoWebhookController(req, res, next) {
  try {
    const payload = await handleWebhookNotification({
      rawBody: req.rawBody || JSON.stringify(req.body || {}),
      signature: req.headers["x-signature"] || null,
      requestId: req.headers["x-request-id"] || null,
      dataId: req.query?.["data.id"] || req.query?.id || req.body?.data?.id || null,
      traceRequestId: req.requestId,
    });
    res.json(payload);
  } catch (err) {
    next(err);
  }
}
