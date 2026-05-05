require("dotenv").config();
const { Pool } = require("pg");
const OpenAI = require("openai");
const {
  refuseIfEventsWorkerDisabled,
  refuseIfAiBannerDisabled,
} = require("./_events_guard.cjs");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/* =====================================================
   PROMPT PADRÃO DE BANNER
===================================================== */
function buildBannerPrompt(event) {
  return `
Crie um banner profissional para um evento automotivo.

Regras obrigatórias:

- Texto em português do Brasil
- Nunca usar mais de 3 cores
- Nunca usar fontes decorativas
- Texto sempre alinhado à esquerda
- Sempre aplicar overlay escuro
- Nunca usar textos pequenos
- Sempre usar os dados reais do lojista
- O nome da loja deve ser o destaque principal
- Nunca alterar o nome da loja
- Banner estilo profissional de concessionária
- Layout limpo e moderno

Dados do evento:

Nome da loja: ${event.advertiser_name}
Evento: ${event.title}
Cidade: ${event.city_name}
Datas: ${event.start_date} até ${event.end_date}

Layout desejado:

- Formato 16:9
- Fundo com carro ou concessionária
- Texto à esquerda
- Hierarquia:
  1) Etiqueta do evento
  2) Nome da loja em destaque
  3) Subtítulo do evento
  4) Datas
  5) Botão visual "Ver ofertas"

Estilo:

- moderno
- limpo
- profissional
- automotivo
- alto contraste
`;
}

/* =====================================================
   GERAÇÃO DE BANNER
===================================================== */
async function generateBanner(event) {
  // Guard de IA: não chamar DALL-E enquanto produto Evento estiver
  // dormente. Custo OpenAI real, default fechado.
  if (refuseIfAiBannerDisabled("event_banner")) return null;

  try {
    const prompt = buildBannerPrompt(event);

    const response = await openai.images.generate({
      model: "gpt-image-1",
      prompt,
      size: "1536x1024",
    });

    const imageUrl = response.data[0].url;
    return imageUrl;
  } catch (err) {
    console.error("Erro ao gerar banner:", err.message);
    return null;
  }
}

/* =====================================================
   WORKER PRINCIPAL
===================================================== */
async function runEventBannerWorker() {
  try {
    console.log("🖼️ Rodando Event Banner Worker...");

    const result = await pool.query(`
      SELECT
        e.id,
        e.title,
        e.start_date,
        e.end_date,
        e.banner_status,
        a.name AS advertiser_name,
        c.name AS city_name
      FROM events e
      JOIN advertisers a ON a.id = e.advertiser_id
      JOIN cities c ON c.id = e.city_id
      WHERE e.status = 'paid'
      AND (e.banner_url IS NULL OR e.banner_status = 'pending')
      LIMIT 5
    `);

    for (const event of result.rows) {
      console.log(`🎨 Gerando banner para evento ${event.id}`);

      const bannerUrl = await generateBanner(event);

      if (!bannerUrl) continue;

      await pool.query(
        `
        UPDATE events
        SET
          banner_url = $1,
          banner_status = 'generated'
        WHERE id = $2
        `,
        [bannerUrl, event.id]
      );

      console.log(`✅ Banner gerado para evento ${event.id}`);
    }
  } catch (err) {
    console.error("Erro no Event Banner Worker:", err);
  }
}

/* =====================================================
   START
===================================================== */
function startEventBannerWorker() {
  if (refuseIfEventsWorkerDisabled("event_banner")) return;
  setInterval(runEventBannerWorker, 5 * 60 * 1000);
  runEventBannerWorker();
}

module.exports = { startEventBannerWorker };
