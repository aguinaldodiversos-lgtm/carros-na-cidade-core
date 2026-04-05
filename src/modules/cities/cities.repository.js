import { pool } from "../../infrastructure/database/db.js";
import { getTableColumnSet, tableHasColumn } from "../../shared/db/table-columns.js";
import { logger } from "../../shared/logger.js";
import { inferUfFromSlug } from "../../shared/utils/inferUfFromSlug.js";
import { stateColumnValuesForUf } from "./brazil-state-variants.js";

async function hasTable(tableName) {
  const cols = await getTableColumnSet(tableName);
  return cols.size > 0;
}

export async function listTopCitiesByDemand(limit = 20) {
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));

  const citiesCols = await getTableColumnSet("cities");
  if (!tableHasColumn(citiesCols, "id")) {
    return [];
  }

  const hasMetrics =
    (await hasTable("city_metrics")) &&
    (await getTableColumnSet("city_metrics")).has("demand_score");
  const hasDominance =
    (await hasTable("city_dominance")) &&
    (await getTableColumnSet("city_dominance")).has("dominance_score");

  if (hasMetrics && hasDominance) {
    try {
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
    } catch (err) {
      logger.warn(
        { err: err?.message || String(err) },
        "[cities.repository] listTopCitiesByDemand: métricas indisponíveis, usando fallback simples"
      );
    }
  }

  try {
    const result = await pool.query(
      `
      SELECT id, name, state, slug
      FROM cities
      ORDER BY name ASC
      LIMIT $1
      `,
      [safeLimit]
    );
    return result.rows;
  } catch (err) {
    logger.error(
      { err: err?.message || String(err) },
      "[cities.repository] listTopCitiesByDemand falhou"
    );
    return [];
  }
}

/**
 * Todas as cidades cuja UF (coluna state e/ou sufixo do slug) coincide com a sigla.
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

  const hasScores =
    (await hasTable("city_scores")) &&
    (await getTableColumnSet("city_scores")).has("ranking_priority");

  const orderByScores = hasScores
    ? `COALESCE(cs.ranking_priority, 0) DESC, COALESCE(cs.territorial_score, 0) DESC, c.name ASC`
    : `c.name ASC`;

  const joinScores = hasScores ? `LEFT JOIN city_scores cs ON cs.city_id = c.id` : "";

  const selectScores = hasScores
    ? `COALESCE(cs.ranking_priority, 0) AS ranking_priority,
       COALESCE(cs.territorial_score, 0) AS territorial_score`
    : `0::int AS ranking_priority,
       0::int AS territorial_score`;

  try {
    const result = await pool.query(
      `
      SELECT
        c.id,
        c.name,
        c.slug,
        c.state,
        ${selectScores}
      FROM cities c
      ${joinScores}
      WHERE (
        UPPER(TRIM(BOTH FROM COALESCE(c.state::text, ''))) = ANY($1::text[])
        OR (c.slug IS NOT NULL AND c.slug ~* $2)
      )
      ORDER BY ${orderByScores}
      `,
      [variants, slugPattern]
    );
    return result.rows;
  } catch (err) {
    logger.warn(
      { err: err?.message || String(err), uf: code },
      "[cities.repository] findCitiesByStateVariants: tentando query mínima"
    );
    try {
      const result = await pool.query(
        `
        SELECT
          c.id,
          c.name,
          c.slug,
          c.state,
          0::int AS ranking_priority,
          0::int AS territorial_score
        FROM cities c
        WHERE (
          UPPER(TRIM(BOTH FROM COALESCE(c.state::text, ''))) = ANY($1::text[])
          OR (c.slug IS NOT NULL AND c.slug ~* $2)
        )
        ORDER BY c.name ASC
        `,
        [variants, slugPattern]
      );
      return result.rows;
    } catch (err2) {
      logger.error(
        { err: err2?.message || String(err2), uf: code },
        "[cities.repository] findCitiesByStateVariants falhou"
      );
      return [];
    }
  }
}

export async function findCityBySlug(slug) {
  try {
    const result = await pool.query(
      `
      SELECT id, name, state, slug
      FROM cities
      WHERE slug = $1
      LIMIT 1
      `,
      [slug]
    );

    return result.rows[0] || null;
  } catch (err) {
    logger.error({ err: err?.message || String(err) }, "[cities.repository] findCityBySlug falhou");
    return null;
  }
}

/**
 * Quando o catálogo público está vazio para um território, resolve slug alternativo
 * com anúncios ativos: prioriza mesma UF (mais anúncios), depois qualquer cidade com estoque.
 */
