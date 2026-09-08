// src/modules/ads/search-policy/location-resolver.js
//
// LocationResolver (§4.2 + D1). Precedência:
//   USER_SELECTED > EXPLICIT_QUERY > CITY_PAGE > GEOLOCATION > SESSION_DEFAULT > NONE
//
// Fontes:
//   USER_SELECTED    origem= com origem_src=user
//   EXPLICIT_QUERY   `q` casa um explicit_query_patterns seguido do NOME de
//                    uma cidade com ≥ 1 ACTIVE próprio; o trecho sai do `q`.
//                    Qualquer outra menção a cidade no texto NÃO move a origem.
//   CITY_PAGE        origem= sem origem_src (D1: é como a busca da página de
//                    cidade chega em /comprar; F3 marca origem_src=page), ou os
//                    parâmetros territoriais legados city_slug / city_slugs[0]
//                    / city_id — para o motor cobrir as rotas atuais antes de F3.
//   GEOLOCATION      origem= com origem_src=geo
//   SESSION_DEFAULT  origem= com origem_src=session (F3 liga ao header)
//   NONE             sem origem → NATIONAL (ou STATE, se `state`/escopo=uf)

import { pool } from "../../../infrastructure/database/db.js";
import { getActiveCityDictionary } from "./dictionaries.js";
import { normalizeText } from "./text.js";

export const LOCATION_SOURCE = Object.freeze({
  USER_SELECTED: "USER_SELECTED",
  EXPLICIT_QUERY: "EXPLICIT_QUERY",
  CITY_PAGE: "CITY_PAGE",
  GEOLOCATION: "GEOLOCATION",
  SESSION_DEFAULT: "SESSION_DEFAULT",
  NONE: "NONE",
});

function firstSlug(value) {
  if (Array.isArray(value)) return value.find((v) => typeof v === "string" && v.trim()) || null;
  if (typeof value === "string" && value.includes(",")) return value.split(",")[0].trim() || null;
  if (typeof value === "string" && value.trim()) return value.trim();
  return null;
}

/**
 * Detecta "em <cidade>" (padrões da política) apontando para cidade com estoque.
 * Puro dado o dicionário. Devolve { city, strippedQ } ou null.
 */
export function detectExplicitCity(q, patterns, activeCities) {
  const text = normalizeText(q);
  if (!text || !Array.isArray(patterns) || !activeCities?.length) return null;

  for (const pattern of patterns) {
    let re;
    try {
      re = new RegExp(`${pattern}([\\p{L}\\s-]{3,60})$`, "iu");
    } catch {
      continue;
    }
    const m = text.match(re);
    if (!m) continue;
    const tail = normalizeText(m[1]);
    let best = null;
    for (const city of activeCities) {
      const cn = city.normalized;
      if (!cn) continue;
      if (tail === cn || tail.startsWith(`${cn} `)) {
        if (!best || cn.length > best.normalized.length) best = city;
      }
    }
    if (!best) continue;
    const fragment = new RegExp(
      `${pattern}${best.normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
      "iu"
    );
    const strippedQ = text.replace(fragment, " ").replace(/\s+/g, " ").trim();
    return { city: best, strippedQ };
  }
  return null;
}

async function findCityBySlug(slug, db) {
  const { rows } = await db.query(
    `SELECT id, slug, name, state, latitude, longitude FROM cities WHERE slug = $1 LIMIT 1`,
    [String(slug).trim().toLowerCase()]
  );
  return rows[0] ? toCity(rows[0]) : null;
}

async function findCityById(id, db) {
  const { rows } = await db.query(
    `SELECT id, slug, name, state, latitude, longitude FROM cities WHERE id = $1 LIMIT 1`,
    [Number(id)]
  );
  return rows[0] ? toCity(rows[0]) : null;
}

function toCity(row) {
  return {
    id: Number(row.id),
    slug: row.slug,
    name: row.name,
    state: row.state ? String(row.state).toUpperCase() : null,
    latitude: row.latitude == null ? null : Number(row.latitude),
    longitude: row.longitude == null ? null : Number(row.longitude),
  };
}

/**
 * @param {object} query parâmetros brutos (origem, origem_src, city_slug, city_slugs, city_id, state, q, escopo)
 * @param {object} policy política carregada (explicit_query_patterns)
 * @param {{ db?, activeCities? }} deps
 * @returns {{ origin: object|null, location_source: string, q: string, uf: string|null }}
 */
export async function resolveLocation(query = {}, policy, deps = {}) {
  const db = deps.db || pool;
  const q = typeof query.q === "string" ? query.q : "";
  const origem = firstSlug(query.origem);
  const src = String(query.origem_src || "")
    .trim()
    .toLowerCase();
  const uf = query.state ? String(query.state).trim().toUpperCase().slice(0, 2) : null;

  // 1. USER_SELECTED
  if (origem && src === "user") {
    const city = await findCityBySlug(origem, db);
    if (city)
      return { origin: city, location_source: LOCATION_SOURCE.USER_SELECTED, q, uf: city.state };
  }

  // 2. EXPLICIT_QUERY
  if (q.trim()) {
    const activeCities = deps.activeCities || (await getActiveCityDictionary(db));
    const explicit = detectExplicitCity(q, policy?.explicit_query_patterns, activeCities);
    if (explicit) {
      const city = await findCityBySlug(explicit.city.slug, db);
      if (city) {
        return {
          origin: city,
          location_source: LOCATION_SOURCE.EXPLICIT_QUERY,
          q: explicit.strippedQ,
          uf: city.state,
        };
      }
    }
  }

  // 3. CITY_PAGE — origem sem src / origem_src=page, ou território legado.
  const pageSlug =
    (origem && (!src || src === "page") ? origem : null) ||
    firstSlug(query.city_slug) ||
    firstSlug(query["city_slugs[]"]) ||
    firstSlug(query.city_slugs);
  if (pageSlug) {
    const city = await findCityBySlug(pageSlug, db);
    if (city)
      return { origin: city, location_source: LOCATION_SOURCE.CITY_PAGE, q, uf: city.state };
  }
  if (query.city_id != null && Number.isFinite(Number(query.city_id))) {
    const city = await findCityById(query.city_id, db);
    if (city)
      return { origin: city, location_source: LOCATION_SOURCE.CITY_PAGE, q, uf: city.state };
  }

  // 4. GEOLOCATION / 5. SESSION_DEFAULT
  if (origem && (src === "geo" || src === "session")) {
    const city = await findCityBySlug(origem, db);
    if (city) {
      return {
        origin: city,
        location_source:
          src === "geo" ? LOCATION_SOURCE.GEOLOCATION : LOCATION_SOURCE.SESSION_DEFAULT,
        q,
        uf: city.state,
      };
    }
  }

  // 6. NONE
  return { origin: null, location_source: LOCATION_SOURCE.NONE, q, uf };
}
