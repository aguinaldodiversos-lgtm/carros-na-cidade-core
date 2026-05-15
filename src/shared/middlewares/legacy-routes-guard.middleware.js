// src/shared/middlewares/legacy-routes-guard.middleware.js
//
// Em 2026-05-14 os logs mostraram rajadas de 404s vindo de bots Node
// enumerando rotas que NUNCA existiram no backend:
//
//   /catalog/ads/<slug-gigante>
//   /public/listings/<slug-gigante>
//   /public/ads/<slug-gigante>
//   /ads/<slug-gigante>
//   /api/ads/slug/<slug-gigante>
//   /api/ads/by-slug/<slug-gigante>
//
// Esses são padrões legacy/herdados de plataformas concorrentes que scrapers
// testam às cegas. Não temos handler oficial para nenhum desses prefixos —
// hoje todos caem no 404 handler genérico, que gera AppError + logger.error
// (level 50) + atravessa o error handler retornando JSON com requestId, etc.
//
// Cada 404 desses custa: CPU, log volumoso, e body de erro com requestId
// pesa ~200 bytes — N requests por segundo somam tráfego de saída.
//
// Este middleware responde direto com 410 leve + Cache-Control curto + sem
// log antes de tocar qualquer router. Ataca a sangria na frente.
//
// Rotas oficiais do app (não tocar):
//   /api/ads, /api/ads/search, /api/ads/facets, /api/ads/autocomplete,
//   /api/ads/:identifier, /api/ads/:id/event, /api/ads/:id/publication-options
//   — todas começam com `/api/ads/` mas com sub-prefixos específicos.
//
// Para evitar falso-positivo, casamos só prefixos exatos da lista abaixo.

const LEGACY_PATH_PATTERNS = [
  // Prefixos completamente fora do mapa oficial
  /^\/catalog\/ads(?:\/|$)/i,
  /^\/public\/listings(?:\/|$)/i,
  /^\/public\/ads(?:\/|$)/i,
  // /ads/<slug> (sem o prefixo /api/) — bots testam URL "bonita"
  /^\/ads\/[^/]+/i,
  // /api/ads/slug/<...> e /api/ads/by-slug/<...> — não existem
  /^\/api\/ads\/slug\/[^/]+/i,
  /^\/api\/ads\/by-slug\/[^/]+/i,
  // /listings, /listing — não existem no backend
  /^\/listings(?:\/|$)/i,
  /^\/listing\/[^/]+/i,
];

/**
 * Heurística adicional: paths com slug "abusivo" — muito longos OU compostos
 * por vários modelos colados (jeep-renegade-nissan-kicks-honda-civic-...).
 * Bots fazem isso pra parecer real.
 *
 * Critério:
 *   - segmento >120 chars
 *   - OU >=8 hífens no segmento (modelos colados)
 */
const ABUSIVE_SLUG_PATTERN = /\/[a-z0-9-]+\/?$/i;
const MAX_SAFE_SLUG_LENGTH = 120;
const MAX_SAFE_SLUG_HYPHENS = 8;

export function isAbusivePath(path) {
  if (!path) return false;
  const cleaned = path.split("?")[0];
  const lastMatch = cleaned.match(ABUSIVE_SLUG_PATTERN);
  if (!lastMatch) return false;
  const lastSeg = lastMatch[0].replace(/^\//, "").replace(/\/$/, "");
  if (lastSeg.length > MAX_SAFE_SLUG_LENGTH) return true;
  const hyphenCount = (lastSeg.match(/-/g) || []).length;
  if (hyphenCount > MAX_SAFE_SLUG_HYPHENS) return true;
  return false;
}

export function isLegacyPublicPath(path) {
  if (!path) return false;
  const cleaned = path.split("?")[0];
  return LEGACY_PATH_PATTERNS.some((re) => re.test(cleaned));
}

/**
 * Resposta padrão: 410 Gone (rota nunca mais existirá) com corpo mínimo.
 * Cache curto (5 min) ajuda Cloudflare a absorver hits subsequentes da mesma URL.
 */
function respondGone(res) {
  res.set("Cache-Control", "public, max-age=300");
  res.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  res.set("X-Content-Type-Options", "nosniff");
  return res.status(410).json({ error: "gone" });
}

export function legacyRoutesGuardMiddleware(req, res, next) {
  const path = req.path || req.url || "";

  if (isLegacyPublicPath(path)) {
    return respondGone(res);
  }

  // Slugs abusivos só são cortados em paths que parecem rota pública.
  // Não queremos pegar uploads de arquivo com nome longo, etc.
  if (
    isAbusivePath(path) &&
    (path.startsWith("/api/ads/") ||
      path.startsWith("/ads/") ||
      path.startsWith("/catalog/") ||
      path.startsWith("/public/listings") ||
      path.startsWith("/public/ads"))
  ) {
    return respondGone(res);
  }

  return next();
}
