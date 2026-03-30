require("dotenv").config();
const { Pool } = require("pg");

const { ativarAquisicaoDeLojistas } = require("../services/acquisition/dealerAcquisition.service");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function runDealerAcquisition() {
  try {
    console.log("🏪 Rodando aquisição automática de lojistas...");

    const result = await pool.query(`
      SELECT c.id, c.name, c.slug, o.priority_level
      FROM cities c
      JOIN city_opportunities o
        ON o.city_id = c.id
      WHERE o.priority_level IN ('critical', 'high')
      LIMIT 3
    `);

    const cities = result.rows;

    for (const cidade of cities) {
      await ativarAquisicaoDeLojistas(cidade, pool);
    }

    console.log("✅ Aquisição de lojistas finalizada");
  } catch (err) {
    console.error("❌ Erro no dealer acquisition worker:", err);
  }
}

function startDealerAcquisitionWorker() {
  runDealerAcquisition();
  setInterval(runDealerAcquisition, 6 * 60 * 60 * 1000);
}

module.exports = {
  startDealerAcquisitionWorker,
};
