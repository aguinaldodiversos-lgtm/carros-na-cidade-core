import { pool } from "../../../infrastructure/database/db.js";
import { VALID_SLUG_REGEX } from "./cluster-plan-canonical-transform.js";

/**
 * SQL primário: lê do ranking territorial (`city_scores`).
 *
 * É a fonte preferencial em regime estável — `city_scores` reflete
 * `territorial_score` + `ranking_priority` calculados pelo pipeline de
 * scoring (worker próprio). Quando essa tabela está populada, o planner
 * deve respeitar essa ordenação.
 */
const SQL_PRIMARY = `
  SELECT
    cs.city_id,
    c.name,
    c.state,
    c.slug,
    cs.stage,
    cs.territorial_score,
    cs.ranking_priority,
    cs.total_ads,
    cs.total_leads
  FROM city_scores cs
  JOIN cities c ON c.id = cs.city_id
  ORDER BY
    cs.ranking_priority DESC,
    cs.territorial_score DESC
  LIMIT $1
`;

/**
 * SQL de fallback (bootstrap inicial): seleciona cidades com anúncios
 * ativos e slug **canônico** (ASCII + UF), ordenadas pelo volume de anúncios.
 *
 * Por que existe?
 * Em ambientes onde `city_scores` ainda não foi alimentada (bootstrap
 * inicial — cf. docs/runbooks/cluster-planner-bootstrap.md §10), o SQL
 * primário retorna [] e o planner para sem gerar nenhum cluster plan.
 * Este fallback usa a cardinalidade de `ads` (status='active') para
 * eleger as N cidades com maior densidade de anúncios — proxy razoável
 * de "cidades com conteúdo real para indexar".
 *
 * Filtro de slug:
 * O regex `^[a-z0-9-]+-[a-z]{2}$` é a fonte única de verdade definida
 * em `cluster-plan-canonical-transform.js#VALID_SLUG_REGEX`. Aqui é
 * embutido via `.source`. Slugs malformados (`sæo-paulo`, `sao-paulo`
 * sem UF, com acento, etc.) ficam fora do bootstrap inicial — cleanup
 * de dados é runbook próprio (`cities-slug-cleanup.md`).
 *
 * Read-only por construção: SELECT puro, sem CTE de escrita, sem trigger.
 *
 * Shape compatível com o SQL primário — campos preenchidos com defaults
 * seguros para que `buildCityClusterPlan` e `buildStageClusters`
 * funcionem sem ramificações:
 *   - stage = 'seed' → menor brand/model limit (resolveBrandLimitByStage),
 *     coerente com a fase de bootstrap.
 *   - territorial_score / ranking_priority / total_ads = active_ads
 *     (proxy local; será sobrescrito quando o scoring real rodar).
 *   - total_leads = 0 (sem fonte de leads no bootstrap).
 */
const SQL_FALLBACK_ADS = `
  SELECT
    c.id AS city_id,
    c.name,
    c.state,
    c.slug,
    'seed'::text AS stage,
    COUNT(a.id)::int AS active_ads
  FROM cities c
  JOIN ads a ON a.city_id = c.id
  WHERE a.status = 'active'
    AND a.city_id IS NOT NULL
    AND c.slug IS NOT NULL
    AND c.slug <> ''
    AND c.slug ~ '${VALID_SLUG_REGEX.source}'
  GROUP BY c.id, c.name, c.state, c.slug
  ORDER BY COUNT(a.id) DESC, c.id ASC
  LIMIT $1
`;

function projectFallbackRow(row) {
  // Mapeia o shape do fallback para o mesmo formato do SQL primário,
  // de modo que callers não precisem distinguir as duas fontes.
  const activeAds = Number(row.active_ads) || 0;
  return {
    city_id: row.city_id,
    name: row.name,
    state: row.state,
    slug: row.slug,
    stage: row.stage || "seed",
    territorial_score: activeAds,
    ranking_priority: activeAds,
    total_ads: activeAds,
    total_leads: 0,
  };
}

/**
 * Lista as top-N cidades para planejamento de cluster.
 *
 * Estratégia em duas fases:
 *   1. Fonte primária (`city_scores`). Se retornar ≥ 1 linha, usar.
 *   2. Fallback (`ads` + `cities`). Só executa quando primária retorna [].
 *
 * Não faz nenhuma escrita. Em regime estável (city_scores populada), o
 * fallback nunca é tocado.
 */
export async function listTopCitiesForClusterPlanning(limit = 200) {
  const safeLimit = Math.min(2000, Math.max(1, Number(limit) || 200));

  const primary = await pool.query(SQL_PRIMARY, [safeLimit]);
  if (primary.rows.length > 0) {
    return primary.rows;
  }

  const fallback = await pool.query(SQL_FALLBACK_ADS, [safeLimit]);
  return fallback.rows.map(projectFallbackRow);
}

export async function listTopBrandsByCity(cityId, limit = 12) {
  const safeLimit = Math.min(50, Math.max(1, Number(limit) || 12));

  const result = await pool.query(
    `
    SELECT
      a.brand,
      COUNT(*)::int AS total
    FROM ads a
    WHERE a.city_id = $1
      AND a.status = 'active'
      AND a.brand IS NOT NULL
    GROUP BY a.brand
    ORDER BY total DESC, a.brand ASC
    LIMIT $2
    `,
    [cityId, safeLimit]
  );

  return result.rows;
}

export async function listTopModelsByCityAndBrand(cityId, brand, limit = 8) {
  const safeLimit = Math.min(30, Math.max(1, Number(limit) || 8));

  const result = await pool.query(
    `
    SELECT
      a.model,
      COUNT(*)::int AS total
    FROM ads a
    WHERE a.city_id = $1
      AND a.status = 'active'
      AND LOWER(a.brand) = LOWER($2)
      AND a.model IS NOT NULL
    GROUP BY a.model
    ORDER BY total DESC, a.model ASC
    LIMIT $3
    `,
    [cityId, brand, safeLimit]
  );

  return result.rows;
}

export const __TEST_ONLY__ = Object.freeze({
  SQL_PRIMARY,
  SQL_FALLBACK_ADS,
  projectFallbackRow,
});
