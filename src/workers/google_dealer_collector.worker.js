require("dotenv").config();
const { Pool } = require("pg");

const {
  buscarLojasGoogle,
} = require("../services/acquisition/googlePlaces.service");

const { addWhatsAppJob } = require("../queues/whatsapp.queue");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function runGoogleDealerCollector() {
  try {
    console.log("🌍 Coletando lojistas via Google Places...");

    const citiesResult = await pool.query(`
      SELECT c.id, c.name
      FROM cities c
      JOIN city_status s
        ON s.city_id = c.id
      WHERE s.status IN ('growing', 'dominated')
      LIMIT 3
    `);

    const cities = citiesResult.rows;

    for (const cidade of cities) {
      const lojas = await buscarLojasGoogle(cidade);

      for (const loja of lojas) {
        // Verificar se já existe
        const exists = await pool.query(
          `
          SELECT id FROM dealer_leads
          WHERE lead_name = $1
          LIMIT 1
          `,
          [loja.name]
        );

        if (exists.rows.length > 0) continue;

        // Salvar no banco
        await pool.query(
          `
          INSERT INTO dealer_leads
          (
            advertiser_id,
            lead_name,
            lead_phone,
            lead_price_range,
            city_id,
            created_at
          )
          VALUES (NULL, $1, NULL, 'google_capture', $2, NOW())
          `,
          [loja.name, cidade.id]
        );

        console.log(
          `🏪 Loja captada: ${loja.name} (${cidade.name})`
        );
      }
    }

    console.log("✅ Coleta de lojistas finalizada");
  } catch (err) {
    console.error("❌ Erro no Google dealer collector:", err);
  }
}

function startGoogleDealerCollectorWorker() {
  runGoogleDealerCollector();
  setInterval(runGoogleDealerCollector, 24 * 60 * 60 * 1000);
}

module.exports = {
  startGoogleDealerCollectorWorker,
};
