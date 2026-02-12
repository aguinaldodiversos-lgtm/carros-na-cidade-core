require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function runDealerConversion() {
  try {
    console.log("🔎 Rodando Dealer Conversion...");

    const leads = await pool.query(`
      SELECT id, phone
      FROM dealer_leads
      WHERE contacted = true
        AND converted = false
      LIMIT 50
    `);

    for (const lead of leads.rows) {
      const result = await pool.query(
        `
        SELECT id
        FROM users
        WHERE phone = $1
        LIMIT 1
      `,
        [lead.phone]
      );

      if (result.rowCount > 0) {
        await pool.query(
          `
          UPDATE dealer_leads
          SET converted = true,
              converted_at = NOW()
          WHERE id = $1
        `,
          [lead.id]
        );

        console.log(`💰 Lead convertido: ${lead.id}`);
      }
    }

    console.log("✅ Conversões atualizadas");
  } catch (err) {
    console.error("❌ Erro na conversão:", err);
  }
}

function startDealerConversionWorker() {
  setInterval(runDealerConversion, 10 * 60 * 1000);
  runDealerConversion();
}

module.exports = { startDealerConversionWorker };
