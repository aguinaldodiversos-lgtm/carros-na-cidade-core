require("dotenv").config();
const { Pool } = require("pg");
const path = require("path");
const { google } = require("googleapis");
const { BetaAnalyticsDataClient } = require("@google-analytics/data");

const {
  generateSeoArticle,
} = require("../services/seoAI.service");

const {
  garantirSEO,
} = require("../services/seo/seoPages.service");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

/* =====================================================
   CONFIG GOOGLE
===================================================== */

const keyPath = path.join(
  __dirname,
  "../credentials/google-service-account.json"
);

const analyticsClient = new BetaAnalyticsDataClient({
  keyFilename: keyPath,
});

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
        "global",
        row.impressions,
        row.clicks,
        row.ctr,
        row.position,
        "google",
      ]
    );
  }

  console.log("📊 Search Console coletado");
}

async function collectGA4Data(startDate, endDate) {
  const propertyId = process.env.GA4_PROPERTY_ID;

  if (!propertyId) {
    console.log("⚠ GA4_PROPERTY_ID não definido");
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

  console.log("📈 GA4 coletado");
}

/* =====================================================
   WORKER PRINCIPAL
===================================================== */

async function runSeoWorker() {
  try {
    console.log("🌐 Rodando SEO Worker inteligente...");

    const today = new Date().toISOString().split("T")[0];

    /* ===== 1️⃣ Coleta externa ===== */
    await collectSearchConsoleData(today, today);
    await collectGA4Data(today, today);

    /* ===== 2️⃣ Growth SEO interno ===== */

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

    const cities = citiesResult.rows;

    for (const cidade of cities) {
      console.log(`📍 Processando cidade: ${cidade.name}`);

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
          SELECT id FROM blog_posts
          WHERE city = $1 AND brand = $2 AND model = $3
          LIMIT 1
          `,
          [cidade.name, brand, model]
        );

        if (exists.rows.length > 0) continue;

        console.log(
          `✍️ Gerando artigo: ${brand} ${model} em ${cidade.name}`
        );

        const article = await generateSeoArticle({
          city: cidade.name,
          brand,
          model,
        });

        if (!article) continue;

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

        console.log(`✅ Artigo criado: ${article.title}`);
      }
    }

    console.log("🔥 SEO Worker finalizado com coleta + IA + Growth");
  } catch (err) {
    console.error("❌ Erro no SEO Worker:", err);
  }
}

function startSeoWorker() {
  runSeoWorker();
  setInterval(runSeoWorker, 6 * 60 * 60 * 1000);
}

module.exports = {
  startSeoWorker,
};
