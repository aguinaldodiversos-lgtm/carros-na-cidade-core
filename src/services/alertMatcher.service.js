const { Pool } = require("pg");
const { sendNewAdAlert } = require("./email.service");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function notifyMatchingAlerts(ad) {
  try {
    const result = await pool.query(
      `
      SELECT a.*, u.email
      FROM alerts a
      JOIN users u ON u.id = a.user_id
      WHERE
        (a.city = $1)
        AND (a.brand IS NULL OR a.brand = $2)
        AND (a.model IS NULL OR a.model = $3)
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

    for (const alert of alerts) {
      await sendNewAdAlert(alert.email, ad);
    }

    console.log(`📢 ${alerts.length} alertas notificados`);
  } catch (err) {
    console.error("Erro ao verificar alertas:", err);
  }
}

module.exports = { notifyMatchingAlerts };
