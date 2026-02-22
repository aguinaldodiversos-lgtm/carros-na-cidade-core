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
      LEFT JOIN city_seo_metrics cs
      ON cg.city_id::text = cs.city_name
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
