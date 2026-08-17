// Limites por USUÁRIO nas rotas de escrita das solicitações de venda.
//
// Duas rotas têm custo assimétrico e por isso têm limitador próprio:
//
//   - PUBLICAR: abre transação e trava a linha do usuário. Um laço de publicação
//     não fura o teto de 3 (o lock garante isso), mas fica pedindo lock em
//     sequência, e o custo é pago em conexões de banco.
//
//   - UPLOAD: cada requisição carrega até 12 arquivos de 10 MB para a MEMÓRIA do
//     processo, roda sharp em cada um e escreve no R2. É, de longe, a rota mais
//     cara do produto — e a única cujo abuso custa dinheiro de storage.
//
// A chave é o id do usuário autenticado, não o IP: o caminho normal do painel
// passa pelo BFF, então limitar por IP limitaria o container do Render inteiro.
// Mesma forma de `purchase-intents.rate-limit.js` e `support.rate-limit.js`.

import rateLimit from "express-rate-limit";

import { clientRateLimitKey } from "../../shared/middlewares/rateLimit.middleware.js";

function jsonLimitHandler(message) {
  return function handler(_req, res) {
    res.set("Cache-Control", "no-store");
    return res.status(429).json({ success: false, error: true, message });
  };
}

export const saleRequestCreateRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.RATE_LIMIT_SALE_REQUEST_CREATE_MAX || 5),
  standardHeaders: true,
  legacyHeaders: false,
  // O fallback para o IP cobre o caso em que o limitador é montado antes do
  // `authMiddleware` por engano — sem ele a chave viraria `undefined` e todo
  // mundo compartilharia o mesmo balde.
  keyGenerator: (req) => `sale-request-create:${req.user?.id || clientRateLimitKey(req)}`,
  handler: jsonLimitHandler(
    "Muitas solicitações publicadas em sequência. Aguarde um minuto e tente novamente."
  ),
});

export const saleRequestPhotoRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.RATE_LIMIT_SALE_REQUEST_PHOTOS_MAX || 12),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `sale-request-photos:${req.user?.id || clientRateLimitKey(req)}`,
  handler: jsonLimitHandler("Muitos envios de foto em sequência. Aguarde um minuto."),
});
