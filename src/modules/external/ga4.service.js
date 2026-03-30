import { google } from "googleapis";
import { getGoogleAuth } from "./googleAuth.js";
import { pool } from "../../infrastructure/database/db.js";
import { logger } from "../../shared/logger.js";
import { buildDomainFields } from "../../shared/domainLog.js";

export async function fetchGA4CityData(propertyId) {
  try {
    const auth = getGoogleAuth(["https://www.googleapis.com/auth/analytics.readonly"]);

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
    logger.error(
      {
        ...buildDomainFields({
          action: "seo.ga4.fetch",
          result: "error",
        }),
        errMessage: error?.message || String(error),
        propertyId,
      },
      "[seo] GA4 API falhou — usando fallback local"
    );

    return await fallbackGA4();
  }
}

async function fallbackGA4() {
  const result = await pool.query(`
    SELECT city_name, sessions
    FROM city_seo_metrics
    ORDER BY last_updated DESC
  `);

  logger.warn(
    {
      ...buildDomainFields({
        action: "seo.ga4.fetch",
        result: "success",
      }),
      fallback: true,
      source: "city_seo_metrics",
    },
    "[seo] fallback GA4 local"
  );

  return result.rows;
}
