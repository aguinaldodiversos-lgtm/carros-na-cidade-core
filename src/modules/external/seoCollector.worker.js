// src/workers/seoCollector.worker.js

import { fetchSearchConsoleData } from "../modules/external/searchConsole.service.js";
import { fetchGA4CityData } from "../modules/external/ga4.service.js";
import { pool } from "../infrastructure/database/db.js";

export async function collectSEOData() {
  const searchData = await fetchSearchConsoleData(process.env.SITE_URL);
  const gaData = await fetchGA4CityData(process.env.GA4_PROPERTY_ID);

  for (const row of searchData) {
    await pool.query(
      `
      INSERT INTO city_seo_metrics (city_name, impressions, clicks, ctr, avg_position, last_updated)
      VALUES ($1,$2,$3,$4,$5,NOW())
      ON CONFLICT (city_name)
      DO UPDATE SET
        impressions = EXCLUDED.impressions,
        clicks = EXCLUDED.clicks,
        ctr = EXCLUDED.ctr,
        avg_position = EXCLUDED.avg_position,
        last_updated = NOW()
      `,
      [
        row.keys[0],
        row.impressions,
        row.clicks,
        row.ctr,
        row.position
      ]
    );
  }
}
