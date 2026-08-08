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

/* ─────────────────────────────────────────────────────────────────────────
   POLÍTICA CENTRAL DE QUALIFICAÇÃO SEO (Fase 3)

   Espelho de `src/read-models/cities/city-thresholds.js` — a justificativa
   de cada valor está documentada LÁ (fonte única da política). Aqui fica só
   a derivação, para que rotas e módulos do frontend não recomparem `>= 3`
   espalhado.
   ───────────────────────────────────────────────────────────────────────── */

export type SeoSurface =
  | "city"
  | "brand"
  | "model"
  | "bodyType"
  | "transmission"
  | "priceRange";

/** Limiares por família, derivados do limiar de indexação de cidade. */
export function getSeoInventoryThresholds(): Record<SeoSurface, number> {
  const base = getCityIndexMinAds();
  const transversal = base + 1;

  return {
    city: base,
    brand: base,
    model: base,
    bodyType: transversal,
    transmission: transversal,
    priceRange: transversal,
  };
}

export function getSeoThreshold(surface: SeoSurface): number {
  const thresholds = getSeoInventoryThresholds();
  return thresholds[surface] ?? thresholds.city;
}

/**
 * Uma superfície qualifica para indexação + sitemap + link interno de malha?
 * Pergunta ÚNICA — não recomparar o número no lugar de uso.
 */
export function qualifiesForSeoSurface(surface: SeoSurface, activeCount: unknown): boolean {
  const count = Number(activeCount);
  if (!Number.isFinite(count) || count < 0) return false;
  return count >= getSeoThreshold(surface);
}
