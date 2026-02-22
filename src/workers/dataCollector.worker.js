import { fetchSearchConsoleData } from "../modules/external/searchConsole.service.js";
import { fetchGA4CityData } from "../modules/external/ga4.service.js";
import { pool } from "../infrastructure/database/db.js";

export async function collectExternalData() {
  try {
    const seoData = await fetchSearchConsoleData(
      process.env.SITE_URL
    );

    const gaData = await fetchGA4CityData(
      process.env.GA4_PROPERTY_ID
    );

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
      INSERT INTO city_seo_metrics
      (city_name, impressions, clicks, ctr, avg_position)
      VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (city_name)
      DO UPDATE SET
        impressions = EXCLUDED.impressions,
        clicks = EXCLUDED.clicks,
        ctr = EXCLUDED.ctr,
        avg_position = EXCLUDED.avg_position,
        last_updated = NOW()
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
    await pool.query(
      `
      UPDATE city_seo_metrics
      SET sessions = $2
      WHERE city_name = $1
      `,
      [row.dimensionValues?.[0]?.value || row.city_name,
       row.metricValues?.[0]?.value || 0]
    );
  }
}
