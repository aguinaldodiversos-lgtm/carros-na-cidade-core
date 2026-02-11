const axios = require("axios");

const ZAPI_BASE_URL = "https://api.z-api.io";

/* =====================================================
   ENV VALIDATION
===================================================== */
function validateEnv() {
  const required = [
    "ZAPI_CLIENT_TOKEN",
    "ZAPI_INSTANCE_ID",
    "ZAPI_INSTANCE_TOKEN",
    "FRONTEND_URL",
  ];

  for (const key of required) {
    if (!process.env[key]) {
      throw new Error(`Variável de ambiente ausente: ${key}`);
    }
  }
}

/* =====================================================
   FORMAT PHONE
   Converte para padrão internacional: 5511999999999
===================================================== */
function normalizePhone(phone) {
  if (!phone) return null;

  let digits = phone.replace(/\D/g, "");

  // se não começar com 55, adiciona
  if (!digits.startsWith("55")) {
    digits = "55" + digits;
  }

  return digits;
}

/* =====================================================
   SEND WHATSAPP ALERT
===================================================== */
async function sendWhatsAppAlert(phone, ad) {
  try {
    validateEnv();

    const formattedPhone = normalizePhone(phone);

    if (!formattedPhone) {
      console.warn("⚠️ Telefone inválido, envio cancelado");
      return false;
    }

    const message = `🚗 Novo carro para você:

${ad.brand || ""} ${ad.model || ""}
Ano: ${ad.year || "-"}
Preço: R$ ${ad.price}
Cidade: ${ad.city}

Veja o anúncio:
${process.env.FRONTEND_URL}/anuncio/${ad.id}`;

    const url = `${ZAPI_BASE_URL}/instances/${process.env.ZAPI_INSTANCE_ID}/token/${process.env.ZAPI_INSTANCE_TOKEN}/send-text`;

    const response = await axios.post(
      url,
      {
        phone: formattedPhone,
        message,
      },
      {
        headers: {
          "Client-Token": process.env.ZAPI_CLIENT_TOKEN,
          "Content-Type": "application/json",
        },
        timeout: 10000,
      }
    );

    console.log(`📲 WhatsApp enviado para ${formattedPhone}`);
    return true;
  } catch (err) {
    if (err.response) {
      console.error(
        "❌ Erro Z-API:",
        err.response.status,
        err.response.data
      );
    } else {
      console.error("❌ Erro no WhatsApp:", err.message);
    }

    return false;
  }
}

module.exports = { sendWhatsAppAlert };
