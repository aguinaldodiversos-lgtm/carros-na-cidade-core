const axios = require("axios");

const ZAPI_BASE_URL = "https://api.z-api.io";

/* =====================================================
   ENV VALIDATION (executada uma vez)
===================================================== */
function validateEnv() {
  const required = [
    "ZAPI_CLIENT_TOKEN",
    "ZAPI_INSTANCE_ID",
    "ZAPI_INSTANCE_TOKEN",
  ];

  for (const key of required) {
    if (!process.env[key]) {
      throw new Error(`Variável de ambiente ausente: ${key}`);
    }
  }
}

// Executa validação ao carregar o serviço
validateEnv();

/* =====================================================
   FORMAT PHONE
   Converte para padrão internacional: 5511999999999
===================================================== */
function normalizePhone(phone) {
  if (!phone) return null;

  let digits = phone.replace(/\D/g, "");

  if (digits.startsWith("0")) {
    digits = digits.slice(1);
  }

  if (!digits.startsWith("55")) {
    digits = "55" + digits;
  }

  if (digits.length < 12) {
    return null;
  }

  return digits;
}

/* =====================================================
   FUNÇÃO BASE DE ENVIO
===================================================== */
async function sendWhatsAppMessage(phone, message) {
  try {
    const formattedPhone = normalizePhone(phone);

    if (!formattedPhone) {
      console.warn("⚠️ Telefone inválido, envio cancelado");
      return false;
    }

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

    if (response.data?.error) {
      console.error("❌ Z-API respondeu com erro:", response.data);
      return false;
    }

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

/* =====================================================
   ALERTA DE ANÚNCIO (USUÁRIO FINAL)
===================================================== */
async function sendWhatsAppAlert(phone, ad) {
  const adUrl = ad.slug
    ? `${process.env.FRONTEND_URL}/anuncio/${ad.slug}`
    : `${process.env.FRONTEND_URL}/anuncio/${ad.id}`;

  const message =
    ad.message_override ||
    `🚗 Novo carro para você:

${ad.brand || ""} ${ad.model || ""}
Ano: ${ad.year || "-"}
Preço: R$ ${ad.price}
Cidade: ${ad.city}

Veja o anúncio:
${adUrl}`;

  return sendWhatsAppMessage(phone, message);
}

/* =====================================================
   NOVO: LEAD PARA LOJISTA
===================================================== */
async function sendWhatsAppLead(phone, lead) {
  const message = `
🚗 Novo comprador interessado!

Nome: ${lead.name}
Telefone: ${lead.phone}
Faixa de preço: ${lead.price_range || "não informada"}

Entre em contato o quanto antes.
`;

  return sendWhatsAppMessage(phone, message);
}

module.exports = {
  sendWhatsAppMessage,
  sendWhatsAppAlert,
  sendWhatsAppLead,
};
