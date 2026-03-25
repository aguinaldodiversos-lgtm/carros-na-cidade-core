// src/modules/ads/autocomplete/ads-autocomplete.service.js

import {
  loadBrandDictionary,
  loadCityBrandPresence,
  loadCityDictionary,
  loadModelDictionary,
} from "./ads-autocomplete.repository.js";
import { inferAdsFiltersFromFreeQuery } from "../filters/ads-free-query.parser.js";
import { normalizeSearchText as normalizeText } from "../../../shared/utils/normalizeSearchText.js";

/* =====================================================
   CONFIG
===================================================== */

const CACHE_TTL_MS = Number(
  process.env.ADS_AUTOCOMPLETE_CACHE_TTL_MS || 10 * 60 * 1000
);

const DEFAULT_LIMIT = 8;

/* =====================================================
   LOCAL CACHE
===================================================== */

const cache = {
  brands: { value: null, loadedAt: 0 },
  models: { value: null, loadedAt: 0 },
  cities: { value: null, loadedAt: 0 },
  cityBrandPresence: { value: null, loadedAt: 0 },
};

function isFresh(entry) {
  return entry.value && Date.now() - entry.loadedAt < CACHE_TTL_MS;
}

async function getBrands() {
  if (isFresh(cache.brands)) return cache.brands.value;

  const rows = await loadBrandDictionary();
  cache.brands = {
    value: rows.map((row) => ({
      brand: row.brand,
      total: Number(row.total || 0),
      normalized: normalizeText(row.brand),
    })),
    loadedAt: Date.now(),
  };

  return cache.brands.value;
}

async function getModels() {
  if (isFresh(cache.models)) return cache.models.value;

  const rows = await loadModelDictionary();
  cache.models = {
    value: rows.map((row) => ({
      brand: row.brand,
      model: row.model,
      total: Number(row.total || 0),
      normalizedBrand: normalizeText(row.brand),
      normalizedModel: normalizeText(row.model),
      normalizedFull: normalizeText(`${row.brand} ${row.model}`),
    })),
    loadedAt: Date.now(),
  };

  return cache.models.value;
}

async function getCities() {
  if (isFresh(cache.cities)) return cache.cities.value;

  const rows = await loadCityDictionary();
  cache.cities = {
    value: rows.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      state: row.state,
      rankingPriority: Number(row.ranking_priority || 0),
      territorialScore: Number(row.territorial_score || 0),
      normalizedName: normalizeText(row.name),
      normalizedLabel: normalizeText(
        `${row.name}${row.state ? ` ${row.state}` : ""}`
      ),
    })),
    loadedAt: Date.now(),
  };

  return cache.cities.value;
}

async function getCityBrandPresence() {
  if (isFresh(cache.cityBrandPresence)) return cache.cityBrandPresence.value;

  const rows = await loadCityBrandPresence();
  cache.cityBrandPresence = {
    value: rows.map((row) => ({
      city_slug: row.city_slug,
      city_name: row.city_name,
      city_state: row.city_state,
      brand: row.brand,
      total: Number(row.total || 0),
      normalizedBrand: normalizeText(row.brand),
      normalizedCity: normalizeText(row.city_name),
    })),
    loadedAt: Date.now(),
  };

  return cache.cityBrandPresence.value;
}

/* =====================================================
   TEXT HELPERS (normalizeText = shared normalizeSearchText)
===================================================== */

function tokenize(value) {
  return normalizeText(value)
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean);
}

function buildBigrams(value) {
  const compact = ` ${normalizeText(value)} `;
  const result = [];

  for (let i = 0; i < compact.length - 1; i += 1) {
    result.push(compact.slice(i, i + 2));
  }

  return result;
}

