require("dotenv").config();
const { Pool } = require("pg");

const {
  buscarLojasGoogle,
  buscarDetalhesLoja,
} = require("../services/acquisition/googlePlaces.service");

const { addWhatsAppJob } = require("../queues/whatsapp.queue");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

function gerarMensagemConvite(cidade) {
  return `Olá, tudo bem?

Aqui é do portal Carros na Cidade.

Temos pessoas procurando carros em ${cidade.name} neste momento.

Sua loja pode receber esses contatos gratuitamente.

Quer receber compradores interessados no seu WhatsApp?`;
}

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
      console.log(`🔎 Buscando lojas em ${cidade.name}`);

      const lojas = await buscarLojasGoogle(cidade);

      for (const loja of lojas) {
        // buscar telefone real
        const detalhes = await buscarDetalhesLoja(loja.place_id);

        if (!detalhes || !detalhes.phone) continue;

        // verificar se já existe
        const exists = await pool.query(
          `
          SELECT id FROM dealer_leads
          WHERE lead_phone = $1
          LIMIT 1
          `,
          [detalhes.phone]
        );

        if (exists.rows.length > 0) continue;

        // salvar no banco
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
          VALUES (NULL, $1, $2, 'google_capture', $3, NOW())
          `,
          [detalhes.name, detalhes.phone, cidade.id]
        );

        console.log(`🏪 Loja captada: ${detalhes.name} (${cidade.name})`);

        // enviar mensagem via WhatsApp
        const mensagem = gerarMensagemConvite(cidade);

        await addWhatsAppJob({
          phone: detalhes.phone,
          lead: {
            name: detalhes.name,
            phone: detalhes.phone,
            price_range: "convite",
            message_override: mensagem,
          },
        });
      }
    }

    console.log("✅ Coleta de lojistas finalizada");
  } catch (err) {
    console.error("❌ Erro no Google dealer collector:", err);
  }
}

function startGoogleDealerCollectorWorker() {
  runGoogleDealerCollector();

  // executa a cada 24h
  setInterval(runGoogleDealerCollector, 24 * 60 * 60 * 1000);
}

module.exports = {
  startGoogleDealerCollectorWorker,
};
