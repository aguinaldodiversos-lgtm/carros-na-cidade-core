import axios from "axios";
import { logger } from "../../shared/logger.js";

const TEXT_SEARCH_URL = "https://maps.googleapis.com/maps/api/place/textsearch/json";
const PLACE_DETAILS_URL = "https://maps.googleapis.com/maps/api/place/details/json";

function getApiKey() {
  return String(process.env.GOOGLE_PLACES_API_KEY || "").trim();
}

/**
 * @param {{ name: string, state?: string|null }} city
 * @param {string} queryTemplate
 */
function buildQuery(city, queryTemplate) {
  const uf = city.state ? ` ${city.state}` : "";
  return queryTemplate.replace(/\{city\}/g, `${city.name}${uf}`.trim());
}

/**
 * @param {{ name: string, state?: string|null }} city
 * @returns {Promise<Array<{ name: string, address?: string, place_id: string }>>}
 */
export async function textSearchCarDealers(city, queryTemplate) {
  const key = getApiKey();
  if (!key) {
    logger.warn("[google-places] GOOGLE_PLACES_API_KEY ausente");
    return [];
  }

  const query = queryTemplate
    ? buildQuery(city, queryTemplate)
    : `revenda de carros usados em ${city.name}${city.state ? ` ${city.state}` : ""}`;

  try {
    const response = await axios.get(TEXT_SEARCH_URL, {
      params: { query, key },
      timeout: 20000,
    });

    const status = response.data?.status;
    if (status && status !== "OK" && status !== "ZERO_RESULTS") {
      logger.warn({ status, query }, "[google-places] text search status inesperado");
    }

    const results = response.data?.results || [];

    return results.map((place) => ({
      name: place.name,
      address: place.formatted_address,
      place_id: place.place_id,
    }));
  } catch (err) {
    logger.error({ err: err?.message || String(err) }, "[google-places] text search falhou");
    return [];
  }
}

/**
 * Busca várias páginas quando há next_page_token (intervalo mínimo ~2s).
 * @param {{ name: string, state?: string|null }} city
 * @param {string} queryTemplate
 * @param {number} maxPages
 */
export async function textSearchCarDealersPaged(city, queryTemplate, maxPages = 2) {
  const key = getApiKey();
  if (!key) return [];

  const query =
    buildQuery(city, queryTemplate) ||
    `revenda de carros em ${city.name}${city.state ? ` ${city.state}` : ""}`;

  const aggregated = [];
  let nextPageToken = null;
  let page = 0;

  while (page < maxPages) {
    const params = { key };
    if (nextPageToken) {
      params.pagetoken = nextPageToken;
    } else {
      params.query = query;
    }

    try {
      const response = await axios.get(TEXT_SEARCH_URL, {
        params,
        timeout: 25000,
      });

      const status = response.data?.status;
      if (status === "INVALID_REQUEST" && nextPageToken) {
        await delay(2200);
        continue;
      }

      const results = response.data?.results || [];
      for (const place of results) {
        aggregated.push({
          name: place.name,
          address: place.formatted_address,
          place_id: place.place_id,
        });
      }

      nextPageToken = response.data?.next_page_token || null;
      if (!nextPageToken) break;

      page += 1;
      await delay(2200);
    } catch (err) {
      logger.error({ err: err?.message || String(err) }, "[google-places] página falhou");
      break;
    }
  }

  return aggregated;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @param {string} placeId
 * @returns {Promise<{ name?: string, phone?: string|null, raw?: object }|null>}
 */
export async function fetchPlaceDetails(placeId) {
  const key = getApiKey();
  if (!key || !placeId) return null;

  try {
    const response = await axios.get(PLACE_DETAILS_URL, {
      params: {
        place_id: placeId,
        fields: "name,formatted_phone_number,international_phone_number,formatted_address,geometry",
        key,
      },
      timeout: 20000,
    });

    const result = response.data?.result;
    if (!result) return null;

    const phone = result.international_phone_number || result.formatted_phone_number || null;

    return {
      name: result.name,
      phone,
      address: result.formatted_address,
      raw: result,
    };
  } catch (err) {
    logger.error({ err: err?.message || String(err), placeId }, "[google-places] details falhou");
    return null;
  }
}

function dedupeByPlaceId(results) {
  const map = new Map();
  for (const r of results) {
    if (r.place_id && !map.has(r.place_id)) {
      map.set(r.place_id, r);
    }
  }
  return [...map.values()];
}

export const DEFAULT_QUERIES = [
  "revenda de carros usados em {city}",
  "loja de carros seminovos em {city}",
  "concessionária carros em {city}",
];

/**
 * @param {{ name: string, state?: string|null }} city
 * @param {number} maxPlaces
 */
export async function collectCarDealerPlaces(city, maxPlaces = 40) {
  const all = [];
  const queries = process.env.GOOGLE_PLACES_QUERIES
    ? String(process.env.GOOGLE_PLACES_QUERIES)
        .split("|")
        .map((s) => s.trim())
        .filter(Boolean)
    : DEFAULT_QUERIES;

  for (const q of queries) {
    if (all.length >= maxPlaces) break;
    const batch = await textSearchCarDealersPaged(city, q, 1);
    all.push(...batch);
  }

  const unique = dedupeByPlaceId(all);
  return unique.slice(0, maxPlaces);
}
