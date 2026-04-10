import rateLimit from "express-rate-limit";

/**
 * Chave para rate limit quando o portal chama o backend via BFF (Next.js).
 * Sem isso, todas as requisições compartilham o IP do servidor do portal e o limite global é atingido em segundos.
 * Prioriza o header enviado pelo BFF (IP real do visitante).
 */
export function clientRateLimitKey(req) {
  const bff = req.headers["x-cnc-client-ip"];
  if (bff) {
    const trimmed = String(bff).trim();
    if (trimmed) return trimmed;
  }

  const xff = req.headers["x-forwarded-for"];
  if (xff) {
    const first = String(xff).split(",")[0].trim();
    if (first) return first;
  }

  return req.ip || req.socket?.remoteAddress || "unknown";
}

export const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 10, // 10 tentativas
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => clientRateLimitKey(req),
  message: {
    error: "Muitas tentativas. Tente novamente mais tarde.",
  },
});

/** Mesmo critério de IP do login (BFF + visitante real). */
export const registerRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => clientRateLimitKey(req),
  message: {
    error: "Muitas tentativas. Tente novamente mais tarde.",
  },
});

/**
 * Rate limit generoso para endpoints de autocomplete (cidades, busca).
 * Protege contra abuso real sem bloquear digitação normal no autocomplete.
 * 120 requests por minuto por IP é suficiente para uso intenso (debounce ≥250ms → ~4 req/s max).
 */
export const autocompleteRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `autocomplete:${clientRateLimitKey(req)}`,
  message: {
    success: false,
    message: "Muitas buscas em sequência. Aguarde alguns segundos.",
  },
});
