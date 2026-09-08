// src/modules/ads/search-policy/dictionaries.js
//
// Dicionários do resolvedor v1 (D2): reutiliza os do parser legado (marca e
// modelo FIPE, via ads-free-query.repository.js) e acrescenta dois que só o
// motor precisa:
//   • modelos comerciais — DISTINCT ads.commercial_model dos ativos (F1);
//   • cidades com estoque — só cidades com ≥ 1 ACTIVE próprio, porque é a
//     única condição em que o texto pode mover a origem (§4.2 EXPLICIT_QUERY).
//
// Cache em memória com o mesmo TTL do legado (FREE_QUERY_CACHE_TTL_MS, 10 min).
// Não passa pelo policy-cache: são dicionários pequenos e o legado já usa
// este padrão. `resetDictionariesForTests()` zera tudo.

import { pool } from "../../../infrastructure/database/db.js";
import { AD_STATUS } from "../ads.canonical.constants.js";
import { DIRTY_AD_FIELDS_SQL } from "../filters/ads-filter.builder.js";
import { FREE_QUERY_CACHE_TTL_MS } from "../filters/ads-free-query.constants.js";
import { normalizeText } from "./text.js";

const cache = new Map(); // name → { value, expiresAt }

async function cached(name, loader) {
  const hit = cache.get(name);
  if (hit && hit.expiresAt > Date.now()) return hit.value;
  const value = await loader();
  cache.set(name, { value, expiresAt: Date.now() + FREE_QUERY_CACHE_TTL_MS });
  return value;
}

/** Mesmo SELECT de ads-free-query.repository.js#loadBrandDictionary (limite 300,
 *  guard de dados sujos), mas honrando o db recebido — o legado usa o pool
 *  global e ignoraria o banco descartável dos testes de integração. */
export async function loadBrandDictionary(db = pool, limit = 300) {
  const { rows } = await db.query(
    `SELECT a.brand, COUNT(*)::int AS total
       FROM ads a
      WHERE a.status = '${AD_STATUS.ACTIVE}'
        AND a.brand IS NOT NULL
        AND ${DIRTY_AD_FIELDS_SQL}
      GROUP BY a.brand
      ORDER BY total DESC, a.brand ASC
      LIMIT $1`,
    [limit]
  );
  return rows;
}

/** Marca: rótulo bruto + normalizado + a parte após " - " ("GM - Chevrolet" → "chevrolet"). */
export async function getBrandDictionary(db = pool) {
  return cached("brands", async () => {
    const rows = await loadBrandDictionary(db);
    return rows.map((r) => {
      const normalized = normalizeText(r.brand);
      const suffix = normalized.includes(" - ") ? normalized.split(" - ").pop().trim() : null;
      return { original: r.brand, normalized, suffix, total: Number(r.total || 0) };
    });
  });
}

export async function loadCommercialModelDictionary(db = pool) {
  const { rows } = await db.query(
    `SELECT a.commercial_model, a.brand, COUNT(*)::int AS total
       FROM ads a
      WHERE a.status = '${AD_STATUS.ACTIVE}'
        AND a.commercial_model IS NOT NULL
        AND ${DIRTY_AD_FIELDS_SQL}
      GROUP BY a.commercial_model, a.brand
      ORDER BY total DESC, a.commercial_model ASC`
  );
  return rows.map((r) => ({
    label: r.commercial_model,
    normalized: normalizeText(r.commercial_model),
    brand: r.brand,
    brandNormalized: normalizeText(r.brand),
    total: Number(r.total || 0),
  }));
}

export async function getCommercialModelDictionary(db = pool) {
  return cached("commercial_models", () => loadCommercialModelDictionary(db));
}

/** Cidades com ≥ 1 ACTIVE próprio — as únicas que o texto pode escolher.
 *  Só colunas versionadas: cities.normalized_name existe em produção mas não
 *  vem de migration nenhuma (banco descartável dos testes não a tem); a forma
 *  normalizada é derivada de name com o mesmo normalizeText aplicado ao q. */
export async function loadActiveCityDictionary(db = pool) {
  const { rows } = await db.query(
    `SELECT c.id, c.slug, c.name, c.state, c.latitude, c.longitude,
            COUNT(a.id)::int AS active
       FROM cities c
       JOIN ads a ON a.city_id = c.id AND a.status = '${AD_STATUS.ACTIVE}'
      GROUP BY c.id
      ORDER BY active DESC, c.name ASC`
  );
  return rows.map((r) => ({
    id: Number(r.id),
    slug: r.slug,
    name: r.name,
    state: r.state,
    latitude: r.latitude == null ? null : Number(r.latitude),
    longitude: r.longitude == null ? null : Number(r.longitude),
    normalized: normalizeText(r.name),
    active: Number(r.active || 0),
  }));
}

export async function getActiveCityDictionary(db = pool) {
  return cached("active_cities", () => loadActiveCityDictionary(db));
}

export function resetDictionariesForTests() {
  cache.clear();
}
