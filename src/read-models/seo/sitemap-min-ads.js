// src/read-models/seo/sitemap-min-ads.js
//
// SHIM DE COMPATIBILIDADE. A fonte dos limiares agora é
// `src/read-models/cities/city-thresholds.js`, que separa as duas perguntas
// que este módulo confundia num número só:
//
//   getCityIndexMinAds()  → indexar (index vs noindex + sitemap), default 3
//   getCityExistsMinAds() → existir (200 vs 404),                 default 1
//
// Este arquivo continua exportando `getSitemapMinAds` porque vários módulos de
// sitemap o importam e o valor deles É o de indexação. Código novo deve
// importar de `cities/city-thresholds.js` direto.

export { getCityIndexMinAds, getCityExistsMinAds } from "../cities/city-thresholds.js";
import { getCityIndexMinAds } from "../cities/city-thresholds.js";

/**
 * @deprecated Use `getCityIndexMinAds()` de `cities/city-thresholds.js`.
 * Mantido porque o limiar do sitemap é, de fato, o de indexação.
 */
export function getSitemapMinAds() {
  return getCityIndexMinAds();
}
