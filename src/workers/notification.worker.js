const { Pool } = require("pg");
const { sendNewAdAlert } = require("../services/email.service");
const { sendWhatsAppAlert } = require("../services/whatsapp.service");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function processQueue() {
  try {
    console.log("🔄 Processando fila de notificações...");

    const result = await pool.query(`
      SELECT q.*, u.email, u.phone, a.title, a.price, a.city, a.slug, a.brand, a.model, a.year
      FROM notification_queue q
      JOIN users u ON u.id = q.user_id
      JOIN ads a ON a.id = q.ad_id
      WHERE q.status = 'pending'
      ORDER BY q.created_at ASC
      LIMIT 20
    `);

    console.log(`📦 ${result.rows.length} itens na fila`);

    for (const item of result.rows) {
      try {
        let success = false;

        if (item.channel === "email") {
          success = await sendNewAdAlert(item.email, item);
        }

        if (item.channel === "whatsapp") {
          success = await sendWhatsAppAlert(item.phone, item);
        }

        if (success) {
          await pool.query(
            `UPDATE notification_queue
             SET status = 'sent'
             WHERE id = $1`,
            [item.id]
          );
        } else {
          await pool.query(
            `UPDATE notification_queue
             SET attempts = attempts + 1,
                 status = 'failed'
             WHERE id = $1`,
            [item.id]
          );
        }
      } catch (err) {
        console.error("Erro ao enviar item:", err.message);
      }
    }
  } catch (err) {
    console.error("Erro no worker:", err.message);
  }
}

function startWorker() {
  console.log("🚀 Notification worker iniciado");
  setInterval(processQueue, 10000);
}

module.exports = { startWorker };
