require("dotenv").config();
const { Pool } = require("pg");
const { processCnpj } = require("../services/openCnpjCollector.service");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function runOpenCnpjCollector() {
  try {
    console.log("🏢 Rodando OpenCNPJ Collector...");

    // Exemplo: pegar leads de uma tabela base de CNPJs
    const result = await pool.query(`
      SELECT id, cnpj, city_id
      FROM cnpj_seed
      WHERE processed = false
      LIMIT 50
    `);

    for (const row of result.rows) {
      await processCnpj(row.cnpj, row.city_id);

      await pool.query(
        `
        UPDATE cnpj_seed
        SET processed = true
        WHERE id = $1
      `,
        [row.id]
      );
    }

    console.log("✅ OpenCNPJ Collector finalizado");
  } catch (err) {
    console.error("❌ Erro no OpenCNPJ Collector:", err);
  }
}

function startOpenCnpjCollectorWorker() {
  setInterval(runOpenCnpjCollector, 30 * 60 * 1000); // a cada 30 min
  runOpenCnpjCollector();
}

module.exports = { startOpenCnpjCollectorWorker };
