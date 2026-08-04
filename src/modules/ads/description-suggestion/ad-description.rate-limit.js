/**
 * Rate limit da sugestão de descrição (Fase 4.5).
 *
 * Dois baldes, montados depois do `authMiddleware` (então `req.user` existe):
 *
 *   1. POR USUÁRIO — 10/hora. É o limite que vale. É fluxo de publicação
 *      GRÁTIS: sem teto, o endpoint vira gerador de texto pago pela
 *      plataforma para quem nunca vai anunciar.
 *
 *   2. POR RASCUNHO — 3/hora. Contém o clique repetido no mesmo anúncio
 *      ("gerar de novo até gostar"), que é o padrão de gasto mais provável.
 *
 * HONESTIDADE SOBRE O BALDE 2: o `draftId` vem do CLIENTE (o rascunho do
 * wizard mora em localStorage, não há linha no banco para amarrar). Quem
 * quiser burlar troca o id e escapa. Ele existe para conter uso normal, não
 * ataque — quem segura abuso é o balde por usuário, que usa `req.user.id`
 * vindo do JWT. Se um dia o rascunho virar tabela, trocar a chave por
 * `ads.id` fecha o buraco sem mexer no resto.
 *
 * Como em support.rate-limit.js, NÃO usamos o skip de chamada interna: o
 * caminho normal é justamente via BFF, e pular ali desligaria o limite.
 */

import rateLimit from "express-rate-limit";
import { clientRateLimitKey } from "../../../shared/middlewares/rateLimit.middleware.js";

const HOUR_MS = 60 * 60 * 1000;

function tooMany(res, message) {
  res.set("Cache-Control", "no-store");
  return res.status(429).json({
    success: false,
    error: true,
    message,
  });
}

export const descriptionSuggestionUserRateLimit = rateLimit({
  windowMs: HOUR_MS,
  max: Number(process.env.RATE_LIMIT_AD_DESCRIPTION_USER_MAX || 10),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `ad-desc-user:${req.user?.id || clientRateLimitKey(req)}`,
  handler: (_req, res) =>
    tooMany(
      res,
      "Você atingiu o limite de sugestões por hora. Escreva a descrição ou tente mais tarde."
    ),
});

export const descriptionSuggestionDraftRateLimit = rateLimit({
  windowMs: HOUR_MS,
  max: Number(process.env.RATE_LIMIT_AD_DESCRIPTION_DRAFT_MAX || 3),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const owner = req.user?.id || clientRateLimitKey(req);
    const draft = String(req.body?.draftId ?? req.body?.adId ?? "sem-rascunho").slice(0, 64);
    return `ad-desc-draft:${owner}:${draft}`;
  },
  handler: (_req, res) =>
    tooMany(
      res,
      "Você já gerou algumas sugestões para este anúncio. Ajuste o texto ou tente mais tarde."
    ),
});
