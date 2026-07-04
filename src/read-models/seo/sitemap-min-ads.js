// src/read-models/seo/sitemap-min-ads.js
//
// Fonte ÚNICA do limiar de estoque que decide, AO MESMO TEMPO, (a) a indexação
// (robots) das páginas geográficas e (b) a inclusão no sitemap. Ter um só
// número evita a incoerência de "index diz sim, sitemap diz não" (auditoria
// SEO 2026-07-04).
//
// Universal e controlado por estoque: uma página entra no índice E no sitemap
// se, e somente se, tiver >= SITEMAP_MIN_ADS anúncios ativos. Abaixo →
// noindex,follow e fora do sitemap. Expansão para o Brasil inteiro acontece
// sozinha conforme o estoque cresce; nada de limitar por região no código.

const DEFAULT_MIN_ADS = 3;

/** Limiar mínimo de anúncios ativos. `SITEMAP_MIN_ADS` (env), default 3, min 1. */
export function getSitemapMinAds() {
  const parsed = Number.parseInt(String(process.env.SITEMAP_MIN_ADS ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_MIN_ADS;
  return parsed;
}
