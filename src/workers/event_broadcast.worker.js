require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function runEventBroadcastWorker() {
  try {
    console.log("📣 Rodando Event Broadcast Worker...");

    const events = await pool.query(`
      SELECT
        e.id,
        e.title,
        e.banner_text,
        c.name AS city_name
      FROM events e
      JOIN cities c ON c.id = e.city_id
      WHERE e.status = 'active'
      AND e.broadcast_sent = false
      LIMIT 10
    `);

    for (const event of events.rows) {
      console.log(
        `Disparando divulgação do evento ${event.id} - ${event.title}`
      );

      // aqui entrará:
      // - envio WhatsApp
      // - envio email
      // - social post

      await pool.query(
        `
        UPDATE events
        SET broadcast_sent = true
        WHERE id = $1
        `,
        [event.id]
      );
    }

    console.log("✅ Broadcast finalizado");
  } catch (err) {
    console.error("Erro no broadcast:", err);
  }
}

function startEventBroadcastWorker() {
  setInterval(runEventBroadcastWorker, 2 * 60 * 1000);
  runEventBroadcastWorker();
}

module.exports = { startEventBroadcastWorker };
