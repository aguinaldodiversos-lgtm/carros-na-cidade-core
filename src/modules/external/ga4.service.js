import { google } from "googleapis";
import { getGoogleAuth } from "./googleAuth.js";
import { pool } from "../../infrastructure/database/db.js";

export async function fetchGA4CityData(propertyId) {
  try {
    const auth = getGoogleAuth([
      "https://www.googleapis.com/auth/analytics.readonly",
    ]);

    const client = await auth.getClient();

    const analyticsData = google.analyticsdata({
      version: "v1beta",
      auth: client,
    });

    const response = await analyticsData.properties.runReport({
      property: `properties/${propertyId}`,
      requestBody: {
        dimensions: [{ name: "city" }],
        metrics: [{ name: "sessions" }],
        dateRanges: [{ startDate: "7daysAgo", endDate: "today" }],
      },
    });

    return response.data.rows || [];
  } catch (error) {
    console.error("❌ GA4 falhou:", error.message);

    return await fallbackGA4();
  }
}

async function fallbackGA4() {
  const result = await pool.query(`
    SELECT city_name, sessions
    FROM city_seo_metrics
    ORDER BY last_updated DESC
  `);

  console.warn("⚠️ Usando fallback GA4 local");

  return result.rows;
}
