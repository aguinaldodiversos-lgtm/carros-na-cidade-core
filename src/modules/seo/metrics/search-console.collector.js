import path from "path";
import { fileURLToPath } from "url";
import { google } from "googleapis";
import * as seoMetricsRepository from "./seo-metrics.repository.js";
import { logger } from "../../../shared/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const keyPath = path.join(
  __dirname,
  "../../../credentials/google-service-account.json"
);

export async function collectSearchConsoleData(startDate, endDate) {
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
      rowLimit: 1000,
    },
  });

  if (!response.data.rows?.length) {
    logger.info("[seo.metrics] Nenhum dado do Search Console encontrado");
    return;
  }

  for (const row of response.data.rows) {
    await seoMetricsRepository.upsertSearchConsoleMetric({
      date: startDate,
      city: "global",
      impressions: row.impressions,
      clicks: row.clicks,
      ctr: row.ctr,
      avg_position: row.position,
      source: "google",
    });
  }

  logger.info("[seo.metrics] Search Console coletado com sucesso");
}
