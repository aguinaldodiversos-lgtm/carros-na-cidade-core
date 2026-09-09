// src/modules/ads/search-policy/intent-resolver.js
//
// IntentResolver (§4.3). Puro.
//
// specificity = nº de dimensões resolvidas em {brand, commercial_model,
// version (q residual não vazio), ano (year_from ou year_to), preço (min ou
// max), transmission, fuel, body_type, mileage_max}.
//
// Perfil (empate → linha mais abaixo, mais específica):
//   sem dimensão                              → BROWSE_CITY
//   só body_type/price/seller_kind/below_fipe → BROWSE_CATEGORY
//   brand sem commercial_model                → SEARCH_BRAND
//   commercial_model sem ano                  → SEARCH_MODEL
//   commercial_model com ano                  → SEARCH_MODEL_YEAR
//   q residual (versão), com ou sem ano       → SEARCH_VERSION
//
// DEFAULT §12 registrado: filtro que não é marca/modelo/versão nem está na
// lista de categoria (transmission, fuel, mileage, ano sozinhos) cai em
// BROWSE_CATEGORY — é a única linha que descreve "só filtros de catálogo".

export const PROFILES = Object.freeze([
  "BROWSE_CITY",
  "BROWSE_CATEGORY",
  "SEARCH_BRAND",
  "SEARCH_MODEL",
  "SEARCH_MODEL_YEAR",
  "SEARCH_VERSION",
]);

const present = (v) => v !== undefined && v !== null && v !== "" && v !== false;

/**
 * @param {object} filters filtros internos (brand, commercial_model, year_from/to, price_min/max, transmission, fuel, body_type, mileage_max, seller_kind, below_fipe…)
 * @param {string} residualQ
 * @param {object} policy política (profiles)
 */
export function resolveIntent(filters = {}, residualQ = "", policy) {
  const dims = {
    brand: present(filters.brand),
    commercial_model: present(filters.commercial_model),
    version: Boolean(String(residualQ || "").trim()),
    year: present(filters.year_from) || present(filters.year_to),
    price: present(filters.price_min) || present(filters.price_max),
    transmission: present(filters.transmission),
    fuel: present(filters.fuel),
    body_type: present(filters.body_type),
    mileage_max: present(filters.mileage_max),
  };
  const dimensions = Object.entries(dims)
    .filter(([, on]) => on)
    .map(([k]) => k);
  const specificity = dimensions.length;

  let profile = "BROWSE_CITY";
  if (dims.version) profile = "SEARCH_VERSION";
  else if (dims.commercial_model && dims.year) profile = "SEARCH_MODEL_YEAR";
  else if (dims.commercial_model) profile = "SEARCH_MODEL";
  else if (dims.brand) profile = "SEARCH_BRAND";
  else if (
    specificity > 0 ||
    present(filters.seller_kind) ||
    filters.below_fipe === true ||
    filters.opportunity === true ||
    present(filters.priority_tier)
  )
    profile = "BROWSE_CATEGORY";

  const p = policy?.profiles?.[profile] || {};
  return {
    profile,
    specificity,
    dimensions,
    target: Number(p.target),
    max_auto_radius: Number(p.max_auto_radius),
  };
}
