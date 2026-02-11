const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

/* =====================================================
   LIMITES
===================================================== */

const MAX_EMAILS_PER_DAY = 1;
const MAX_WHATSAPP_PER_DAY = 1;

/* =====================================================
   FUNÇÃO PRINCIPAL
===================================================== */

async function notifyMatchingAlerts(ad) {
  console.log("🚨 Matcher executado para anúncio:", ad.id, ad.city);

  try {
    const result = await pool.query(
      `
      SELECT a.*, u.email
      FROM alerts a
      JOIN users u ON u.id = a.user_id
      WHERE
        LOWER(a.city) = LOWER($1)
        AND (a.brand IS NULL OR LOWER(a.brand) = LOWER($2))
        AND (a.model IS NULL OR LOWER(a.model) = LOWER($3))
        AND (a.price_max IS NULL OR $4 <= a.price_max)
        AND (a.year_min IS NULL OR $5 >= a.year_min)
      `,
      [
        ad.city,
        ad.brand,
        ad.model,
        ad.price,
        ad.year,
      ]
    );

    const alerts = result.rows;

    for (const alert of alerts) {
      await queueNotification(alert, ad, "email", MAX_EMAILS_PER_DAY);
      await queueNotification(alert, ad, "whatsapp", MAX_WHATSAPP_PER_DAY);
    }

    console.log(`📢 ${alerts.length} alertas processados`);
  } catch (err) {
    console.error("Erro ao verificar alertas:", err);
  }
}

/* =====================================================
   FILA DE NOTIFICAÇÃO
===================================================== */

async function queueNotification(alert, ad, channel, dailyLimit) {
  try {
    // verificar quantos envios hoje
    const todayResult = await pool.query(
      `
      SELECT COUNT(*) AS count
      FROM notification_queue
      WHERE user_id = $1
        AND channel = $2
        AND created_at >= CURRENT_DATE
      `,
      [alert.user_id, channel]
    );

    const todayCount = parseInt(todayResult.rows[0].count, 10);

    if (todayCount >= dailyLimit) {
      console.log(
        `⛔ Limite diário atingido para user ${alert.user_id} (${channel})`
      );
      return;
    }

    // evitar duplicação
    const duplicateCheck = await pool.query(
      `
      SELECT id
      FROM notification_queue
      WHERE alert_id = $1
        AND ad_id = $2
        AND channel = $3
      `,
      [alert.id, ad.id, channel]
    );

    if (duplicateCheck.rows.length > 0) {
      console.log(
        `⚠️ Notificação duplicada ignorada (alert ${alert.id}, ad ${ad.id}, ${channel})`
      );
      return;
    }

    // inserir na fila
    await pool.query(
      `
      INSERT INTO notification_queue
      (user_id, alert_id, ad_id, channel, status)
      VALUES ($1, $2, $3, $4, 'pending')
      `,
      [alert.user_id, alert.id, ad.id, channel]
    );

    console.log(
      `📨 Notificação enfileirada: user ${alert.user_id} (${channel})`
    );
  } catch (err) {
    console.error("Erro ao enfileirar notificação:", err);
  }
}

module.exports = {
  notifyMatchingAlerts,
};
