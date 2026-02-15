const { Pool } = require("pg");
const OpenAI = require("openai");
const fs = require("fs");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/* =====================================================
   PROMPT DO BANNER (VERSÃO BARATA E OTIMIZADA)
===================================================== */
function buildBannerPrompt(event) {
  return `
Crie um banner promocional automotivo.

DADOS:
Loja: ${event.store_name}
Evento: ${event.event_type}
Cidade: ${event.city}
Data: ${event.start_date} a ${event.end_date}

REGRAS OBRIGATÓRIAS:

- Estilo gráfico moderno
- Flat design
- Sem efeitos 3D
- Sem carros realistas
- Usar silhueta simples de carro
- No máximo 3 cores
- Fundo com cor sólida ou gradiente simples
- Tipografia grande e legível
- Layout limpo e profissional
- Texto em português

TEXTO DO BANNER:

${event.event_type.toUpperCase()}
${event.store_name}
${event.city}
${event.start_date} a ${event.end_date}

Formato:
Banner 16:9
Estilo minimalista e barato de gerar
`;
}

/* =====================================================
   GERAR BANNER
===================================================== */
async function generateBanner(event) {
  try {
    // Limite de gerações
    if (event.banner_generated_count >= 3) {
      console.log(
        `⛔ Evento ${event.id} atingiu limite de banners`
      );
      return;
    }

    // Se já aprovado, não gerar
    if (event.banner_status === "approved") {
      console.log(
        `✅ Evento ${event.id} já aprovado, ignorando`
      );
      return;
    }

    const prompt = buildBannerPrompt(event);

    const response = await openai.images.generate({
      model: "gpt-image-1",
      prompt,
      size: "1792x1024",
    });

    const imageBase64 = response.data[0].b64_json;
    const imageBuffer = Buffer.from(imageBase64, "base64");

    const fileName = `banner_event_${event.id}.png`;
    const filePath = `/tmp/${fileName}`;

    fs.writeFileSync(filePath, imageBuffer);

    const publicUrl = `${process.env.FRONTEND_URL}/banners/${fileName}`;

    await pool.query(
      `
      UPDATE events
      SET banner_url = $1,
          banner_generated = true,
          banner_generated_count = banner_generated_count + 1,
          banner_status = 'pending'
      WHERE id = $2
      `,
      [publicUrl, event.id]
    );

    console.
