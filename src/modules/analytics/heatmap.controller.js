import { pool } from "../../infrastructure/database/db.js";
import { calculateCityScore } from "../ai/cityScore.service.js";

export async function getHeatmap(req, res, next) {
  try {
    const cities = await pool.query(`
      SELECT cg.*, c.name
      FROM city_growth_metrics cg
      JOIN cities c ON cg.city_id = c.id
    `);

    const heatmap = cities.rows.map(city => ({
      city: city.name,
      score: calculateCityScore(city),
    }));

    res.json(heatmap);
  } catch (err) {
    next(err);
  }
}
