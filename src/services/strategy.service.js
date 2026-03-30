const { Pool } = require("pg");
const { sendResetPasswordEmail } = require("./email.service");
const { sendWhatsAppAlert } = require("./whatsapp.service");
const axios = require("axios");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

/* =====================================================
   GERAR RELATÓRIO ESTRATÉGICO
===================================================== */
async function generateStrategyReport() {
  const result = await pool.query(`
    SELECT
      city,
      brand,
      model,
      COUNT(*) as total_alerts
    FROM alerts
    WHERE brand IS NOT NULL
      AND model IS NOT NULL
    GROUP BY city, brand, model
    ORDER BY total_alerts DESC
    LIMIT 10
  `);

  return result.rows;
}

/* =====================================================
   FORMATAR TEXTO DO RELATÓRIO
===================================================== */
function formatStrategyMessage(data) {
  if (!data.length) {
    return "📊 Relatório: ainda não há dados suficientes.";
  }

  let text = "📊 Relatório estratégico – Carros na Cidade\n\n";

  data.forEach((item, index) => {
    text += `${index + 1}. ${item.brand} ${item.model}\n`;
    text += `Cidade: ${item.city}\n`;
    text += `Interessados: ${item.total_alerts}\n\n`;
  });

  text += "Ação sugerida:\n";
  text += "Cadastre anúncios nessas cidades para capturar a demanda.";

  return text;
}

/* =====================================================
   ENVIO DO RELATÓRIO
===================================================== */
async function sendStrategyReport() {
  try {
    const data = await generateStrategyReport();
    const message = formatStrategyMessage(data);

    // Envio por email
    if (process.env.STRATEGY_EMAIL) {
      await axios.post(
        "https://api.resend.com/emails",
        {
          from: "Carros na Cidade <no-reply@carrosnacidade.com>",
          to: process.env.STRATEGY_EMAIL,
          subject: "Relatório estratégico",
          html: `<pre>${message}</pre>`,
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
        }
      );

      console.log("📧 Relatório estratégico enviado por email");
    }

    // Envio por WhatsApp
    if (process.env.STRATEGY_WHATSAPP) {
      await sendWhatsAppAlert(process.env.STRATEGY_WHATSAPP, {
        brand: "",
        model: "",
        year: "",
        price: "",
        city: "",
        id: "",
        title: message,
      });

      console.log("📲 Relatório estratégico enviado por WhatsApp");
    }
  } catch (err) {
    console.error("Erro no relatório estratégico:", err);
  }
}

module.exports = { sendStrategyReport };
