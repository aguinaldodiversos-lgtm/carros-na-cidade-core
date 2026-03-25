/**
 * Normalização de texto para busca — alinhada ao autocomplete de anúncios
 * (`ads-autocomplete.service.js`).
 */
export function normalizeSearchText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