function diceCoefficient(a, b) {
  const aBigrams = buildBigrams(a);
  const bBigrams = buildBigrams(b);

  if (!aBigrams.length || !bBigrams.length) return 0;

  const map = new Map();

  for (const bg of aBigrams) {
    map.set(bg, (map.get(bg) || 0) + 1);
  }

  let matches = 0;
  for (const bg of bBigrams) {
    const count = map.get(bg) || 0;
    if (count > 0) {
      matches += 1;
      map.set(bg, count - 1);
    }
  }

  return (2 * matches) / (aBigrams.length + bBigrams.length);
}

function tokenOverlapScore(query, candidate) {
  const queryTokens = tokenize(query);
  const candidateTokens = tokenize(candidate);

  if (!queryTokens.length || !candidateTokens.length) return 0;

  const candidateSet = new Set(candidateTokens);
  let overlap = 0;

  for (const token of queryTokens) {
    if (candidateSet.has(token)) overlap += 1;
  }

  return overlap / queryTokens.length;
}

function startsWithScore(query, candidate) {
  const q = normalizeText(query);
  const c = normalizeText(candidate);

  if (!q || !c) return 0;
  if (c === q) return 1;
  if (c.startsWith(q)) return 0.9;
  if (c.includes(q)) return 0.7;
  return 0;
}

function popularityBoost(total) {
  return Math.min(0.2, Math.log10(Number(total || 0) + 1) / 10);
}

function cityContextBoost(currentCitySlug, candidateCitySlug) {
  if (!currentCitySlug || !candidateCitySlug) return 0;
  return currentCitySlug === candidateCitySlug ? 0.25 : 0;
}

function scoreCandidate({
  query,
  candidate,
  total = 0,
  currentCitySlug = null,
  candidateCitySlug = null,
}) {
  const exactPrefix = startsWithScore(query, candidate);
  const dice = diceCoefficient(query, candidate);
  const overlap = tokenOverlapScore(query, candidate);
  const popularity = popularityBoost(total);
  const context = cityContextBoost(currentCitySlug, candidateCitySlug);

  return Number(
    (
      exactPrefix * 0.42 +
      dice * 0.26 +
      overlap * 0.22 +
      popularity +
      context
    ).toFixed(6)
  );
}

function uniqueBy(items, keyFn) {
  const map = new Map();

  for (const item of items) {
    const key = keyFn(item);
    if (!map.has(key)) {
      map.set(key, item);
      continue;
    }

    if (Number(item.score || 0) > Number(map.get(key).score || 0)) {
      map.set(key, item);
    }
  }

  return [...map.values()];
}

function sortByScore(items) {
  return [...items].sort((a, b) => {
    const scoreDiff = Number(b.score || 0) - Number(a.score || 0);
    if (scoreDiff !== 0) return scoreDiff;

    const totalDiff = Number(b.total || 0) - Number(a.total || 0);
    if (totalDiff !== 0) return totalDiff;

    return String(a.label || "").localeCompare(String(b.label || ""));
  });
}

/* =====================================================
   FILTER HELPERS
===================================================== */

function buildRecognizedPayload(inferred) {
  return {
    brand: inferred.brand || null,
    model: inferred.model || null,
    city: inferred.city
      ? {
          id: inferred.city_id || null,
          name: inferred.city,
          slug: inferred.city_slug || null,
          state: inferred.state || null,
        }
      : null,
    priceRange:
      inferred.min_price !== undefined || inferred.max_price !== undefined
        ? {
            min: inferred.min_price ?? null,
            max: inferred.max_price ?? null,
          }
        : null,
    yearRange:
      inferred.year_min !== undefined || inferred.year_max !== undefined
        ? {
            min: inferred.year_min ?? null,
            max: inferred.year_max ?? null,
          }
        : null,
    belowFipe: inferred.below_fipe ?? null,
    fuelType: inferred.fuel_type || null,
    transmission: inferred.transmission || null,
    bodyType: inferred.body_type || null,
  };
}

function buildApplicableFilters(inferred) {
  const result = {};

  for (const key of [
    "q",
    "brand",
    "model",
    "city_id",
    "city_slug",
    "city",
    "state",
    "min_price",
    "max_price",
    "year_min",
    "year_max",
    "fuel_type",
    "transmission",
    "body_type",
    "below_fipe",
    "highlight_only",
  ]) {
    if (inferred[key] !== undefined) {
      result[key] = inferred[key];
    }
  }

  return result;
}

