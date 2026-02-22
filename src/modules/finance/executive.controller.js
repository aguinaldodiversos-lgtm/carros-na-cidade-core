// src/modules/finance/executive.controller.js

import { pool } from "../../infrastructure/database/db.js";

export async function getExecutiveDashboard(req, res, next) {
  try {
    const data = await pool.query(`
      SELECT
        SUM(ad_spend) as total_spend,
        SUM(revenue) as total_revenue,
        AVG(roas) as avg_roas
      FROM city_roi_metrics
    `);

    res.json(data.rows[0]);
  } catch (err) {
    next(err);
  }
}
