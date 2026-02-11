require("dotenv").config();
const { Pool } = require("pg");
const { collectDealersForCity } = require("../services/dealerCollector.service");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function runDealerCollector() {
  try {
    console.log("🏬 Rodando Dealer Collector...");

    // Buscar cidades críticas
    const cities = await pool.query(`
      SELECT DISTINCT ON (city_id)
        city_id
      FROM city_opportunities
      WHERE priority_level IN ('critical', 'high')
      ORDER BY city_id, created_at DESC
      LIMIT 5
    `);

    for (const row of cities.rows) {
      await collectDealersForCity(row.city_id);
    }
  } catch (err) {
    console.error("❌ Erro no Dealer Collector:", err);
  }
}

function startDealerCollectorWorker() {
  // roda a cada 6 horas
  setInterval(runDealerCollector, 6 * 60 * 60 * 1000);
  runDealerCollector();
}

module.exports = { startDealerCollectorWorker };
