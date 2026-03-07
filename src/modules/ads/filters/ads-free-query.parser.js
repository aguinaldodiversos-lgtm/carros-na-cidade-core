// src/modules/ads/filters/ads-free-query.parser.js

import {
  BELOW_FIPE_TERMS,
  BODY_TYPE_SYNONYMS,
  FREE_QUERY_CACHE_TTL_MS,
  FREE_QUERY_MAX_TERMS,
  FREE_QUERY_MIN_TOKEN_LENGTH,
  FREE_QUERY_STOPWORDS,
  FUEL_SYNONYMS,
  HIGHLIGHT_TERMS,
  TRANSMISSION_SYNONYMS,
} from "./ads-free-query.constants.js";
import {
  loadBrandDictionary,
  loadCityDictionary,
  loadModelDictionary,
} from "./ads-free-query.repository.js";

const dictionaryCache = {
  brands: { data: null, loadedAt: 0 },
  models: { data: null, loadedAt: 0 },
  cities: { data: null, loadedAt: 0 },
};

function now() {
  return Date.now();
}

function isCacheFresh(entry) {
  return entry.data && now() - entry.loadedAt < FREE_QUERY_CACHE_TTL_MS;
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s./,-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text) {
  return normalizeText(text)
    .split(" ")
    .map((token) => token.trim())
    .filter(
      (token) =>
        token &&
        token.length >= FREE_QUERY_MIN_TOKEN_LENGTH &&
        !FREE_QUERY_STOPWORDS.has(token)
    )
    .slice(0, FREE_QUERY_MAX_TERMS);
}

function uniquePush(list, item, comparator = (a, b) => a === b) {
  if (!list.some((existing) => comparator(existing, item))) {
    list.push(item);
  }
}

async function getBrandDictionary() {
  if (isCacheFresh(dictionaryCache.brands)) return dictionaryCache.brands.data;

  const rows = await loadBrandDictionary();
  dictionaryCache.brands = {
    data: rows.map((row) => ({
      original: row.brand,
      normalized: normalizeText(row.brand),
      total: Number(row.total || 0),
    })),
    loadedAt: now(),
  };

  return dictionaryCache.brands.data;
}

async function getModelDictionary() {
  if (isCacheFresh(dictionaryCache.models)) return dictionaryCache.models.data;

  const rows = await loadModelDictionary();
  dictionaryCache.models = {
    data: rows.map((row) => ({
      brand: row.brand,
      brandNormalized: normalizeText(row.brand),
      original: row.model,
      normalized: normalizeText(row.model),
      total: Number(row.total || 0),
    })),
    loadedAt: now(),
  };

  return dictionaryCache.models.data;
}

async function getCityDictionary() {
  if (isCacheFresh(dictionaryCache.cities)) return dictionaryCache.cities.data;

  const rows = await loadCityDictionary();
  dictionaryCache.cities = {
    data: rows.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      state: row.state,
      normalizedName: normalizeText(row.name),
    })),
    loadedAt: now(),
  };

  return dictionaryCache.cities.data;
}

