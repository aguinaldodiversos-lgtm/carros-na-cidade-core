async function notifyMatchingAlerts(ad) {
  console.log("🚨 Matcher executado para anúncio:", ad.id);

const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function notifyMatchingAlerts(ad) {
  try {
    const result = await pool.query(
      `
      SELECT a.*, u.phone
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
        ad.year
      ]
    );

    const alerts = result.rows;
    const now = new Date();

    for (const alert of alerts) {
      try {
        // ================================
        // RESET DIÁRIO DO WHATSAPP
        // ================================
        if (
          !alert.whatsapp_last_reset ||
          new Date(alert.whatsapp_last_reset).toDateString() !==
            now.toDateString()
        ) {
          await pool.query(
            `
            UPDATE alerts
            SET whatsapp_sent_today = 0,
                whatsapp_last_reset = CURRENT_DATE
            WHERE id = $1
            `,
            [alert.id]
          );

          alert.whatsapp_sent_today = 0;
        }

        // ================================
        // VERIFICAR LIMITE WHATSAPP
        // ================================
        let canSendWhatsApp = false;

        if (alert.phone && alert.whatsapp_sent_today < 3) {
          if (alert.last_whatsapp_sent_at) {
            const last = new Date(alert.last_whatsapp_sent_at);
            const diffHours = (now - last) / (1000 * 60 * 60);

            if (diffHours >= 2) {
              canSendWhatsApp = true;
            }
          } else {
            canSendWhatsApp = true;
          }
        }

        // ================================
        // INSERIR NA FILA
        // ================================
        if (canSendWhatsApp) {
          await pool.query(
            `
            INSERT INTO notification_queue
            (user_id, alert_id, ad_id, channel)
            VALUES ($1, $2, $3, 'whatsapp')
            `,
            [alert.user_id, alert.id, ad.id]
          );

          continue;
        }

        // ================================
        // FALLBACK PARA EMAIL (1 POR DIA)
        // ================================
        let canSendEmail = false;

        if (alert.last_email_sent_at) {
          const last = new Date(alert.last_email_sent_at);
          const diffHours = (now - last) / (1000 * 60 * 60);

          if (diffHours >= 24) {
            canSendEmail = true;
          }
        } else {
          canSendEmail = true;
        }

        if (canSendEmail) {
          await pool.query(
            `
            INSERT INTO notification_queue
            (user_id, alert_id, ad_id, channel)
            VALUES ($1, $2, $3, 'email')
            `,
            [alert.user_id, alert.id, ad.id]
          );
        }
      } catch (err) {
        console.error(`Erro ao processar alerta ${alert.id}:`, err);
      }
    }

    console.log(`📢 ${alerts.length} alertas processados`);
  } catch (err) {
    console.error("Erro geral no alertMatcher:", err);
  }
}

module.exports = { notifyMatchingAlerts };
