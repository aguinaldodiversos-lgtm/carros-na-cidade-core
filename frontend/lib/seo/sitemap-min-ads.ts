// frontend/lib/seo/sitemap-min-ads.ts
//
// Espelho do backend `src/read-models/cities/city-thresholds.js`. Lido em
// server-side (metadata / route handlers).
//
// São DOIS limiares, não um — ver
// `docs/architecture/invariante-cidade-existe-se-tem-anuncio.md`:
//
//   getCityIndexMinAds()  → indexar (index vs noindex + sitemap), default 3
//   getCityExistsMinAds() → existir (200 vs 404),                 default 1
//
// A precedência de env precisa ser IDÊNTICA à do backend. Se os dois lados
// lerem variáveis diferentes, uma cidade pode ser indexável para o sitemap
// (backend) e noindex para o robots (frontend) — a incoerência "index diz sim,
// sitemap diz não" que o limiar único existia para evitar, agora dividida por
// processo em vez de por rota.

const DEFAULT_INDEX_MIN_ADS = 3;
const DEFAULT_EXISTS_MIN_ADS = 1;

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return parsed;
}

/**
 * Limiar de INDEXAÇÃO. Lê `CITY_INDEX_MIN_ADS` e cai em `SITEMAP_MIN_ADS`
 * (nome antigo) — a config do Render não é versionada, então renomear sem
 * fallback perderia o valor já configurado lá.
 */
export function getCityIndexMinAds(): number {
  const renamed = process.env.CITY_INDEX_MIN_ADS;
  if (renamed != null && String(renamed).trim() !== "") {
    return parsePositiveInt(renamed, DEFAULT_INDEX_MIN_ADS);
  }
  return parsePositiveInt(process.env.SITEMAP_MIN_ADS, DEFAULT_INDEX_MIN_ADS);
}

/** Limiar de EXISTÊNCIA (200 vs 404). Default 1: um anúncio cria a cidade. */
export function getCityExistsMinAds(): number {
  return parsePositiveInt(process.env.CITY_EXISTS_MIN_ADS, DEFAULT_EXISTS_MIN_ADS);
}

/**
 * @deprecated Use `getCityIndexMinAds()`. Mantido porque o limiar do sitemap
 * é, de fato, o de indexação, e vários módulos já importam este nome.
 */
export function getSitemapMinAds(): number {
  return getCityIndexMinAds();
}
