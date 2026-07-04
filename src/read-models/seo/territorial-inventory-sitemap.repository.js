// src/read-models/seo/territorial-inventory-sitemap.repository.js
//
// Fonte de verdade dos sitemaps brands/models baseada em ESTOQUE ATIVO real
// (tabela `ads`), e não em `seo_cluster_plans` (que não valida estoque e
// podia listar combinações vazias). Cada linha agrega anúncios ativos por
// cidade + marca[+modelo], devolvendo a contagem e o `lastmod` real
// (MAX(updated_at)). A slugificação canônica e o filtro `>= 1` são aplicados
// na camada de serviço (`territorial-inventory-sitemap.service.js`).

import { pool } from "../../infrastructure/database/db.js";

/**
 * Uma linha por cidade com a contagem de anúncios ATIVOS. `HAVING >= 1` traz
 * todas as cidades com estoque; o limiar final (>= SITEMAP_MIN_ADS) é aplicado
 * na camada de serviço (`buildCityEntries`). O `loc` canônico `/carros-em/[slug]`
 * é montado no serviço.
 */
export async function listActiveCityRows(limit = 50000) {
  const safeLimit = Math.min(100000, Math.max(1, Number(limit) || 50000));

  const result = await pool.query(
    `
    SELECT
      c.slug AS city_slug,
      c.state AS state,
      COUNT(*)::int AS total,
      MAX(a.updated_at) AS last_updated
    FROM ads a
    JOIN cities c ON c.id = a.city_id
    WHERE a.status = 'active'
    GROUP BY c.slug, c.state
    HAVING COUNT(*) >= 1
    ORDER BY COUNT(*) DESC
    LIMIT $1
    `,
    [safeLimit]
  );

  return result.rows;
}

export async function listActiveCityBrandRows(limit = 50000) {
  const safeLimit = Math.min(100000, Math.max(1, Number(limit) || 50000));

  const result = await pool.query(
    `
    SELECT
      c.slug AS city_slug,
      c.state AS state,
      a.brand AS brand,
      COUNT(*)::int AS total,
      MAX(a.updated_at) AS last_updated
    FROM ads a
    JOIN cities c ON c.id = a.city_id
    WHERE a.status = 'active'
      AND a.brand IS NOT NULL
      AND btrim(a.brand) <> ''
    GROUP BY c.slug, c.state, a.brand
    HAVING COUNT(*) >= 1
    ORDER BY COUNT(*) DESC
    LIMIT $1
    `,
    [safeLimit]
  );

  return result.rows;
}

export async function listActiveCityBrandModelRows(limit = 50000) {
  const safeLimit = Math.min(100000, Math.max(1, Number(limit) || 50000));

  const result = await pool.query(
    `
    SELECT
      c.slug AS city_slug,
      c.state AS state,
      a.brand AS brand,
      a.model AS model,
      COUNT(*)::int AS total,
      MAX(a.updated_at) AS last_updated
    FROM ads a
    JOIN cities c ON c.id = a.city_id
    WHERE a.status = 'active'
      AND a.brand IS NOT NULL
      AND btrim(a.brand) <> ''
      AND a.model IS NOT NULL
      AND btrim(a.model) <> ''
    GROUP BY c.slug, c.state, a.brand, a.model
    HAVING COUNT(*) >= 1
    ORDER BY COUNT(*) DESC
    LIMIT $1
    `,
    [safeLimit]
  );

  return result.rows;
}
