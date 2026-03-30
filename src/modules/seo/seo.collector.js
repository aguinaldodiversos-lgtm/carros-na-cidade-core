import path from "path";
import { fileURLToPath } from "url";
import { google } from "googleapis";
import { pool } from "../../infrastructure/database/db.js";
import { logger } from "../../shared/logger.js";
import { buildDomainFields } from "../../shared/domainLog.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const keyPath = path.join(__dirname, "../../credentials/google-service-account.json");

class SeoCollector {
  async collectSearchConsoleData(startDate, endDate) {
    const auth = new google.auth.GoogleAuth({
      keyFile: keyPath,
      scopes: ["https://www.googleapis.com/auth/webmasters.readonly"],
    });

    const authClient = await auth.getClient();

    const searchconsole = google.searchconsole({
      version: "v1",
      auth: authClient,
    });

    const response = await searchconsole.searchanalytics.query({
      siteUrl: "https://carrosnacidade.com/",
      requestBody: {
        startDate,
        endDate,
        dimensions: ["query"],
        rowLimit: 25000,
      },
    });

    if (!response.data.rows) return;

    for (const row of response.data.rows) {
      await pool.query(
        `
        INSERT INTO seo_city_metrics
        (date, city, impressions, clicks, ctr, avg_position, source)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT (date, city)
        DO UPDATE SET
          impressions = EXCLUDED.impressions,
          clicks = EXCLUDED.clicks,
          ctr = EXCLUDED.ctr,
          avg_position = EXCLUDED.avg_position
        `,
        [startDate, "global", row.impressions, row.clicks, row.ctr, row.position, "google"]
      );
    }

    logger.info(
      {
        ...buildDomainFields({
          action: "seo.search_console.collect",
          result: "success",
        }),
        rows: response.data.rows?.length ?? 0,
      },
      "[seo] dados Search Console coletados"
    );
  }
}

export default new SeoCollector();
