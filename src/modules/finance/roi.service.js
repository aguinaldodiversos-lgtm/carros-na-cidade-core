// src/modules/finance/roi.service.js

import { pool } from "../../infrastructure/database/db.js";

export async function calculateCityROI(cityId) {
  const spendResult = await pool.query(
    `SELECT SUM(spend) as total_spend
     FROM payments
     WHERE city_id = $1`,
    [cityId]
  );

  const revenueResult = await pool.query(
    `SELECT total_revenue
     FROM city_growth_metrics
     WHERE city_id = $1`,
    [cityId]
  );

  const spend = parseFloat(spendResult.rows[0]?.total_spend || 0);
  const revenue = parseFloat(revenueResult.rows[0]?.total_revenue || 0);

  const roas = spend > 0 ? revenue / spend : 0;
  const cpa = revenue > 0 ? spend / revenue : 0;

  await pool.query(
    `
    INSERT INTO city_roi_metrics (city_id, ad_spend, revenue, roas, cpa)
    VALUES ($1,$2,$3,$4,$5)
    ON CONFLICT (city_id)
    DO UPDATE SET
      ad_spend = EXCLUDED.ad_spend,
      revenue = EXCLUDED.revenue,
      roas = EXCLUDED.roas,
      cpa = EXCLUDED.cpa,
      last_updated = NOW()
    `,
    [cityId, spend, revenue, roas, cpa]
  );

  return { roas, cpa };
}
