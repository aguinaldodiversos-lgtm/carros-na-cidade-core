import "dotenv/config";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import { google } from "googleapis";
import { BetaAnalyticsDataClient } from "@google-analytics/data";
import { logger } from "../shared/logger.js";

import seoAiService from "../services/seoAI.service.js";
import seoPagesService from "../services/seo/seoPages.service.js";

const { Pool } = pg;
const { generateSeoArticle } = seoAiService;
const { garantirSEO } = seoPagesService;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const keyPath = path.join(
  __dirname,
  "../credentials/google-service-account.json"
);

const analyticsClient = new BetaAnalyticsDataClient({
  keyFilename: keyPath,
});

let seoInterval = null;
let seoRunning = false;
let seoStarted = false;

async function collectSearchConsoleData(startDate, endDate) {
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
    logger.info("[seo.worker] Nenhum dado do Search Console encontrado");
    return;
  }

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
        "global",
        row.impressions,
        row.clicks,
        row.ctr,
        row.position,
        "google",
      ]
    );
  }

  logger.info("[seo.worker] Search Console coletado com sucesso");
}

async function collectGA4Data(startDate, endDate) {
  const propertyId = process.env.GA4_PROPERTY_ID;

  if (!propertyId) {
    logger.warn("[seo.worker] GA4_PROPERTY_ID não definido");
    return;
  }

  const [response] = await analyticsClient.runReport({
    property: `properties/${propertyId}`,
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: "city" }],
    metrics: [
      { name: "sessions" },
      { name: "totalUsers" },
      { name: "conversions" },
    ],
  });

  for (const row of response.rows || []) {
    const city = row.dimensionValues?.[0]?.value || "unknown";

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
        row.metricValues?.[0]?.value || 0,
        row.metricValues?.[1]?.value || 0,
        row.metricValues?.[2]?.value || 0,
        "google",
      ]
    );
  }

  logger.info("[seo.worker] GA4 coletado com sucesso");
}

async function runSeoWorker() {
  if (seoRunning) {
    logger.warn("[seo.worker] Execução já em andamento; nova rodada ignorada");
    return;
  }

  seoRunning = true;

  try {
    logger.info("[seo.worker] Iniciando processamento");

    const today = new Date().toISOString().split("T")[0];

    await collectSearchConsoleData(today, today);
    await collectGA4Data(today, today);

    const citiesResult = await pool.query(`
      SELECT c.id, c.name, c.slug, o.priority_level
      FROM cities c
      JOIN city_opportunities o
        ON o.city_id = c.id
      WHERE o.priority_level IN ('critical', 'high', 'medium')
      ORDER BY 
        CASE 
          WHEN o.priority_level = 'critical' THEN 1
          WHEN o.priority_level = 'high' THEN 2
          WHEN o.priority_level = 'medium' THEN 3
        END
      LIMIT 5
    `);

    for (const cidade of citiesResult.rows) {
      logger.info(
        {
          cityId: cidade.id,
          cityName: cidade.name,
          priorityLevel: cidade.priority_level,
        },
        "[seo.worker] Processando cidade"
      );

      await garantirSEO(cidade, pool);

      const modelsResult = await pool.query(
        `
        SELECT brand, model, COUNT(*) as total
        FROM alerts
        WHERE city_id = $1
          AND brand IS NOT NULL
          AND model IS NOT NULL
        GROUP BY brand, model
        ORDER BY total DESC
        LIMIT 2
        `,
        [cidade.id]
      );

      for (const row of modelsResult.rows) {
        const { brand, model } = row;

        const exists = await pool.query(
          `
          SELECT id
          FROM blog_posts
          WHERE city = $1
            AND brand = $2
            AND model = $3
          LIMIT 1
          `,
          [cidade.name, brand, model]
        );

        if (exists.rows.length > 0) {
          continue;
        }

        logger.info(
          {
            cityName: cidade.name,
            brand,
            model,
          },
          "[seo.worker] Gerando artigo SEO"
        );

        const article = await generateSeoArticle({
          city: cidade.name,
          brand,
          model,
        });

        if (!article) {
          logger.warn(
            {
              cityName: cidade.name,
              brand,
              model,
            },
            "[seo.worker] Geração de artigo retornou vazio"
          );
          continue;
        }

        await pool.query(
          `
          INSERT INTO blog_posts
          (title, content, city, brand, model, status, created_at)
          VALUES ($1, $2, $3, $4, $5, 'published', NOW())
          `,
          [
            article.title,
            article.content,
            cidade.name,
            brand,
            model,
          ]
        );

        logger.info(
          {
            title: article.title,
            cityName: cidade.name,
          },
          "[seo.worker] Artigo criado com sucesso"
        );
      }
    }

    logger.info("[seo.worker] Processamento finalizado com sucesso");
  } catch (error) {
    logger.error({ error }, "[seo.worker] Erro no processamento");
  } finally {
    seoRunning = false;
  }
}

export async function startSeoWorker() {
  if (seoStarted) {
    logger.warn("[seo.worker] Worker já inicializado");
    return;
  }

  seoStarted = true;

  const intervalMs = Number(
    process.env.SEO_WORKER_INTERVAL_MS || 6 * 60 * 60 * 1000
  );

  logger.info({ intervalMs }, "[seo.worker] Inicializando worker");

  await runSeoWorker();

  seoInterval = setInterval(() => {
    runSeoWorker().catch((error) => {
      logger.error({ error }, "[seo.worker] Erro na execução agendada");
    });
  }, intervalMs);

  logger.info("[seo.worker] Agendamento configurado");
}

export async function stopSeoWorker() {
  if (!seoStarted) {
    logger.info("[seo.worker] Nenhum worker ativo para encerrar");
    return;
  }

  if (seoInterval) {
    clearInterval(seoInterval);
    seoInterval = null;
  }

  seoStarted = false;

  logger.info("[seo.worker] Worker encerrado com sucesso");
}
