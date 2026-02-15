require("dotenv").config();
const { Pool } = require("pg");

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

async function runSeoWorker() {
  try {
    console.log("🌐 Rodando SEO Worker inteligente...");

    // 1) Buscar cidades com maior oportunidade
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

      // 2) Garantir páginas principais da cidade
      await garantirSEO(cidade, pool);

      // 3) Buscar modelos mais procurados na cidade
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

        // 4) Verificar se artigo já existe
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

    console.log("✅ SEO Worker finalizado");
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
