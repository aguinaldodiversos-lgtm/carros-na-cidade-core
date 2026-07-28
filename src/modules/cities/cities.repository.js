import { pool } from "../../infrastructure/database/db.js";
import { getRegionalRadiusKm } from "../../read-models/cities/regional-radius.config.js";
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
 * Vizinha com estoque DENTRO DO RAIO, via `region_memberships` (Haversine
 * persistido pelo `npm run regions:build`; sempre mesma UF por construção).
 *
 * Ordem: mais estoque primeiro, distância como desempate. Dentro de um raio
 * fechado todas as candidatas já são "perto", então o critério útil passa a
 * ser quantidade de oferta — mas entre empates a mais próxima vence.
 *
 * A self-row (`distance_km = 0`, backfill da migration 021) é excluída pelo
 * guard `distance_km > 0` — mesmo guard de `getRadiusMembers`, sem ele a
 * própria cidade voltaria como "vizinha".
 */
async function findRadiusDonor(cityId, radiusKm) {
  const result = await pool.query(
    `
    SELECT
      c.slug,
      c.name,
      c.state,
      COUNT(a.id)::int AS live_ads,
      MIN(rm.distance_km)::float AS distance_km
    FROM region_memberships rm
    INNER JOIN cities c ON c.id = rm.member_city_id
    INNER JOIN ads a
      ON a.city_id = c.id
     AND a.status = 'active'
    WHERE rm.base_city_id = $1
      AND rm.distance_km IS NOT NULL
      AND rm.distance_km > 0
      AND rm.distance_km <= $2
    GROUP BY c.id, c.slug, c.name, c.state
    ORDER BY live_ads DESC, distance_km ASC, c.name ASC
    LIMIT 1
    `,
    [cityId, radiusKm]
  );
  return result.rows[0] || null;
}

/**
 * A cidade tem malha de vizinhança construída?
 *
 * Distingue "não há vizinha COM ESTOQUE no raio" (correto: página vazia) de
 * "esta cidade nunca passou pelo build" (cidade nova ⇒ cai no fallback por
 * UF). Sem essa distinção, cidade recém-cadastrada ficaria permanentemente
 * sem fallback, em silêncio.
 */
async function hasRegionMemberships(cityId) {
  const result = await pool.query(
    `
    SELECT 1
    FROM region_memberships
    WHERE base_city_id = $1
      AND distance_km IS NOT NULL
      AND distance_km > 0
    LIMIT 1
    `,
    [cityId]
  );
  return result.rowCount > 0;
}

/**
 * Quando o catálogo público está vazio para um território, resolve um território
 * doador com anúncios ativos.
 *
 * Ordem: (1) a própria cidade, (2) vizinha dentro do RAIO, (3) mesma UF —
 * SOMENTE quando a cidade não tem malha de vizinhança construída.
 *
 * ── Por que o passo global foi REMOVIDO (auditoria 2026-07-28) ──────────────
 * O passo 4 antigo era "qualquer cidade do Brasil, ORDER BY live_ads DESC",
 * sem filtro territorial nenhum. Como Atibaia-SP é a única cidade do país com
 * estoque, ela virava a doadora das 5.572 cidades do banco:
 * `/comprar/cidade/altaneira-ce` (Ceará) exibia carros de Atibaia a ~2.500 km,
 * numa página que se declarava de Altaneira. Isso é doorway page pela
 * definição do Google — conteúdo igual replicado por localidade — e a
 * penalidade associada é de site inteiro.
 *
 * O raio resolve o caso patológico sem quebrar o legítimo: Bragança Paulista
 * fica a 18,34 km de Atibaia e continua recebendo; Altaneira só tem vizinhas
 * cearenses, todas sem estoque, e passa a servir página vazia — que é a
 * resposta honesta.
 *
 * O raio NUNCA cruza UF: `region_memberships` é construída por UF. Logo este
 * passo é estritamente mais restritivo que o antigo passo 3, nunca mais amplo.
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

    // ── 2. Vizinha dentro do raio (fonte PRIMÁRIA) ──────────────────────────
    // `getRegionalRadiusKm()` é a mesma fonte do bloco "Próximos até X km"
    // (env RAIO_PADRAO_KM, default 50). Uma só definição de vizinhança para o
    // portal inteiro — se o raio mudar, muda nos dois lugares junto.
    const radiusDonor = await findRadiusDonor(city.id, getRegionalRadiusKm());
    if (radiusDonor?.slug) {
      return {
        mode: "fallback",
        slug: radiusDonor.slug,
        name: radiusDonor.name,
        state: radiusDonor.state,
        live_ads: Number(radiusDonor.live_ads || 0),
        distance_km: radiusDonor.distance_km ?? null,
      };
    }

    // ── 3. Mesma UF — SOMENTE sem malha de vizinhança ───────────────────────
    // Não é "o raio não achou nada": é "não dá para avaliar proximidade".
    // Cidade COM malha e sem vizinha estocada serve página vazia de propósito
    // (é o caso Altaneira-CE). Só cidade sem build entra aqui, para não nascer
    // permanentemente sem fallback depois de um cadastro novo.
    if (!(await hasRegionMemberships(city.id))) {
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
          logger.info(
            { slug: normalizedSlug, donor: row.slug },
            "[cities.repository] fallback por UF: cidade sem region_memberships (rodar npm run regions:build)"
          );
          return {
            mode: "fallback",
            slug: row.slug,
            name: row.name,
            state: row.state,
            live_ads: Number(row.live_ads || 0),
            distance_km: null,
          };
        }
      }
    }

    // Sem vizinha estocada no raio (e com malha construída) → página vazia.
    // É a resposta honesta: melhor vazio que carro de outro estado.
    return {
      mode: "empty",
      slug: city.slug,
      name: city.name,
      state: city.state,
      live_ads: 0,
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
