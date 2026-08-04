/**
 * Controller da sugestão de descrição (Fase 4.5).
 *
 * Fino de propósito: autorização está no `authMiddleware` da rota, limite nos
 * limiters, regra no service. `Cache-Control: no-store` porque a resposta é
 * conteúdo gerado para um usuário específico.
 */

import { generateDescriptionSuggestion } from "./ad-description.service.js";

export async function suggest(req, res, next) {
  try {
    const result = await generateDescriptionSuggestion(req.user, req.body || {}, {
      requestId: req.requestId || null,
    });

    res.set("Cache-Control", "no-store");
    return res.json({
      success: true,
      suggestion: result.text,
      meta: result.meta,
    });
  } catch (err) {
    // Express 4 não captura rejeição de async — o `next` é obrigatório para o
    // errorHandler transformar em resposta (mesmo padrão de ads.controller.js).
    return next(err);
  }
}
