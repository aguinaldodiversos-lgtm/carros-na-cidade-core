// src/read-models/cities/city-seo-overview.repository.js
//
// Agregações do CitySeoOverview (Fase 3, Etapas 4-5). Todas em SQL, todas
// restritas a `status = 'active'` — o inventário PÚBLICO. Nenhum `paused`,
// `blocked`, `pending_review`, `draft` ou `removed` entra em estatística
// exibida.
//
// Custo: 5 queries de agregação por cidade, executadas em paralelo, cada uma
// varrendo apenas as linhas daquela cidade (índice `ads_status_city_id_idx`).
// Nenhum N+1: nada aqui roda por anúncio, por marca ou por modelo.

import { pool } from "../../infrastructure/database/db.js";

/**
 * Estatística geral do inventário ativo da cidade.
 *
 * MEDIANA via `percentile_cont` e não média: com amostras pequenas um único
 * outlier (um carro de R$ 3 milhões entre hatches de R$ 60 mil) move a média
 * para um número que não descreve nada. A média vai junto para o relatório,
 * mas quem decide o que exibir é a camada de serviço.
 */
export async function getCityInventoryStats(cityId) {
  const result = await pool.query(
    `
    SELECT
      COUNT(*)::int                                                        AS active_ads,
      COUNT(DISTINCT a.advertiser_id)::int                                 AS active_advertisers,
      MIN(a.price)                                                         AS min_price,
      MAX(a.price)                                                         AS max_price,
      AVG(a.price)                                                         AS avg_price,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY a.price)                 AS median_price,
      MIN(a.year)::int                                                     AS min_year,
      MAX(a.year)::int                                                     AS max_year,
      COUNT(*) FILTER (WHERE a.below_fipe = true)::int                     AS below_fipe_count,
      COUNT(*) FILTER (WHERE a.transmission = 'automatico')::int           AS automatic_count,
      COUNT(*) FILTER (WHERE a.transmission = 'manual')::int               AS manual_count,
      MAX(a.updated_at)                                                    AS inventory_updated_at
    FROM ads a
    WHERE a.city_id = $1
      AND a.status = 'active'
      AND a.price > 0
    `,
    [cityId]
  );

  return result.rows[0] || null;
}

/** Uma linha por valor REAL de `ads.brand`. A canonicalização é feita em JS. */
export async function getCityBrandAggregates(cityId) {
  const result = await pool.query(
    `
    SELECT
      a.brand                       AS brand,
      COUNT(*)::int                 AS total,
      MIN(a.price)                  AS min_price,
      MAX(a.updated_at)             AS last_updated
    FROM ads a
    WHERE a.city_id = $1
      AND a.status = 'active'
      AND a.brand IS NOT NULL
      AND btrim(a.brand) <> ''
    GROUP BY a.brand
    ORDER BY COUNT(*) DESC
    `,
    [cityId]
  );

  return result.rows;
}

/**
 * Uma linha por par REAL (`ads.brand`, `ads.model`). O agrupamento por MODELO
 * COMERCIAL acontece em JS (`deriveCommercialModel`) — deliberadamente fora do
 * SQL, porque a derivação tem uma escada de regras (overrides, compostos,
 * heurística guardada) que não cabe em `split_part`.
 */
export async function getCityBrandModelAggregates(cityId) {
  const result = await pool.query(
    `
    SELECT
      a.brand                       AS brand,
      a.model                       AS model,
      COUNT(*)::int                 AS total,
      MIN(a.price)                  AS min_price,
      MAX(a.price)                  AS max_price,
      MIN(a.year)::int              AS min_year,
      MAX(a.year)::int              AS max_year,
      MAX(a.updated_at)             AS last_updated
    FROM ads a
    WHERE a.city_id = $1
      AND a.status = 'active'
      AND a.brand IS NOT NULL
      AND btrim(a.brand) <> ''
      AND a.model IS NOT NULL
      AND btrim(a.model) <> ''
    GROUP BY a.brand, a.model
    `,
    [cityId]
  );

  return result.rows;
}

/** Distribuição por carroceria, combustível e câmbio (recortes transversais). */
export async function getCityFacetAggregates(cityId) {
  const result = await pool.query(
    `
    SELECT 'body_type' AS kind, COALESCE(a.body_type, '')   AS value, COUNT(*)::int AS total
      FROM ads a WHERE a.city_id = $1 AND a.status = 'active' GROUP BY a.body_type
    UNION ALL
    SELECT 'fuel_type' AS kind, COALESCE(a.fuel_type, '')   AS value, COUNT(*)::int AS total
      FROM ads a WHERE a.city_id = $1 AND a.status = 'active' GROUP BY a.fuel_type
    UNION ALL
    SELECT 'transmission' AS kind, COALESCE(a.transmission, '') AS value, COUNT(*)::int AS total
      FROM ads a WHERE a.city_id = $1 AND a.status = 'active' GROUP BY a.transmission
    `,
    [cityId]
  );

  return result.rows;
}

/**
 * Anunciantes com estoque ativo na cidade. Só campos PÚBLICOS: nome, slug e
 * contagem. Telefone, e-mail e endereço NÃO saem daqui — publicar contato
 * particular para ganhar sinal local seria expor dado pessoal por SEO.
 */
export async function getCityActiveDealers(cityId, limit = 24) {
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 24));

  const result = await pool.query(
    `
    SELECT
      adv.id                        AS id,
      adv.name                      AS name,
      adv.slug                      AS slug,
      COUNT(*)::int                 AS active_ads,
      MIN(a.price)                  AS min_price,
      MAX(a.updated_at)             AS last_updated
    FROM ads a
    JOIN advertisers adv ON adv.id = a.advertiser_id
    WHERE a.city_id = $1
      AND a.status = 'active'
      AND adv.slug IS NOT NULL
      AND btrim(adv.slug) <> ''
    GROUP BY adv.id, adv.name, adv.slug
    ORDER BY COUNT(*) DESC
    LIMIT $2
    `,
    [cityId, safeLimit]
  );

  return result.rows;
}

/**
 * Contagem de anúncios ativos para uma LISTA de slugs de cidade — usada pela
 * seção "cidades próximas com estoque". Uma query para todas as vizinhas
 * (nunca uma por cidade).
 */
export async function getActiveCountsByCitySlugs(slugs) {
  const list = (Array.isArray(slugs) ? slugs : [])
    .map((s) => String(s || "").trim().toLowerCase())
    .filter(Boolean);

  if (list.length === 0) return [];

  const result = await pool.query(
    `
    SELECT
      c.slug                        AS city_slug,
      COUNT(*)::int                 AS total,
      MAX(a.updated_at)             AS last_updated
    FROM ads a
    JOIN cities c ON c.id = a.city_id
    WHERE a.status = 'active'
      AND LOWER(c.slug) = ANY($1)
    GROUP BY c.slug
    `,
    [list]
  );

  return result.rows;
}
