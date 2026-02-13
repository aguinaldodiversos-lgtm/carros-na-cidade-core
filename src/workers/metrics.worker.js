const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function runMetricsWorker() {
  console.log("📊 Metrics worker rodando...");

  try {
    // exemplo simples: limpeza de métricas antigas (90 dias)
    await pool.query(`
      DELETE FROM advertiser_metrics
      WHERE created_at < NOW() - INTERVAL '90 days'
    `);

    await pool.query(`
      DELETE FROM event_metrics
      WHERE created_at < NOW() - INTERVAL '90 days'
    `);

    console.log("📊 Métricas antigas limpas");
  } catch (err) {
    console.error("Erro no metrics worker:", err);
  }
}

function startMetricsWorker() {
  setInterval(runMetricsWorker, 1000 * 60 * 60 * 6); // a cada 6h
}

module.exports = { startMetricsWorker };
