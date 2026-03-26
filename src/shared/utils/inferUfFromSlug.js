/**
 * Tenta obter a UF a partir do sufixo do slug (ex.: "atibaia-sp" → "SP").
 */
export function inferUfFromSlug(slug) {
  if (!slug || typeof slug !== "string") return "";
  const m = slug.match(/[-_]([a-z]{2})$/i);
  return m ? m[1].toUpperCase() : "";
}
