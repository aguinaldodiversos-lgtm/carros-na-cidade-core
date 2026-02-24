// src/modules/public/public.controller.js

import { pool } from "../../infrastructure/database/db.js";

export async function getHomeData(req, res, next) {
  try {
    // Cidades estratégicas (maior demanda)
    const citiesResult = await pool.query(`
      SELECT c.id, c.name, c.slug, cm.demand_score
      FROM cities c
      LEFT JOIN city_metrics cm ON cm.city_id = c.id
      ORDER BY cm.demand_score DESC NULLS LAST
      LIMIT 8
    `);

    // Anúncios recentes
    const adsResult = await pool.query(`
      SELECT id, title, price, city_id, created_at
      FROM ads
      WHERE status = 'active'
      ORDER BY created_at DESC
      LIMIT 12
    `);

    // Estatísticas gerais
    const statsResult = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM ads WHERE status='active') as total_ads,
        (SELECT COUNT(*) FROM cities) as total_cities
    `);

    res.json({
      featuredCities: citiesResult.rows,
      recentAds: adsResult.rows,
      stats: statsResult.rows[0],
    });

  } catch (err) {
    next(err);
  }
}