function extractPriceSignals(text) {
  const normalized = normalizeText(text);

  let min_price;
  let max_price;

  const parseMoney = (raw) => {
    const clean = String(raw).replace(/\./g, "").replace(",", ".").trim();
    const numeric = Number(clean);
    if (!Number.isFinite(numeric)) return undefined;
    if (numeric < 1000) return Math.round(numeric * 1000);
    return Math.round(numeric);
  };

  const betweenRegex =
    /\b(?:entre|de)\s+(\d{1,3}(?:[.,]\d{3})*|\d+(?:[.,]\d+)?)\s*(mil|k)?\s+(?:e|a|ate|até)\s+(\d{1,3}(?:[.,]\d{3})*|\d+(?:[.,]\d+)?)\s*(mil|k)?\b/i;

  const maxRegex =
    /\b(?:ate|até|no maximo|no máximo|maximo|max)\s+(\d{1,3}(?:[.,]\d{3})*|\d+(?:[.,]\d+)?)\s*(mil|k)?\b/i;

  const minRegex =
    /\b(?:acima de|mais de|a partir de|minimo|minimo de|mínimo|mínimo de)\s+(\d{1,3}(?:[.,]\d{3})*|\d+(?:[.,]\d+)?)\s*(mil|k)?\b/i;

  const betweenMatch = normalized.match(betweenRegex);
  if (betweenMatch) {
    const left = parseMoney(betweenMatch[1]);
    const right = parseMoney(betweenMatch[3]);

    min_price = betweenMatch[2] ? left : left;
    max_price = betweenMatch[4] ? right : right;

    return {
      min_price,
      max_price,
    };
  }

  const maxMatch = normalized.match(maxRegex);
  if (maxMatch) {
    max_price = parseMoney(maxMatch[1]);
    if (maxMatch[2]) max_price = parseMoney(maxMatch[1]);
  }

  const minMatch = normalized.match(minRegex);
  if (minMatch) {
    min_price = parseMoney(minMatch[1]);
    if (minMatch[2]) min_price = parseMoney(minMatch[1]);
  }

  const compactRegex = /\b(\d{1,3})\s*(mil|k)\b/gi;
  const compactMatches = [...normalized.matchAll(compactRegex)];
  if (!min_price && !max_price && compactMatches.length === 1) {
    const inferred = parseMoney(compactMatches[0][1]);
    max_price = inferred;
  }

  return {
    min_price,
    max_price,
  };
}

function extractYearSignals(text) {
  const matches = [...normalizeText(text).matchAll(/\b(19\d{2}|20\d{2}|2100)\b/g)]
    .map((match) => Number(match[1]))
    .filter((year) => year >= 1900 && year <= 2100);

  if (!matches.length) {
    return {};
  }

  if (matches.length === 1) {
    return {
      year_min: matches[0],
      year_max: matches[0],
    };
  }

  return {
    year_min: Math.min(...matches),
    year_max: Math.max(...matches),
  };
}

function extractSynonymValue(text, map) {
  const normalized = normalizeText(text);

  for (const [canonical, variants] of Object.entries(map)) {
    if (variants.some((variant) => normalized.includes(normalizeText(variant)))) {
      return canonical;
    }
  }

  return undefined;
}

function extractBooleanByTerms(text, terms) {
  const normalized = normalizeText(text);
  return terms.some((term) => normalized.includes(normalizeText(term)));
}

function scoreContainedPhrase(text, phrase) {
  return normalizeText(text).includes(normalizeText(phrase));
}

function pickBestMatch(text, candidates, key = "normalized") {
  const normalizedText = normalizeText(text);
  let best = null;

  for (const candidate of candidates) {
    const phrase = candidate[key];
    if (!phrase) continue;
    if (!scoreContainedPhrase(normalizedText, phrase)) continue;

    if (!best) {
      best = candidate;
      continue;
    }

    const bestLength = String(best[key]).length;
    const currentLength = String(phrase).length;

    if (currentLength > bestLength) {
      best = candidate;
      continue;
    }

    if (currentLength === bestLength && Number(candidate.total || 0) > Number(best.total || 0)) {
      best = candidate;
    }
  }

  return best;
}

async function inferBrandAndModel(text) {
  const [brands, models] = await Promise.all([
    getBrandDictionary(),
    getModelDictionary(),
  ]);

  const brandMatch = pickBestMatch(text, brands, "normalized");

  let modelCandidates = models;
  if (brandMatch) {
    modelCandidates = models.filter(
      (item) => item.brandNormalized === brandMatch.normalized
    );
  }

  const modelMatch = pickBestMatch(text, modelCandidates, "normalized");

  return {
    brand: brandMatch?.original,
    model: modelMatch?.original,
  };
}

