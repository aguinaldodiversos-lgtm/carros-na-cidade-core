require("dotenv").config();
const { Pool } = require("pg");
const OpenAI = require("openai");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function generateBannerText(event) {
  const prompt = `
Crie um texto curto para banner de evento automotivo.

Dados:
Loja: ${event.advertiser_name}
Evento: ${event.title}
Cidade: ${event.city_name}-${event.state}
Datas: ${event.start_date} a ${event.end_date}

Regras:
- máximo 12 palavras
- tom comercial
- objetivo: atrair clientes
`;

  const response = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.6,
  });

  return response.choices[0].message.content.trim();
}

async function runEventBannerWorker() {
  try {
    console.log("🖼️ Rodando Event Banner Worker...");

    const events = await pool.query(`
      SELECT
        e.id,
        e.title,
        e.start_date,
        e.end_date,
        a.name AS advertiser_name,
        c.name AS city_name,
        c.state
      FROM events e
      JOIN advertisers a ON a.id = e.advertiser_id
      JOIN cities c ON c.id = e.city_id
      WHERE e.status = 'waiting_banner'
      AND e.banner_status = 'pending'
      LIMIT 10
    `);

    for (const event of events.rows) {
      const text = await generateBannerText(event);

      await pool.query(
        `
        UPDATE events
        SET
          banner_text = $1,
          banner_status = 'generated'
        WHERE id = $2
        `,
        [text, event.id]
      );

      console.log(`Banner gerado para evento ${event.id}`);
    }

    console.log("✅ Event Banner Worker finalizado");
  } catch (err) {
    console.error("Erro no event banner worker:", err);
  }
}

function startEventBannerWorker() {
  setInterval(runEventBannerWorker, 60 * 1000);
  runEventBannerWorker();
}

module.exports = { startEventBannerWorker };
