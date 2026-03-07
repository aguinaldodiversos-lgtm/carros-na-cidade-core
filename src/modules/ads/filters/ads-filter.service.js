import { pool } from "../../../infrastructure/database/db.js";
import { parseAdsFacetFilters, parseAdsFilters } from "./ads-filter.parser.js";
import { buildAdsSearchQuery } from "./ads-filter.builder.js";
import { getAdsFacets } from "./ads-filter.facets.js";

export async function searchAdsWithFilters(rawFilters = {}, scope = "public_global") {
  const filters = parseAdsFilters(rawFilters, scope);
  const query = buildAdsSearchQuery(filters);

  const [dataResult, countResult] = await Promise.all([
    pool.query(query.dataQuery, query.params),
    pool.query(query.countQuery, query.countParams),
  ]);

  const total = Number(countResult.rows[0]?.total || 0);

  return {
    filters,
    data: dataResult.rows,
    pagination: {
      page: query.pagination.page,
      limit: query.pagination.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pagination.limit)),
    },
  };
}

export async function getFacetsWithFilters(rawFilters = {}) {
  const filters = parseAdsFacetFilters(rawFilters);
  const facets = await getAdsFacets(filters);

  return {
    filters,
    facets,
  };
}
