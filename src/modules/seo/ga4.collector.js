const { BetaAnalyticsDataClient } = require("@google-analytics/data");
const path = require("path");
const pool = require("../../database/connection");

const keyPath = path.join(
  __dirname,
  "../../credentials/google-service-account.json"
);

const analyticsDataClient = new BetaAnalyticsDataClient({
  keyFilename: keyPath,
});

class GA4Collector {
  async collect(propertyId, startDate, endDate) {
    const [response] = await analyticsDataClient.runReport({
      property: `properties/${propertyId}`,
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: "city" }],
      metrics: [
        { name: "sessions" },
        { name: "totalUsers" },
        { name: "conversions" },
      ],
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

    console.log("✅ Dados GA4 coletados");
  }
}

module.exports = new GA4Collector();
