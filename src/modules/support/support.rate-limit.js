// Anti-spam da criação de chamado. Reusa o padrão de rate-limit do projeto
// (express-rate-limit), mas com chave por USUÁRIO autenticado — o limiter é
// montado depois do authMiddleware, então req.user já existe. Cai para o IP
// real se, por algum motivo, não houver usuário. NÃO usa o skip interno de
// chamadas do BFF de propósito: queremos limitar por usuário mesmo quando a
// request chega via BFF (que é o caso normal do painel).

import rateLimit from "express-rate-limit";
import { clientRateLimitKey } from "../../shared/middlewares/rateLimit.middleware.js";

export const supportCreateRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.RATE_LIMIT_SUPPORT_CREATE_MAX || 5),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `support-create:${req.user?.id || clientRateLimitKey(req)}`,
  handler(_req, res) {
    res.set("Cache-Control", "no-store");
    return res.status(429).json({
      success: false,
      error: true,
      message: "Muitos chamados em sequência. Aguarde um minuto e tente novamente.",
    });
  },
});
