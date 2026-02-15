require("dotenv").config();
const { Pool } = require("pg");

const { addWhatsAppJob } = require("../queues/whatsapp.queue");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

/* =====================================================
   BUSCAR ANÚNCIOS RECENTES
===================================================== */
async function getRecentAds() {
  const result = await pool.query(`
    SELECT *
    FROM ads
    WHERE status = 'active'
      AND created_at > NOW() - INTERVAL '10 minutes'
  `);

  return result.rows;
}

/* =====================================================
   BUSCAR ALERTS COMPATÍVEIS
===================================================== */
async function getMatchingAlerts(ad) {
  const result = await pool.query(
    `
    SELECT *
    FROM alerts
    WHERE city_id = $1
      AND (brand IS NULL OR brand = $2)
      AND (model IS NULL OR model = $3)
    `,
    [ad.city_id, ad.brand, ad.model]
  );

  return result.rows;
}

/* =====================================================
   ENVIAR ALERTAS
===================================================== */
async function processAd(ad) {
  try {
    const alerts = await getMatchingAlerts(ad);

    if (alerts.length === 0) return;

    console.log(
      `📣 ${alerts.length} alerts compatíveis para anúncio ${ad.id}`
    );

    for (const alert of alerts) {
      const message = `
🚗 Encontramos um carro para você!

${ad.brand} ${ad.model}
Ano: ${ad.year}
Preço: R$ ${ad.price}
Cidade: ${ad.city}

Veja o anúncio:
${process.env.FRONTEND_URL}/anuncio/${ad.slug}
`;

      await addWhatsAppJob({
        phone: alert.phone,
        lead: {
          name: alert.name,
          phone: alert.phone,
          message_override: message,
        },
      });
    }
  } catch (err) {
    console.error("Erro ao processar anúncio:", ad.id, err);
  }
}

/* =====================================================
   WORKER PRINCIPAL
===================================================== */
async function runAlertMatchWorker() {
  try {
    console.log("🔎 Rodando alert match worker...");

    const ads = await getRecentAds();

    for (const ad of ads) {
      await processAd(ad);
    }

    console.log("✅ Alert match finalizado");
  } catch (err) {
    console.error("❌ Erro no alert match worker:", err);
  }
}

function startAlertMatchWorker() {
  runAlertMatchWorker();

  // roda a cada 5 minutos
  setInterval(runAlertMatchWorker, 5 * 60 * 1000);
}

module.exports = {
  startAlertMatchWorker,
};
