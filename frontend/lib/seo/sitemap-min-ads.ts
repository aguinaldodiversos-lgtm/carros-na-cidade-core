// frontend/lib/seo/sitemap-min-ads.ts
//
// Espelho do backend `src/read-models/seo/sitemap-min-ads.js`. Limiar ÚNICO de
// estoque que decide indexação E presença no sitemap. Lido em server-side
// (metadata/route handlers). Default 3; controlado por `SITEMAP_MIN_ADS`.

const DEFAULT_MIN_ADS = 3;

export function getSitemapMinAds(): number {
  const parsed = Number.parseInt(String(process.env.SITEMAP_MIN_ADS ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_MIN_ADS;
  return parsed;
}
