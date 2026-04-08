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
      INSERT INTO seo_city_metrics (date, city, impressions, clicks, ctr, avg_position, source)
      VALUES (CURRENT_DATE, $1, $2, $3, $4, $5, 'search_console')
      ON CONFLICT (date, city)
      DO UPDATE SET
        impressions = EXCLUDED.impressions,
        clicks = EXCLUDED.clicks,
        ctr = EXCLUDED.ctr,
        avg_position = EXCLUDED.avg_position
      `,
      [row.keys[0], row.impressions, row.clicks, row.ctr, row.position]
    );
  }
}
