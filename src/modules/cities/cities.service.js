import * as citiesRepository from "./cities.repository.js";
import { isIbgeAutoSeedEnabled, upsertMunicipiosForUfFromIbge } from "./ibge-municipios.service.js";
import { AppError } from "../../shared/middlewares/error.middleware.js";
import { logger } from "../../shared/logger.js";
import { normalizeSearchText } from "../../shared/utils/normalizeSearchText.js";
import { slugify } from "../../shared/utils/slugify.js";
import { inferUfFromSlug } from "../../shared/utils/inferUfFromSlug.js";
import { stateRowMatchesUf } from "./brazil-state-variants.js";

/** Cidades por UF vindas da tabela `cities` (sem corte por ranking global). */
const UF_CITIES_CACHE_TTL_MS = Number(
  process.env.CITIES_PANEL_DICTIONARY_CACHE_TTL_MS || 10 * 60 * 1000
);

const ufCitiesCache = new Map();

async function getCitiesRowsForUf(ufNorm) {
  const cached = ufCitiesCache.get(ufNorm);
  if (cached && Date.now() - cached.loadedAt < UF_CITIES_CACHE_TTL_MS) {
    return cached.rows;
  }

  let rows = await citiesRepository.findCitiesByStateVariants(ufNorm);

  if (rows.length === 0 && isIbgeAutoSeedEnabled()) {
    try {
      await upsertMunicipiosForUfFromIbge(ufNorm);
      ufCitiesCache.delete(ufNorm);
      rows = await citiesRepository.findCitiesByStateVariants(ufNorm);
    } catch (err) {
      logger.warn(
        { err: err?.message || String(err), uf: ufNorm },
        "[cities.service] IBGE auto-seed falhou (painel ainda pode usar dados já existentes)"
      );
    }
  }

  ufCitiesCache.set(ufNorm, { rows, loadedAt: Date.now() });
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
 * Dados da tabela `cities` filtrados por UF (state + sufixo do slug), depois nome parcial em memória.
 */
export async function searchCitiesByUfAndPartialName(uf, query, limit = 20) {
  const ufNorm = normalizeUfInput(uf);
  const stripped = String(query ?? "")
    .replace(/[%_]/g, " ")
    .trim();
  const qNorm = normalizeSearchText(stripped);
  if (ufNorm.length !== 2 || qNorm.length < 2) return [];

  const safeLimit = Math.min(50, Math.max(1, Number(limit) || 20));
  const rows = await getCitiesRowsForUf(ufNorm);

  // findCitiesByStateVariants já restringe à UF (state + slug). Não filtrar de novo aqui:
  // formatos de `state` no banco (ex.: código) ou slug não padrão removiam todas as linhas.
  const scored = rows
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
  const inUf = await getCitiesRowsForUf(ufNorm);
  for (const row of inUf) {
    if (normalizeSearchText(row.name) === target) return row;
  }

  return null;
}

export async function getCityById(id) {
  return citiesRepository.findCityById(id);
}

export async function getTopCitiesByDemand(limit = 20) {
  try {
    return await citiesRepository.listTopCitiesByDemand(limit);
  } catch (err) {
    logger.warn(
      { err: err?.message || String(err) },
      "[cities.service] getTopCitiesByDemand: retornando vazio"
    );
    return [];
  }
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
