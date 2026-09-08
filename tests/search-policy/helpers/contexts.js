// tests/search-policy/helpers/contexts.js
//
// Os 24 SearchContexts fixos de §8.1/§8.8: 3 origens × 2 modos × 4 combinações
// de filtros. `filters` é o que o parser LEGADO recebe (nomes da API, já
// normalizados como parseAdsFilters devolve); `query` é a URL que o motor v1 lê.
export const ORIGINS = ["braganca-paulista-sp", "atibaia-sp", "extrema-mg"];
export const MODES = [
  { key: "auto", query: {} },
  { key: "manual50", query: { raio: "50" } },
];
export const FILTER_COMBOS = [
  { key: "none", query: {}, legacy: {} },
  { key: "model", query: { commercial_model: "Onix" }, legacy: { model: "ONIX" } },
  {
    key: "manual-price",
    query: { transmission: "manual", price_max: "75000" },
    legacy: { transmission: "manual", price_max: 75000 },
  },
  { key: "q", query: { q: "onix" }, legacy: { q: "onix" } },
];

export const CONTEXTS = [];
export const LEGACY_CONTEXTS = [];
for (const origin of ORIGINS) {
  for (const mode of MODES) {
    for (const combo of FILTER_COMBOS) {
      const key = `${origin}|${mode.key}|${combo.key}`;
      CONTEXTS.push({ key, origin, mode: mode.key, combo: combo.key, query: { city_slug: origin, sort: "relevance", limit: "50", ...mode.query, ...combo.query } });
      LEGACY_CONTEXTS.push({ key, filters: { city_slug: origin, sort: "relevance", limit: 50, page: 1, ...combo.legacy } });
    }
  }
}
