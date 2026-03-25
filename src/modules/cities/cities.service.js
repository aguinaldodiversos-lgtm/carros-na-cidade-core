import * as citiesRepository from "./cities.repository.js";
import { loadCityDictionary } from "../ads/autocomplete/ads-autocomplete.repository.js";
import { AppError } from "../../shared/middlewares/error.middleware.js";
import { normalizeSearchText } from "../../shared/utils/normalizeSearchText.js";
import { slugify } from "../../shared/utils/slugify.js";
import { inferUfFromSlug } from "../../shared/utils/inferUfFromSlug.js";
import { stateRowMatchesUf } from "./brazil-state-variants.js";

/** Mesmo dicionário do autocomplete global; cache curto para não reler a cada tecla. */
const OFFICIAL_CITIES_CACHE_TTL_MS = Number(
  process.env.CITIES_PANEL_DICTIONARY_CACHE_TTL_MS || 10 * 60 * 1000
);

let officialCitiesCache = { rows: null, loadedAt: 0 };

async function getOfficialCityDictionaryRows() {
  if (
    officialCitiesCache.rows &&
    Date.now() - officialCitiesCache.loadedAt < OFFICIAL_CITIES_CACHE_TTL_MS
  ) {
    return officialCitiesCache.rows;
  }
  const rows = await loadCityDictionary(10000);
  officialCitiesCache = { rows, loadedAt: Date.now() };
  return rows;
}

function normalizeUfInput(uf) {
  return String(uf ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 2);
}

/**
 * Cidade pertence à UF escolhida (coluna state e/ou sufixo do slug oficial).
 */
function rowBelongsToUf(row, ufNorm) {
  if (stateRowMatchesUf(row.state, ufNorm)) return true;
  const fromSlug = inferUfFromSlug(row.slug || "");
  return Boolean(fromSlug && fromSlug === ufNorm);
}

/**
 * Mesma origem de dados do autocomplete global (`/api/ads/autocomplete`): `loadCityDictionary`.
 */
export async function searchCitiesByUfAndPartialName(uf, query, limit = 20) {
  const ufNorm = normalizeUfInput(uf);
  const stripped = String(query ?? "")
    .replace(/[%_]/g, " ")
    .trim();
  const qNorm = normalizeSearchText(stripped);
  if (ufNorm.length !== 2 || qNorm.length < 2) return [];

  const safeLimit = Math.min(50, Math.max(1, Number(limit) || 20));
  const rows = await getOfficialCityDictionaryRows();

  const scored = rows
    .filter((row) => rowBelongsToUf(row, ufNorm))
    .map((row) => {
      const nName = normalizeSearchText(row.name);
      const contains = nName.includes(qNorm);
      const prefix = nName.startsWith(qNorm);
      return { row, contains, prefix };
    })
    .filter((x) => x.contains)
    .sort((a, b) => {
      if (a.prefix !== b.prefix) return a.prefix ? -1 : 1;
      return String(a.row.name).length - String(b.row.name).length;
    })
    .slice(0, safeLimit)
    .map((x) => x.row);

  return scored;
}

/**
 * Resolve por slug oficial e, se necessário, pelo dicionário (mesma lista do autocomplete).
 */
export async function resolveCityByNameAndUf(name, uf) {
  const ufNorm = normalizeUfInput(uf);
  if (ufNorm.length !== 2) return null;

  const rawName = String(name ?? "").trim();
  if (!rawName) return null;

  const citySlugPart = slugify(rawName);
  const candidates = [
    `${citySlugPart}-${ufNorm.toLowerCase()}`,
    citySlugPart,
    slugify(`${rawName} ${ufNorm}`),
  ].filter((s, i, arr) => s && arr.indexOf(s) === i);

  for (const slug of candidates) {
    const row = await citiesRepository.findCityBySlug(slug);
    if (!row) continue;
    if (!rowBelongsToUf(row, ufNorm)) continue;
    return row;
  }

  const target = normalizeSearchText(rawName);
  const dict = await getOfficialCityDictionaryRows();
  for (const row of dict) {
    if (!rowBelongsToUf(row, ufNorm)) continue;
    if (normalizeSearchText(row.name) === target) return row;
  }

  return null;
}

export async function getCityById(id) {
  return citiesRepository.findCityById(id);
}

export async function getTopCitiesByDemand(limit = 20) {
  return citiesRepository.listTopCitiesByDemand(limit);
}

export async function getCityBySlug(slug) {
  const city = await citiesRepository.findCityBySlug(slug);

  if (!city) {
    throw new AppError("Cidade não encontrada", 404);
  }

  return city;
}

export async function getCitiesForExpansion(limit = 100) {
  return citiesRepository.listCitiesForExpansion(limit);
}
