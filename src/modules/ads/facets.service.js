// src/modules/ads/facets.service.js

import { getFacetsWithFilters } from "./filters/ads-filter.service.js";

export async function getFacets(filters = {}) {
  const result = await getFacetsWithFilters(filters, { safeMode: true });
  return result.facets;
}
