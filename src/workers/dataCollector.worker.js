import { fetchSearchConsoleData } from "../modules/external/searchConsole.service.js";
import { fetchGA4CityData } from "../modules/external/ga4.service.js";
import { pool } from "../infrastructure/database/db.js";

export async function collectExternalData() {
  try {
    const seoData = await fetchSearchConsoleData(process.env.SITE_URL);

    const gaData = await fetchGA4CityData(process.env.GA4_PROPERTY_ID);

    await saveSEOData(seoData);
    await saveGAData(gaData);

    console.log("📊 Pipeline externo atualizado");
  } catch (err) {
    console.error("❌ Erro no pipeline externo:", err.message);
  }
}

async function saveSEOData(rows) {
  for (const row of rows) {
    await pool.query(
      `
      INSERT INTO seo_city_metrics
      (date, city, impressions, clicks, ctr, avg_position, source)
      VALUES (CURRENT_DATE, $1, $2, $3, $4, $5, 'search_console')
      ON CONFLICT (date, city)
      DO UPDATE SET
        impressions = EXCLUDED.impressions,
        clicks = EXCLUDED.clicks,
        ctr = EXCLUDED.ctr,
        avg_position = EXCLUDED.avg_position
      `,
      [
        row.keys?.[0] || row.city_name,
        row.impressions || 0,
        row.clicks || 0,
        row.ctr || 0,
        row.position || 0,
      ]
    );
  }
}

async function saveGAData(rows) {
  for (const row of rows) {
    const city = row.dimensionValues?.[0]?.value || row.city_name;
    const sessions = row.metricValues?.[0]?.value || 0;
    await pool.query(
      `
      INSERT INTO seo_city_metrics (date, city, sessions, source)
      VALUES (CURRENT_DATE, $1, $2, 'ga4')
      ON CONFLICT (date, city)
      DO UPDATE SET sessions = EXCLUDED.sessions
      `,
      [city, sessions]
    );
  }
}
