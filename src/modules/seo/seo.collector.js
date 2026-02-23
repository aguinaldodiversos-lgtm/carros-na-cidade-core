const { google } = require("googleapis");
const path = require("path");
const pool = require("../../database/connection");

const keyPath = path.join(
  __dirname,
  "../../credentials/google-service-account.json"
);

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
        [
          startDate,
          "global", // depois vamos quebrar por cidade via query
          row.impressions,
          row.clicks,
          row.ctr,
          row.position,
          "google",
        ]
      );
    }

    console.log("✅ Dados Search Console coletados");
  }
}

module.exports = new SeoCollector();
