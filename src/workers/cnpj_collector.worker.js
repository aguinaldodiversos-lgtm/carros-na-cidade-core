require("dotenv").config();
const { Pool } = require("pg");
const { collectCnpjLeads } = require("../services/cnpjCollector.service");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function runCnpjCollector() {
  try {
    console.log("🏢 Rodando CNPJ Collector...");

    const cities = await pool.query(`
      SELECT c.id, c.name
      FROM city_growth_state cgs
      JOIN cities c ON c.id = cgs.city_id
      WHERE cgs.priority_level IN ('critical', 'high')
      LIMIT 5
    `);

    for (const city of cities.rows) {
      await collectCnpjLeads(city.id, city.name);
    }

    console.log("✅ CNPJ Collector finalizado");
  } catch (err) {
    console.error("❌ Erro no CNPJ Collector:", err);
  }
}

function startCnpjCollectorWorker() {
  // executa a cada 12 horas
  setInterval(runCnpjCollector, 12 * 60 * 60 * 1000);
  runCnpjCollector();
}

module.exports = { startCnpjCollectorWorker };
