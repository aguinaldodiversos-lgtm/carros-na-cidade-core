const { Pool } = require("pg");
const { generateSeoArticle } = require("../services/seoAI.service");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function runSeoEngine() {
  try {
    console.log("📝 Rodando motor de SEO com IA...");

    // cidades estratégicas
    const citiesResult = await pool.query(`
      SELECT city, COUNT(*) as alerts
      FROM alerts
      GROUP BY city
      ORDER BY alerts DESC
      LIMIT 3
    `);

    for (const cityRow of citiesResult.rows) {
      const city = cityRow.city;

      // modelos mais procurados na cidade
      const modelsResult = await pool.query(`
        SELECT brand, model, COUNT(*) as total
        FROM alerts
        WHERE city = $1
          AND brand IS NOT NULL
          AND model IS NOT NULL
        GROUP BY brand, model
        ORDER BY total DESC
        LIMIT 2
      `, [city]);

      for (const row of modelsResult.rows) {
        const { brand, model } = row;

        // verificar se já existe artigo
        const exists = await pool.query(
          `
          SELECT id FROM blog_posts
          WHERE city = $1 AND brand = $2 AND model = $3
          LIMIT 1
          `,
          [city, brand, model]
        );

        if (exists.rows.length > 0) continue;

        console.log(`✍️ Gerando artigo: ${brand} ${model} em ${city}`);

        const article = await generateSeoArticle({
          city,
          brand,
          model,
        });

        if (!article) continue;

        await pool.query(
          `
          INSERT INTO blog_posts
          (title, content, city, brand, model, status)
          VALUES ($1, $2, $3, $4, $5, 'published')
          `,
          [
            article.title,
            article.content,
            city,
            brand,
            model,
          ]
        );

        console.log(`✅ Artigo criado: ${article.title}`);
      }
    }
  } catch (err) {
    console.error("Erro no SEO worker:", err);
  }
}

function startSeoWorker() {
  setInterval(runSeoEngine, 1000 * 60 * 60 * 6); // a cada 6h
}

module.exports = { startSeoWorker };
