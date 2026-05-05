require("dotenv").config();
const { Pool } = require("pg");
const { sendWhatsAppAlert } = require("../services/whatsapp.service");
const { refuseIfEventsWorkerDisabled } = require("./_events_guard.cjs");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// número do administrador
const ADMIN_PHONE = process.env.ADMIN_PHONE;

async function runEventFailSafeWorker() {
  try {
    console.log("🛡️ Rodando Event Fail-Safe Worker...");

    const result = await pool.query(`
      SELECT
        e.id,
        e.title,
        e.start_date,
        e.status,
        e.admin_alert_sent,
        a.name AS advertiser_name,
        c.name AS city_name
      FROM events e
      JOIN advertisers a ON a.id = e.advertiser_id
      JOIN cities c ON c.id = e.city_id
      WHERE e.status IN ('paid','queued')
      AND e.start_date <= NOW()
    `);

    for (const event of result.rows) {
      console.log(`⚠️ Evento não ativo detectado: ${event.id}`);

      // tentativa de correção automática
      await pool.query(
        `
        UPDATE events
        SET
          status = 'active',
          activated_at = NOW()
        WHERE id = $1
        `,
        [event.id]
      );

      console.log(`✅ Evento ${event.id} ativado automaticamente`);

      // enviar alerta administrativo (uma vez só)
      if (!event.admin_alert_sent && ADMIN_PHONE) {
        const message = `🚨 EVENTO ATIVADO PELO SISTEMA

Cidade: ${event.city_name}
Loja: ${event.advertiser_name}
Evento: ${event.title}

O evento deveria estar ativo, mas não estava.
O sistema ativou automaticamente.
Verifique no painel.`;

        await sendWhatsAppAlert(ADMIN_PHONE, {
          brand: "Sistema",
          model: "Alerta administrativo",
          year: "",
          price: "",
          city: "",
          slug: "",
          id: "",
          message_override: message,
        });

        await pool.query(
          `
          UPDATE events
          SET admin_alert_sent = true
          WHERE id = $1
          `,
          [event.id]
        );

        console.log(`📲 Alerta enviado para admin`);
      }
    }

    console.log("🛡️ Fail-Safe finalizado");
  } catch (err) {
    console.error("Erro no fail-safe:", err);
  }
}

function startEventFailSafeWorker() {
  if (refuseIfEventsWorkerDisabled("event_fail_safe")) return;
  setInterval(runEventFailSafeWorker, 10 * 60 * 1000);
  runEventFailSafeWorker();
}

module.exports = { startEventFailSafeWorker };