/* =====================================================
   SUGGESTION BUILDERS
===================================================== */

function buildBrandSuggestions(query, brands, { limit = DEFAULT_LIMIT } = {}) {
  const suggestions = brands
    .map((item) => ({
      type: "brand",
      label: item.brand,
      value: item.brand,
      total: item.total,
      score: scoreCandidate({
        query,
        candidate: item.brand,
        total: item.total,
      }),
    }))
    .filter((item) => item.score >= 0.24);

  return sortByScore(uniqueBy(suggestions, (item) => item.value)).slice(0, limit);
}

function buildModelSuggestions(
  query,
  models,
  inferred,
  { limit = DEFAULT_LIMIT, currentCitySlug = null } = {}
) {
  const normalizedBrand = normalizeText(inferred.brand || "");

  const scored = models
    .map((item) => {
      let score = scoreCandidate({
        query,
        candidate: `${item.brand} ${item.model}`,
        total: item.total,
        currentCitySlug,
      });

      score += scoreCandidate({
        query,
        candidate: item.model,
        total: item.total,
        currentCitySlug,
      }) * 0.7;

      if (normalizedBrand && item.normalizedBrand === normalizedBrand) {
        score += 0.18;
      }

      return {
        type: "model",
        label: `${item.brand} ${item.model}`,
        value: item.model,
        brand: item.brand,
        model: item.model,
        total: item.total,
        score: Number(score.toFixed(6)),
      };
    })
    .filter((item) => item.score >= 0.24);

  return sortByScore(
    uniqueBy(scored, (item) => `${item.brand}:${item.model}`)
  ).slice(0, limit);
}

function buildCitySuggestions(
  query,
  cities,
  inferred,
  { limit = DEFAULT_LIMIT, currentCitySlug = null } = {}
) {
  const scored = cities
    .map((item) => {
      let score = scoreCandidate({
        query,
        candidate: `${item.name} ${item.state || ""}`,
        total: item.rankingPriority + item.territorialScore,
        currentCitySlug,
        candidateCitySlug: item.slug,
      });

      score += scoreCandidate({
        query,
        candidate: item.name,
        total: item.rankingPriority + item.territorialScore,
        currentCitySlug,
        candidateCitySlug: item.slug,
      }) * 0.75;

      if (inferred.city_slug && inferred.city_slug === item.slug) {
        score += 0.22;
      }

      return {
        type: "city",
        label: `${item.name}${item.state ? ` - ${item.state}` : ""}`,
        value: item.name,
        city_id: item.id,
        city: item.name,
        slug: item.slug,
        state: item.state,
        total: item.rankingPriority + item.territorialScore,
        score: Number(score.toFixed(6)),
      };
    })
    .filter((item) => item.score >= 0.22);

  return sortByScore(uniqueBy(scored, (item) => item.slug)).slice(0, limit);
}

