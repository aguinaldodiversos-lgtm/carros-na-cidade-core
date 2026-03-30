// src/modules/ads/filters/ads-filter.service.js

import { pool } from "../../../infrastructure/database/db.js";
import { parseAdsFacetFilters, parseAdsFilters } from "./ads-filter.parser.js";
import { buildAdsSearchQuery } from "./ads-filter.builder.js";
import { getAdsFacets } from "./ads-filter.facets.js";

function buildSafeSearchFallback(error, rawFilters = {}) {
  return {
    ok: false,
    error: error?.message || "Invalid filters",
    rawFilters,
    filters: {
      page: 1,
      limit: 20,
      sort: "relevance",
      free_query_meta: {
        original_q: rawFilters?.q || null,
        parsed: false,
        safe: true,
      },
    },
    data: [],
    pagination: {
      page: 1,
      limit: 20,
      total: 0,
      totalPages: 1,
    },
  };
}

export async function searchAdsWithFilters(rawFilters = {}, scope = "public_global", options = {}) {
  const safeMode = options.safeMode !== false;

  try {
    const filters = await parseAdsFilters(rawFilters, scope);
    const query = buildAdsSearchQuery(filters);

    const [dataResult, countResult] = await Promise.all([
      pool.query(query.dataQuery, query.params),
      pool.query(query.countQuery, query.countParams),
    ]);

    const total = Number(countResult.rows[0]?.total || 0);

    return {
      ok: true,
      filters,
      data: dataResult.rows,
      pagination: {
        page: query.pagination.page,
        limit: query.pagination.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pagination.limit)),
      },
    };
  } catch (error) {
    if (!safeMode) {
      throw error;
    }

    return buildSafeSearchFallback(error, rawFilters);
  }
}

export async function getFacetsWithFilters(rawFilters = {}, options = {}) {
  const safeMode = options.safeMode !== false;

  try {
    const filters = await parseAdsFacetFilters(rawFilters);
    const facets = await getAdsFacets(filters);

    return {
      ok: true,
      filters,
      facets,
    };
  } catch (error) {
    if (!safeMode) {
      throw error;
    }

    return {
      ok: false,
      error: error?.message || "Invalid facet filters",
      filters: {},
      facets: {
        brands: [],
        models: [],
        fuelTypes: [],
        bodyTypes: [],
      },
    };
  }
}