export async function findCatalogAdsTerritoryFallback(slug) {
  const normalizedSlug = String(slug ?? "")
    .trim()
    .toLowerCase();
  if (!normalizedSlug) return null;

  try {
    const cityResult = await pool.query(
      `
      SELECT id, name, state, slug
      FROM cities
      WHERE slug = $1
      LIMIT 1
      `,
      [normalizedSlug]
    );

    const city = cityResult.rows[0];
    if (!city) return null;

    const countResult = await pool.query(
      `
      SELECT COUNT(*)::int AS n
      FROM ads a
      WHERE a.city_id = $1
        AND a.status = 'active'
      `,
      [city.id]
    );

    const liveCount = Number(countResult.rows[0]?.n || 0);
    if (liveCount > 0) {
      return {
        mode: "self",
        slug: city.slug,
        name: city.name,
        state: city.state,
        live_ads: liveCount,
      };
    }

    let stateRef = String(city.state ?? "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z]/g, "")
      .slice(0, 2);
    if (stateRef.length !== 2) {
      stateRef = inferUfFromSlug(city.slug || normalizedSlug) || "";
    }

    if (stateRef.length === 2) {
      const sameState = await pool.query(
        `
        SELECT
          c.slug,
          c.name,
          c.state,
          COUNT(a.id)::int AS live_ads
        FROM cities c
        INNER JOIN ads a
          ON a.city_id = c.id
         AND a.status = 'active'
        WHERE UPPER(TRIM(BOTH FROM COALESCE(c.state::text, ''))) = $1
          AND c.id <> $2
        GROUP BY c.id, c.slug, c.name, c.state
        ORDER BY live_ads DESC, c.name ASC
        LIMIT 1
        `,
        [stateRef, city.id]
      );

      const row = sameState.rows[0];
      if (row?.slug) {
        return {
          mode: "fallback",
          slug: row.slug,
          name: row.name,
          state: row.state,
          live_ads: Number(row.live_ads || 0),
        };
      }
    }

    const globalFallback = await pool.query(
      `
      SELECT
        c.slug,
        c.name,
        c.state,
        COUNT(a.id)::int AS live_ads
      FROM cities c
      INNER JOIN ads a
        ON a.city_id = c.id
       AND a.status = 'active'
      GROUP BY c.id, c.slug, c.name, c.state
      ORDER BY live_ads DESC, c.name ASC
      LIMIT 1
      `
    );

    const g = globalFallback.rows[0];
    if (!g?.slug) {
      return {
        mode: "empty",
        slug: city.slug,
        name: city.name,
        state: city.state,
        live_ads: 0,
      };
    }

    return {
      mode: "fallback",
      slug: g.slug,
      name: g.name,
      state: g.state,
      live_ads: Number(g.live_ads || 0),
    };
  } catch (err) {
    logger.error(
      { err: err?.message || String(err), slug: normalizedSlug },
      "[cities.repository] findCatalogAdsTerritoryFallback falhou"
    );
    return null;
  }
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

  const hasOpp =
    (await hasTable("city_opportunities")) &&
    (await getTableColumnSet("city_opportunities")).has("opportunity_score");

  if (hasOpp) {
    try {
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
    } catch (err) {
      logger.warn(
        { err: err?.message || String(err) },
        "[cities.repository] listCitiesForExpansion: oportunidades indisponíveis"
      );
    }
  }

  try {
    const result = await pool.query(
      `
      SELECT id, name, state, slug
      FROM cities
      ORDER BY id ASC
      LIMIT $1
      `,
      [safeLimit]
    );
    return result.rows;
  } catch (err) {
    logger.error(
      { err: err?.message || String(err) },
      "[cities.repository] listCitiesForExpansion falhou"
    );
    return [];
  }
}
