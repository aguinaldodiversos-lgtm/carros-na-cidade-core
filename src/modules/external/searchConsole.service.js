import { google } from "googleapis";
import { getGoogleAuth } from "./googleAuth.js";
import { pool } from "../../infrastructure/database/db.js";

export async function fetchSearchConsoleData(siteUrl) {
  try {
    const auth = getGoogleAuth([
      "https://www.googleapis.com/auth/webmasters.readonly",
    ]);

    const client = await auth.getClient();

    const webmasters = google.webmasters({
      version: "v3",
      auth: client,
    });

    const response = await webmasters.searchanalytics.query({
      siteUrl,
      requestBody: {
        startDate: "7daysAgo",
        endDate: "today",
        dimensions: ["page"],
      },
    });

    return response.data.rows || [];
  } catch (error) {
    console.error("❌ Search Console falhou:", error.message);

    return await fallbackSearchConsole();
  }
}

async function fallbackSearchConsole() {
  const result = await pool.query(`
    SELECT city_name, impressions, clicks, ctr, avg_position
    FROM city_seo_metrics
    ORDER BY last_updated DESC
  `);

  console.warn("⚠️ Usando fallback de SEO local");

  return result.rows;
}
