/**
 * Decide se deve pular o otimizador do next/image.
 * Regra: só pulamos para SVG (já vetorial) e data URIs (inline).
 * Tudo o mais — incluindo o proxy /api/vehicle-images e URLs R2 diretas —
 * passa pelo otimizador, que serve variantes por `sizes` em /_next/image.
 */
export function shouldSkipNextImageOptimizer(url: string): boolean {
  if (!url) return true;
  if (url.startsWith("data:")) return true;
  if (url.endsWith(".svg")) return true;
  return false;
}
