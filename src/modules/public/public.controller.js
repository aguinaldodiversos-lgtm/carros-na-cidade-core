import { pool } from "../../infrastructure/database/db.js";

/* =====================================================
   HOME DATA CONTROLLER (VERSÃO ROBUSTA)
===================================================== */

export async function getHomeData(req, res, next) {
  try {
    /* =====================================================
       EXECUTA CONSULTAS EM PARALELO (PERFORMANCE)
    ===================================================== */
    const [
      citiesResult,
      highlightAdsResult,
      opportunityAdsResult,
      recentAdsResult,
      statsResult
    ] = await Promise.all([

      /* ===== CIDADES COM MAIOR DEMANDA ===== */
      pool.query(`
        SELECT 
          c.id,
          c.name,
          c.slug,
          COALESCE(cm.demand_score, 0) AS demand_score
        FROM cities c
        LEFT JOIN city_metrics cm ON cm.city_id = c.id
        ORDER BY cm.demand_score DESC NULLS LAST
        LIMIT 8
      `),

      /* ===== ANÚNCIOS EM DESTAQUE ===== */
      pool.query(`
        SELECT 
          a.id,
          a.title,
          a.price,
          a.city,
          a.state,
          a.brand,
          a.model,
          a.year,
          a.mileage,
          a.slug,
          a.highlight_until,
          a.plan
        FROM ads a
        WHERE a.status = 'active'
          AND a.highlight_until IS NOT NULL
          AND a.highlight_until > NOW()
        ORDER BY a.highlight_until DESC
        LIMIT 12
      `),

      /* ===== OPORTUNIDADES (ABAIXO DA FIPE) ===== */
      pool.query(`
        SELECT 
          a.id,
          a.title,
          a.price,
          a.city,
          a.state,
          a.brand,
          a.model,
          a.year,
          a.mileage,
          a.slug,
          a.below_fipe
        FROM ads a
        WHERE a.status = 'active'
          AND a.below_fipe = true
        ORDER BY a.created_at DESC
        LIMIT 12
      `),

      /* ===== ANÚNCIOS RECENTES ===== */
      pool.query(`
        SELECT 
          a.id,
          a.title,
          a.price,
          a.city,
          a.state,
          a.brand,
          a.model,
          a.year,
          a.mileage,
          a.slug,
          a.created_at
        FROM ads a
        WHERE a.status = 'active'
        ORDER BY a.created_at DESC
        LIMIT 12
      `),

      /* ===== ESTATÍSTICAS GERAIS ===== */
      pool.query(`
        SELECT 
          (SELECT COUNT(*) FROM ads WHERE status = 'active') AS total_ads,
          (SELECT COUNT(*) FROM cities) AS total_cities,
          (SELECT COUNT(*) FROM advertisers) AS total_advertisers,
          (SELECT COUNT(*) FROM users) AS total_users
      `)
    ]);

    /* =====================================================
       RESPOSTA FINAL
    ===================================================== */

    res.json({
      success: true,
      data: {
        featuredCities: citiesResult.rows,
        highlightAds: highlightAdsResult.rows,
        opportunityAds: opportunityAdsResult.rows,
        recentAds: recentAdsResult.rows,
        stats: statsResult.rows[0]
      }
    });

  } catch (err) {
    next(err);
  }
}
