require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function runEventScheduler() {
  try {
    console.log("📅 Rodando Event Scheduler...");

    // ativar eventos da semana
    await pool.query(`
      UPDATE events
      SET status = 'active'
      WHERE status = 'queued'
      AND start_date <= NOW()
      AND end_date >= NOW()
    `);

    // finalizar eventos vencidos
    await pool.query(`
      UPDATE events
      SET status = 'finished'
      WHERE status = 'active'
      AND end_date < NOW()
    `);

    console.log("✅ Event scheduler executado");
  } catch (err) {
    console.error("Erro no event scheduler:", err);
  }
}

function startEventSchedulerWorker() {
  setInterval(runEventScheduler, 5 * 60 * 1000);
  runEventScheduler();
}

module.exports = { startEventSchedulerWorker };
