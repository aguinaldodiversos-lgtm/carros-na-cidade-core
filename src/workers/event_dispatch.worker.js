const { Pool } = require("pg");
const { sendWhatsAppAlert } = require("../services/whatsapp.service");
const { sendEmail } = require("../services/email.service");
const { publishSocialPost } = require("../services/social.service");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

/* =====================================================
   GERAR MENSAGEM DO EVENTO
===================================================== */
function buildEventMessage(event) {
  return `🚗 ${event.event_type} na ${event.store_name}!

📍 ${event.city}
📅 ${event.start_date} até ${event.end_date}

Ofertas especiais por tempo limitado.
Não perca!`;
}

/* =====================================================
   DISPARAR CAMPANHA
===================================================== */
async function dispatchEvent(event) {
  try {
    const message = buildEventMessage(event);

    /* =========================
       WHATSAPP
    ========================= */
    if (event.store_phone) {
      await sendWhatsAppAlert(event.store_phone, {
        brand: event.store_name,
        model: event.event_type,
        year: "",
        price: "",
        city: event.city,
        slug: "",
      });
    }

    /* =========================
       EMAIL
    ========================= */
    if (event.store_email) {
      await sendEmail({
        to: event.store_email,
        subject: `${event.event_type} - ${event.store_name}`,
        html: `
          <h2>${event.event_type}</h2>
          <p><strong>${event.store_name}</strong></p>
          <p>${event.city}</p>
          <p>${event.start_date} até ${event.end_date}</p>
        `,
      });
    }

    /* =========================
       SOCIAL
    ========================= */
    await publishSocialPost({
      text: message,
      image: event.banner_url,
      city: event.city,
    });

    /* =========================
       MARCAR COMO ATIVO
    ========================= */
    await pool.query(
      `
      UPDATE events
      SET banner_status = 'active',
          campaign_started = true
      WHERE id = $1
      `,
      [event.id]
    );

    console.log(`📢 Campanha disparada para evento ${event.id}`);
  } catch (err) {
    console.error("Erro ao disparar evento:", err.message);
  }
}

/* =====================================================
   WORKER PRINCIPAL
===================================================== */
async function eventDispatchWorker() {
  try {
    const result = await pool.query(`
      SELECT
        e.id,
        e.event_type,
        e.start_date,
        e.end_date,
        e.banner_url,
        c.name AS city,
        a.name AS store_name,
        a.phone AS store_phone,
        a.email AS store_email
      FROM events e
      JOIN cities c ON c.id = e.city_id
      JOIN advertisers a ON a.id = e.advertiser_id
      WHERE e.banner_status = 'approved'
        AND (e.campaign_started IS NULL OR e.campaign_started = false)
      LIMIT 5
    `);

    for (const event of result.rows) {
      await dispatchEvent(event);
    }
  } catch (err) {
    console.error("Erro no event dispatch worker:", err.message);
  }
}

/* =====================================================
   START
===================================================== */
function startEventDispatchWorker() {
  console.log("📢 Event Dispatch Worker iniciado...");

  // roda a cada 3 minutos
  setInterval(eventDispatchWorker, 3 * 60 * 1000);
}

module.exports = { startEventDispatchWorker };
