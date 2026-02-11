require("dotenv").config();
const { Pool } = require("pg");
const { publishPost } = require("../services/socialPublisher.service");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function processPost(post) {
  try {
    console.log(`📤 Publicando post ${post.id}`);

    const success = await publishPost(post);

    if (success) {
      await pool.query(
        `
        UPDATE social_posts
        SET status = 'published',
            published_at = NOW()
        WHERE id = $1
      `,
        [post.id]
      );

      console.log(`✅ Post ${post.id} publicado`);
    } else {
      throw new Error("Falha na publicação");
    }
  } catch (err) {
    console.error(`❌ Erro no post ${post.id}:`, err.message);

    await pool.query(
      `
      UPDATE social_posts
      SET status = 'failed'
      WHERE id = $1
    `,
      [post.id]
    );
  }
}

async function runSocialPublisher() {
  try {
    console.log("📡 Rodando Social Publisher...");

    const posts = await pool.query(
      `
      SELECT *
      FROM social_posts
      WHERE status = 'pending'
      ORDER BY created_at ASC
      LIMIT 5
    `
    );

    for (const post of posts.rows) {
      await processPost(post);
    }
  } catch (err) {
    console.error("❌ Erro no Social Publisher:", err);
  }
}

function startSocialPublisherWorker() {
  // roda a cada 10 minutos
  setInterval(runSocialPublisher, 10 * 60 * 1000);
  runSocialPublisher();
}

module.exports = { startSocialPublisherWorker };
