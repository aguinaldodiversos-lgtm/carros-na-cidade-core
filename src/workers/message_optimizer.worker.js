require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

function calculateScore(sent, replies, conversions) {
  if (sent === 0) return 0;

  const replyRate = replies / sent;
  const conversionRate = conversions / sent;

  return replyRate * 0.4 + conversionRate * 0.6;
}

async function runMessageOptimizer() {
  try {
    console.log("🧪 Rodando Message Optimization Engine...");

    const cities = await pool.query(`
      SELECT DISTINCT city_id
      FROM message_variants
      WHERE is_active = true
    `);

    for (const row of cities.rows) {
      const cityId = row.city_id;

      const variants = await pool.query(
        `
        SELECT *
        FROM message_variants
        WHERE city_id = $1
        AND is_active = true
      `,
        [cityId]
      );

      let bestVariant = null;
      let bestScore = -1;

      for (const variant of variants.rows) {
        const score = calculateScore(
          variant.sent_count,
          variant.reply_count,
          variant.conversion_count
        );

        await pool.query(
          `
          UPDATE message_variants
          SET score = $1
          WHERE id = $2
        `,
          [score, variant.id]
        );

        if (score > bestScore && variant.sent_count > 10) {
          bestScore = score;
          bestVariant = variant;
        }
      }

      if (bestVariant) {
        await pool.query(
          `
          UPDATE message_variants
          SET is_winner = false
          WHERE city_id = $1
        `,
          [cityId]
        );

        await pool.query(
          `
          UPDATE message_variants
          SET is_winner = true
          WHERE id = $1
        `,
          [bestVariant.id]
        );

        console.log(
          `🏆 Cidade ${cityId} nova mensagem vencedora: ${bestVariant.id}`
        );
      }
    }

    console.log("✅ Message optimization finalizado");
  } catch (err) {
    console.error("❌ Erro no message optimizer:", err);
  }
}

function startMessageOptimizerWorker() {
  setInterval(runMessageOptimizer, 3 * 60 * 60 * 1000);
  runMessageOptimizer();
}

module.exports = { startMessageOptimizerWorker };
