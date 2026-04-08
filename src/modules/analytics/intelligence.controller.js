// src/modules/analytics/intelligence.controller.js

import { pool } from "../../infrastructure/database/db.js";
import { calculateCityScore } from "../ai/cityScore.service.js";

export async function getCityIntelligence(req, res, next) {
  try {
    const { cityId } = req.params;

    const data = await pool.query(
      `
      SELECT cg.*, cs.impressions, cs.ctr
      FROM city_growth_metrics cg
      LEFT JOIN LATERAL (
        SELECT impressions, ctr
        FROM seo_city_metrics
        WHERE LOWER(city) = LOWER((SELECT name FROM cities WHERE id = cg.city_id LIMIT 1))
        ORDER BY date DESC
        LIMIT 1
      ) cs ON true
      WHERE cg.city_id = $1
      `,
      [cityId]
    );

    const row = data.rows[0];

    const score = calculateCityScore(row);

    res.json({
      ...row,
      city_score: score,
    });
  } catch (err) {
    next(err);
  }
}
