require("dotenv").config();
const { Pool } = require("pg");
const { generateCityPost } = require("../services/socialPost.service");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function runSocialPresence() {
  try {
    console.log("📣 Rodando Social Presence Agent...");

    // Buscar cidades prioritárias
    const cities = await pool.query(`
      SELECT cgs.city_id, c.name
      FROM city_growth_state cgs
      JOIN cities c ON c.id = cgs.city_id
      WHERE cgs.priority_level IN ('critical', 'high')
      LIMIT 5
    `);

    for (const city of cities.rows) {
      // evitar posts duplicados recentes
      const recent = await pool.query(
        `
        SELECT id
        FROM social_posts
        WHERE city_id = $1
        AND created_at > NOW() - INTERVAL '24 hours'
        LIMIT 1
      `,
        [city.city_id]
      );

      if (recent.rowCount > 0) {
        continue;
      }

      const postText = generateCityPost(city.name);

      await pool.query(
        `
        INSERT INTO social_posts (
          city_id,
          post_text,
          status
        )
        VALUES ($1, $2, 'pending')
      `,
        [city.city_id, postText]
      );

      console.log(`📝 Post criado para ${city.name}`);
    }

    console.log("✅ Social Presence finalizado");
  } catch (err) {
    console.error("❌ Erro no Social Presence Agent:", err);
  }
}

function startSocialPresenceWorker() {
  // roda a cada 3 horas
  setInterval(runSocialPresence, 3 * 60 * 60 * 1000);
  runSocialPresence();
}

module.exports = { startSocialPresenceWorker };
