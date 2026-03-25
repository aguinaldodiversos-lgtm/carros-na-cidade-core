import { pool } from "../../infrastructure/database/db.js";
import { slugify } from "../../shared/utils/slugify.js";

function normalizeNameForMatch(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

export async function listTopCitiesByDemand(limit = 20) {
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));

  const result = await pool.query(
    `
    SELECT
      c.id,
      c.name,
      c.state,
      c.slug,
      COALESCE(cm.demand_score, 0) AS demand_score,
      COALESCE(cd.dominance_score, 0) AS dominance_score,
      COALESCE(cd.total_ads, 0) AS total_ads,
      COALESCE(cd.leads, 0) AS leads
    FROM cities c
    LEFT JOIN city_metrics cm ON cm.city_id = c.id
    LEFT JOIN city_dominance cd ON cd.city_id = c.id
    ORDER BY
      COALESCE(cm.demand_score, 0) DESC,
      COALESCE(cd.dominance_score, 0) DESC
    LIMIT $1
    `,
    [safeLimit]
  );

  return result.rows;
}

export async function findCityBySlug(slug) {
  const result = await pool.query(
    `
    SELECT id, name, state, slug, created_at
    FROM cities
    WHERE slug = $1
    LIMIT 1
    `,
    [slug]
  );

  return result.rows[0] || null;
}

export async function findCityById(id) {
  const n = Number(id);
  if (!Number.isFinite(n) || n <= 0) return null;

  const result = await pool.query(
    `
    SELECT id, name, state, slug
    FROM cities
    WHERE id = $1
    LIMIT 1
    `,
    [n]
  );

  return result.rows[0] || null;
}

/**
 * Resolve cidade na base por nome + UF (slug candidatos + nome normalizado sem acentos).
 */
export async function resolveCityByNameAndUf(name, uf) {
  const ufNorm = String(uf ?? "")
    .trim()
    .toUpperCase()
    .slice(0, 2);
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
    const row = await findCityBySlug(slug);
    if (!row) continue;
    const rowState = row.state ? String(row.state).trim().toUpperCase() : "";
    if (rowState && rowState !== ufNorm) continue;
    return row;
  }

  const target = normalizeNameForMatch(rawName);
  const poolResult = await pool.query(
    `
    SELECT id, name, state, slug
    FROM cities
    WHERE UPPER(TRIM(state)) = $1
    `,
    [ufNorm]
  );

  for (const row of poolResult.rows) {
    if (normalizeNameForMatch(row.name) === target) {
      return row;
    }
  }

  return null;
}

/**
 * Busca cidades por UF + trecho do nome (autocomplete).
 */
export async function searchCitiesByUfAndQuery(uf, query, limit = 12) {
  const ufNorm = String(uf ?? "")
    .trim()
    .toUpperCase()
    .slice(0, 2);
  const q = String(query ?? "").trim();
  if (ufNorm.length !== 2 || q.length < 2) return [];

  const safeLimit = Math.min(50, Math.max(1, Number(limit) || 12));
  const stripped = q.replace(/[%_]/g, " ").trim();
  if (stripped.length < 2) return [];

  const pattern = `%${stripped}%`;
  const prefix = `${stripped}%`;

  const result = await pool.query(
    `
    SELECT id, name, state, slug
    FROM cities
    WHERE UPPER(TRIM(state)) = $1
      AND name ILIKE $2
    ORDER BY
      CASE WHEN name ILIKE $3 THEN 0 ELSE 1 END,
      CHAR_LENGTH(name) ASC,
      name ASC
    LIMIT $4
    `,
    [ufNorm, pattern, prefix, safeLimit]
  );

  return result.rows;
}

export async function listCitiesForExpansion(limit = 100) {
  const safeLimit = Math.min(500, Math.max(1, Number(limit) || 100));

  const result = await pool.query(
    `
    SELECT
      c.id,
      c.name,
      c.state,
      c.slug,
      COALESCE(co.opportunity_score, 0) AS opportunity_score,
      COALESCE(co.priority_level, 'low') AS priority_level
    FROM cities c
    LEFT JOIN city_opportunities co ON co.city_id = c.id
    ORDER BY
      COALESCE(co.opportunity_score, 0) DESC,
      c.id ASC
    LIMIT $1
    `,
    [safeLimit]
  );

  return result.rows;
}
