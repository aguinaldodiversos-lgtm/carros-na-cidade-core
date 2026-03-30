import path from "path";
import { fileURLToPath } from "url";
import { BetaAnalyticsDataClient } from "@google-analytics/data";
import { pool } from "../../infrastructure/database/db.js";
import { logger } from "../../shared/logger.js";
import { buildDomainFields } from "../../shared/domainLog.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const keyPath = path.join(__dirname, "../../credentials/google-service-account.json");

const analyticsDataClient = new BetaAnalyticsDataClient({
  keyFilename: keyPath,
});

class GA4Collector {
  async collect(propertyId, startDate, endDate) {
    const [response] = await analyticsDataClient.runReport({
      property: `properties/${propertyId}`,
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: "city" }],
      metrics: [{ name: "sessions" }, { name: "totalUsers" }, { name: "conversions" }],
    });

    for (const row of response.rows) {
      const city = row.dimensionValues[0].value;

      await pool.query(
        `
        INSERT INTO seo_city_metrics
        (date, city, sessions, users_count, conversions, source)
        VALUES ($1,$2,$3,$4,$5,$6)
        ON CONFLICT (date, city)
        DO UPDATE SET
          sessions = EXCLUDED.sessions,
          users_count = EXCLUDED.users_count,
          conversions = EXCLUDED.conversions
        `,
        [
          startDate,
          city,
          row.metricValues[0].value,
          row.metricValues[1].value,
          row.metricValues[2].value,
          "google",
        ]
      );
    }

    logger.info(
      {
        ...buildDomainFields({
          action: "seo.ga4.collect",
          result: "success",
        }),
        propertyId,
        rows: response.rows?.length ?? 0,
      },
      "[seo] dados GA4 coletados"
    );
  }
}

export default new GA4Collector();
