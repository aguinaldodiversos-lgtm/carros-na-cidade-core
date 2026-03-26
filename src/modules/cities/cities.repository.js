import { pool } from "../../infrastructure/database/db.js";
import { stateColumnValuesForUf } from "./brazil-state-variants.js";

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

/**
 * Todas as cidades cuja UF (coluna state e/ou sufixo do slug) coincide com a sigla.
 * Evita o corte do dicionário global (LIMIT + ORDER BY ranking) que escondia municípios.
 */
export async function findCitiesByStateVariants(ufNorm) {
  const code = String(ufNorm ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 2);
  if (code.length !== 2) return [];

  const variants = stateColumnValuesForUf(code).map((v) => String(v).trim().toUpperCase());
  const suf = code.toLowerCase();
  const slugPattern = `[-_]${suf}$`;

  const result = await pool.query(
    `
    SELECT
      c.id,
      c.name,
      c.slug,
      c.state,
      COALESCE(cs.ranking_priority, 0) AS ranking_priority,
      COALESCE(cs.territorial_score, 0) AS territorial_score
    FROM cities c
    LEFT JOIN city_scores cs ON cs.city_id = c.id
    WHERE (
      UPPER(TRIM(BOTH FROM COALESCE(c.state::text, ''))) = ANY($1::text[])
      OR (c.slug IS NOT NULL AND c.slug ~* $2)
    )
    ORDER BY
      COALESCE(cs.ranking_priority, 0) DESC,
      c.name ASC
    `,
    [variants, slugPattern]
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
