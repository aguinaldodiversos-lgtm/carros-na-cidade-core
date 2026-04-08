import { google } from "googleapis";
import { getGoogleAuth } from "./googleAuth.js";
import { pool } from "../../infrastructure/database/db.js";
import { logger } from "../../shared/logger.js";
import { buildDomainFields } from "../../shared/domainLog.js";

export async function fetchSearchConsoleData(siteUrl) {
  try {
    const auth = getGoogleAuth(["https://www.googleapis.com/auth/webmasters.readonly"]);

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
    logger.error(
      {
        ...buildDomainFields({
          action: "seo.search_console.fetch",
          result: "error",
        }),
        errMessage: error?.message || String(error),
        siteUrl,
      },
      "[seo] Search Console API falhou — usando fallback local"
    );

    return await fallbackSearchConsole();
  }
}

async function fallbackSearchConsole() {
  const result = await pool.query(`
    SELECT city AS city_name, impressions, clicks, ctr, avg_position
    FROM seo_city_metrics
    ORDER BY date DESC, city
  `);

  logger.warn(
    {
      ...buildDomainFields({
        action: "seo.search_console.fetch",
        result: "success",
      }),
      fallback: true,
      source: "seo_city_metrics",
    },
    "[seo] fallback Search Console local"
  );

  return result.rows;
}