async function buildComposedSuggestions(
  inferred,
  currentCitySlug,
  { limit = DEFAULT_LIMIT } = {}
) {
  const suggestions = [];
  const cityPresence = await getCityBrandPresence();

  if (inferred.brand && inferred.city_slug) {
    const match = cityPresence.find(
      (item) =>
        item.city_slug === inferred.city_slug &&
        normalizeText(item.brand) === normalizeText(inferred.brand)
    );

    if (match) {
      uniquePushByKey(
        suggestions,
        {
          type: "composed",
          label: `${inferred.brand} em ${match.city_name}${match.city_state ? ` - ${match.city_state}` : ""}`,
          path: `/cidade/${match.city_slug}/marca/${encodeURIComponent(
            normalizeText(inferred.brand)
          )}`,
          score: 0.98,
          total: match.total,
        },
        (item) => item.path
      );
    }
  }

  if (inferred.brand && inferred.model && inferred.city_slug) {
    uniquePushByKey(
      suggestions,
      {
        type: "composed",
        label: `${inferred.brand} ${inferred.model} em ${inferred.city}`,
        path: `/cidade/${inferred.city_slug}/marca/${encodeURIComponent(
          normalizeText(inferred.brand)
        )}/modelo/${encodeURIComponent(normalizeText(inferred.model))}`,
        score: 1,
        total: 0,
      },
      (item) => item.path
    );
  }

  if (inferred.city_slug) {
    uniquePushByKey(
      suggestions,
      {
        type: "composed",
        label: `Carros em ${inferred.city}${inferred.state ? ` - ${inferred.state}` : ""}`,
        path: `/cidade/${inferred.city_slug}`,
        score: currentCitySlug === inferred.city_slug ? 0.96 : 0.9,
        total: 0,
      },
      (item) => item.path
    );

    if (inferred.below_fipe === true) {
      uniquePushByKey(
        suggestions,
        {
          type: "composed",
          label: `Carros abaixo da FIPE em ${inferred.city}`,
          path: `/cidade/${inferred.city_slug}/abaixo-da-fipe`,
          score: 0.99,
          total: 0,
        },
        (item) => item.path
      );
    }
  }

  return sortByScore(suggestions).slice(0, limit);
}

function uniquePushByKey(list, item, keyFn) {
  const key = keyFn(item);

  if (!list.some((entry) => keyFn(entry) === key)) {
    list.push(item);
  }
}

/* =====================================================
   PUBLIC API
===================================================== */

export async function getSemanticAutocomplete(
  rawQuery,
  { currentCitySlug = null, limit = DEFAULT_LIMIT } = {}
) {
  const q = String(rawQuery || "").trim();

  if (q.length < 2) {
    return {
      query: q,
      semantic: {
        recognized: {},
        applicableFilters: {},
      },
      suggestions: {
        brands: [],
        models: [],
        cities: [],
        composed: [],
      },
    };
  }

  const [brands, models, cities, inferred] = await Promise.all([
    getBrands(),
    getModels(),
    getCities(),
    inferAdsFiltersFromFreeQuery({ q }),
  ]);

  const recognized = buildRecognizedPayload(inferred);
  const applicableFilters = buildApplicableFilters(inferred);

  const [brandSuggestions, modelSuggestions, citySuggestions, composed] =
    await Promise.all([
      buildBrandSuggestions(q, brands, { limit }),
      buildModelSuggestions(q, models, inferred, {
        limit,
        currentCitySlug,
      }),
      buildCitySuggestions(q, cities, inferred, {
        limit,
        currentCitySlug,
      }),
      buildComposedSuggestions(inferred, currentCitySlug, { limit }),
    ]);

  return {
    query: q,
    semantic: {
      recognized,
      applicableFilters,
      parser: inferred.free_query_meta || {
        original_q: q,
        parsed: false,
        safe: true,
      },
    },
    suggestions: {
      brands: brandSuggestions,
      models: modelSuggestions,
      cities: citySuggestions,
      composed,
    },
  };
}

export async function getFlatAutocompleteSuggestions(
  rawQuery,
  { currentCitySlug = null, limit = DEFAULT_LIMIT } = {}
) {
  const semantic = await getSemanticAutocomplete(rawQuery, {
    currentCitySlug,
    limit,
  });

  const flat = [
    ...semantic.suggestions.composed,
    ...semantic.suggestions.brands,
    ...semantic.suggestions.models,
    ...semantic.suggestions.cities,
  ];

  return uniqueBy(flat, (item) => `${item.type}:${item.label}`)
    .slice(0, limit)
    .map((item) => ({
      type: item.type,
      label: item.label,
      value: item.value || item.label,
      brand: item.brand || null,
      model: item.model || null,
      city: item.city || null,
      slug: item.slug || null,
      path: item.path || null,
      total: item.total || 0,
      score: item.score || 0,
    }));
}
