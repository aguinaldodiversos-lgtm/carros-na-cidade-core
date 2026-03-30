import path from "path";
import { fileURLToPath } from "url";
import { BetaAnalyticsDataClient } from "@google-analytics/data";
import * as seoMetricsRepository from "./seo-metrics.repository.js";
import { logger } from "../../../shared/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const keyPath = path.join(__dirname, "../../../credentials/google-service-account.json");

const analyticsClient = new BetaAnalyticsDataClient({
  keyFilename: keyPath,
});

export async function collectGA4Data(startDate, endDate) {
  const propertyId = process.env.GA4_PROPERTY_ID;

  if (!propertyId) {
    logger.warn("[seo.metrics] GA4_PROPERTY_ID não definido");
    return;
  }

  const [response] = await analyticsClient.runReport({
    property: `properties/${propertyId}`,
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: "city" }],
    metrics: [{ name: "sessions" }, { name: "totalUsers" }, { name: "conversions" }],
  });

  for (const row of response.rows || []) {
    const city = row.dimensionValues?.[0]?.value || "unknown";

    await seoMetricsRepository.upsertGa4Metric({
      date: startDate,
      city,
      sessions: row.metricValues?.[0]?.value || 0,
      users_count: row.metricValues?.[1]?.value || 0,
      conversions: row.metricValues?.[2]?.value || 0,
      source: "google",
    });
  }

  logger.info("[seo.metrics] GA4 coletado com sucesso");
}
