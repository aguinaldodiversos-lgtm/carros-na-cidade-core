const { Pool } = require("pg");
const { sendNewAdAlert } = require("../services/email.service");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function processQueue() {
  try {
    console.log("🔄 Processando fila de notificações...");

    const result = await pool.query(`
      SELECT q.*, u.email, a.title, a.price
      FROM notification_queue q
      JOIN users u ON u.id = q.user_id
      JOIN ads a ON a.id = q.ad_id
      WHERE q.status = 'pending'
      ORDER BY q.created_at
      LIMIT 10
    `);

    console.log(`📦 ${result.rows.length} itens na fila`);

    for (const job of result.rows) {
      try {
        if (job.channel === "email" && job.email) {
          await sendNewAdAlert(job.email, {
            id: job.ad_id,
            title: job.title,
            price: job.price,
          });
        }

        await pool.query(
          `
          UPDATE notification_queue
          SET status = 'sent'
          WHERE id = $1
          `,
          [job.id]
        );

        console.log(`✅ Notificação enviada (job ${job.id})`);
      } catch (err) {
        await pool.query(
          `
          UPDATE notification_queue
          SET attempts = attempts + 1,
              last_error = $2
          WHERE id = $1
          `,
          [job.id, err.message]
        );

        console.error(`❌ Erro no job ${job.id}:`, err.message);
      }
    }
  } catch (err) {
    console.error("❌ Erro geral no worker:", err);
  }
}

function startWorker() {
  console.log("🚀 Notification worker iniciado");
  setInterval(processQueue, 10000);
}

startWorker();
