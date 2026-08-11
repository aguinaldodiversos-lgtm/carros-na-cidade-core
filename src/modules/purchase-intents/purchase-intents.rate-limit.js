// Limite por USUÁRIO na publicação de procura.
//
// Por que só o POST tem limitador: publicar é a única rota desta fase com efeito
// multiplicador. Cada procura publicada dispara um fan-out que escreve uma
// notificação para CADA lojista CNPJ da cidade — um laço de publicação numa
// capital viraria milhares de linhas em `user_notifications` e um sino
// inutilizável para gente real, sem nenhum bug envolvido.
//
// A chave é o id do usuário autenticado, não o IP: o caminho normal do painel
// passa pelo BFF, então limitar por IP limitaria o container do Render inteiro.
// Por isso também NÃO usamos o `skip` de chamada interna que os limitadores
// públicos usam — é justamente a chamada via BFF que precisa ser contada.
//
// Mesma forma de `support.rate-limit.js`, que existe pelo mesmo motivo.

import rateLimit from "express-rate-limit";

import { clientRateLimitKey } from "../../shared/middlewares/rateLimit.middleware.js";

export const purchaseIntentCreateRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.RATE_LIMIT_PURCHASE_INTENT_CREATE_MAX || 5),
  standardHeaders: true,
  legacyHeaders: false,
  // O fallback para o IP cobre o caso em que o limitador é montado antes do
  // `authMiddleware` por engano — sem ele a chave viraria `undefined` e todo
  // mundo compartilharia o mesmo balde.
  keyGenerator: (req) => `purchase-intent-create:${req.user?.id || clientRateLimitKey(req)}`,
  handler(_req, res) {
    res.set("Cache-Control", "no-store");
    return res.status(429).json({
      success: false,
      error: true,
      message: "Muitas procuras publicadas em sequência. Aguarde um minuto e tente novamente.",
    });
  },
});
