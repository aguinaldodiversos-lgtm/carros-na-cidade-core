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

async function generateMessages(city) {
  const prompt = `
Você é um especialista em vendas para lojistas de veículos.

Crie 3 mensagens curtas de WhatsApp para convidar um lojista da cidade de ${city.name}-${city.state} a anunciar no portal Carros na Cidade.

Perfil da cidade:
- Tipo: ${city.city_type}
- Estágio: ${city.status}
- Opportunity score: ${city.opportunity_score || 0}

Regras:
- Tom direto e profissional
- Máximo 3 linhas
- Foco em captar novos clientes
- Não usar emojis exagerados
- Linguagem natural de WhatsApp

Retorne apenas as mensagens, separadas por linha.
`;

  const response = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.7,
  });

  const text = response.choices[0].message.content;
  return text.split("\n").filter((m) => m.trim().length > 10);
}

async function insertVariants(cityId, messages) {
  for (const msg of messages) {
    await pool.query(
      `
      INSERT INTO message_variants (
        city_id,
        message_text
      )
      VALUES ($1,$2)
    `,
      [cityId, msg]
    );
  }
}

async function runMessageGenerator() {
  try {
    console.log("🤖 Rodando AI Message Generator...");

    const cities = await pool.query(`
      SELECT
        c.id,
        c.name,
        c.state,
        css.city_type,
        css.status,
        co.opportunity_score,
        COUNT(mv.id) AS variants
      FROM city_strategy_state css
      JOIN cities c ON c.id = css.city_id
      LEFT JOIN city_opportunities co ON co.city_id = c.id
      LEFT JOIN message_variants mv ON mv.city_id = c.id
      GROUP BY
        c.id, c.name, c.state,
        css.city_type, css.status,
        co.opportunity_score
      HAVING COUNT(mv.id) < 3
      LIMIT 20
    `);

    for (const city of cities.rows) {
      const messages = await generateMessages(city);
      await insertVariants(city.id, messages);

      console.log(`✉️ Novas mensagens criadas para ${city.name}-${city.state}`);
    }

    console.log("✅ Message generator finalizado");
  } catch (err) {
    console.error("❌ Erro no message generator:", err);
  }
}

function startMessageGeneratorWorker() {
  setInterval(runMessageGenerator, 6 * 60 * 60 * 1000);
  runMessageGenerator();
}

module.exports = { startMessageGeneratorWorker };