async function inferCity(text) {
  const cities = await getCityDictionary();

  const directMatch = pickBestMatch(text, cities, "normalizedName");
  if (directMatch) {
    return {
      city_id: directMatch.id,
      city_slug: directMatch.slug,
      city: directMatch.name,
      state: directMatch.state,
    };
  }

  const normalized = normalizeText(text);
  const emMatch = normalized.match(/\bem\s+([a-z\s-]{3,60})$/i);

  if (emMatch) {
    const tail = normalizeText(emMatch[1]);
    const tailCandidate = cities.find(
      (city) => city.normalizedName === tail || city.normalizedName.startsWith(tail)
    );

    if (tailCandidate) {
      return {
        city_id: tailCandidate.id,
        city_slug: tailCandidate.slug,
        city: tailCandidate.name,
        state: tailCandidate.state,
      };
    }
  }

  return {};
}

function buildCleanResidualQuery(text, inferred = {}) {
  let residual = normalizeText(text);

  for (const value of [
    inferred.brand,
    inferred.model,
    inferred.city,
    inferred.fuel_type,
    inferred.transmission,
    inferred.body_type,
  ]) {
    if (!value) continue;
    residual = residual.replace(new RegExp(`\\b${normalizeText(value)}\\b`, "gi"), " ");
  }

  residual = residual
    .replace(/\b(ate|até|acima de|mais de|entre|de|e|a partir de|minimo|minimo de|mínimo|mínimo de)\b/gi, " ")
    .replace(/\b\d{1,3}(?:[.,]\d{3})*\b/g, " ")
    .replace(/\b(19\d{2}|20\d{2}|2100)\b/g, " ")
    .replace(/\b(mil|k)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const tokens = tokenize(residual);
  return tokens.length >= 2 ? tokens.join(" ") : undefined;
}

export async function inferAdsFiltersFromFreeQuery(filters = {}) {
  const originalQ = String(filters.q || "").trim();

  if (!originalQ || originalQ.length < 2) {
    return {
      ...filters,
      free_query_meta: {
        original_q: originalQ || null,
        parsed: false,
        safe: true,
      },
    };
  }

  try {
    const [brandModel, citySignals] = await Promise.all([
      inferBrandAndModel(originalQ),
      inferCity(originalQ),
    ]);

    const priceSignals = extractPriceSignals(originalQ);
    const yearSignals = extractYearSignals(originalQ);
    const fuel_type = extractSynonymValue(originalQ, FUEL_SYNONYMS);
    const transmission = extractSynonymValue(originalQ, TRANSMISSION_SYNONYMS);
    const body_type = extractSynonymValue(originalQ, BODY_TYPE_SYNONYMS);
    const below_fipe = extractBooleanByTerms(originalQ, BELOW_FIPE_TERMS)
      ? true
      : filters.below_fipe;
    const highlight_only = extractBooleanByTerms(originalQ, HIGHLIGHT_TERMS)
      ? true
      : filters.highlight_only;

    const merged = {
      ...filters,
      ...citySignals,
      ...yearSignals,
      ...Object.fromEntries(
        Object.entries({
          brand: filters.brand || brandModel.brand,
          model: filters.model || brandModel.model,
          min_price: filters.min_price ?? priceSignals.min_price,
          max_price: filters.max_price ?? priceSignals.max_price,
          fuel_type: filters.fuel_type || fuel_type,
          transmission: filters.transmission || transmission,
          body_type: filters.body_type || body_type,
          below_fipe,
          highlight_only,
        }).filter(([, value]) => value !== undefined)
      ),
    };

    const residualQ = buildCleanResidualQuery(originalQ, {
      ...brandModel,
      ...citySignals,
      fuel_type,
      transmission,
      body_type,
    });

    merged.q = residualQ || originalQ;

    merged.free_query_meta = {
      original_q: originalQ,
      parsed: true,
      safe: true,
      inferred: {
        brand: merged.brand || null,
        model: merged.model || null,
        city_slug: merged.city_slug || null,
        min_price: merged.min_price ?? null,
        max_price: merged.max_price ?? null,
        year_min: merged.year_min ?? null,
        year_max: merged.year_max ?? null,
        fuel_type: merged.fuel_type || null,
        transmission: merged.transmission || null,
        body_type: merged.body_type || null,
        below_fipe: merged.below_fipe ?? null,
      },
    };

    return merged;
  } catch {
    return {
      ...filters,
      free_query_meta: {
        original_q: originalQ,
        parsed: false,
        safe: true,
      },
    };
  }
}
