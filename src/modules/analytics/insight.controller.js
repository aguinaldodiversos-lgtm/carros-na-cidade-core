import { pool } from "../../infrastructure/database/db.js";

export async function cityInsight(req, res, next) {
  try {
    const { cityId } = req.params;

    const data = await pool.query(
      `
      SELECT cg.*, ed.population, ed.vehicle_fleet
      FROM city_growth_metrics cg
      LEFT JOIN city_demographics ed ON cg.city_id = ed.city_id
      WHERE cg.city_id = $1
      `,
      [cityId]
    );

    res.json(data.rows[0]);
  } catch (err) {
    next(err);
  }
}
