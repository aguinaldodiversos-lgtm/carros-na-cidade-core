const { Pool } = require("pg");
const OpenAI = require("openai");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/* =====================================================
   PROMPT DO BANNER
===================================================== */
function buildBannerPrompt(event) {
  return `
Gerar um banner publicitário profissional para evento automotivo.

DADOS DO EVENTO:
Nome da loja: ${event.store_name}
Tipo de evento: ${event.event_type}
Data do evento: ${event.start_date} até ${event.end_date}
Endereço: ${event.address}
Cidade: ${event.city}

REGRAS DE DESIGN:

- Usar no máximo 3 cores
- Tipografia moderna e legível
- Texto alinhado à esquerda
- Overlay escuro para legibilidade
- Nome da loja em destaque
- Textos em português do Brasil
- Layout limpo e profissional

IMAGEM:

Adicionar veículo moderno em destaque.
Pode ser:
Mercedes, BMW, Audi, Porsche, Jaguar, Land Rover
ou veículos populares novos.

ESTRUTURA:

Título grande baseado no tipo de evento
Subtítulo comercial
Nome da loja em destaque
Datas do evento
Cidade

FORMATO:

Banner 16:9
Estilo publicitário profissional
Alta resolução
`;
}

/* =====================================================
   GERAR BANNER
===================================================== */
async function generateBanner(event) {
  try {
    const prompt = buildBannerPrompt(event);

    const response = await openai.images.generate({
      model: "gpt-image-1",
      prompt,
      size: "1792x1024",
    });

    const imageBase64 = response.data[0].b64_json;
    const imageBuffer = Buffer.from(imageBase64, "base64");

    // Simples: salvar localmente ou subir para storage
    const fileName = `banner_event_${event.id}.png`;
    const filePath = `/tmp/${fileName}`;

    require("fs").writeFileSync(filePath, imageBuffer);

    // Aqui você pode integrar com:
    // - S3
    // - Cloudinary
    // - Storage do Render

    // Simulando URL pública
    const publicUrl = `${process.env.FRONTEND_URL}/banners/${fileName}`;

    await pool.query(
      `
      UPDATE events
      SET banner_url = $1,
          banner_generated = true
      WHERE id = $2
      `,
      [publicUrl, event.id]
    );

    console.log(`🎨 Banner gerado para evento ${event.id}`);
  } catch (err) {
    console.error("Erro ao gerar banner:", err.message);
  }
}

/* =====================================================
   WORKER PRINCIPAL
===================================================== */
async function bannerWorker() {
  try {
    const result = await pool.query(`
      SELECT
        e.id,
        e.event_type,
        e.start_date,
        e.end_date,
        e.address,
        c.name AS city,
        a.name AS store_name
      FROM events e
      JOIN cities c ON c.id = e.city_id
      JOIN advertisers a ON a.id = e.advertiser_id
      WHERE e.payment_status = 'paid'
        AND e.banner_generated = false
      LIMIT 5
    `);

    for (const event of result.rows) {
      await generateBanner(event);
    }
  } catch (err) {
    console.error("Erro no banner worker:", err.message);
  }
}

/* =====================================================
   START DO WORKER
===================================================== */
function startBannerWorker() {
  console.log("🎨 Banner Generator Worker iniciado...");

  // roda a cada 2 minutos
  setInterval(bannerWorker, 2 * 60 * 1000);
}

module.exports = { startBannerWorker };
