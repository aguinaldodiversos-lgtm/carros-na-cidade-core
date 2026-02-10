const axios = require("axios");

async function sendWhatsAppAlert(phone, ad) {
  try {
    const message = `🚗 Novo carro para você:
${ad.brand} ${ad.model}
Ano: ${ad.year}
Preço: R$ ${ad.price}
Cidade: ${ad.city}

Veja: ${process.env.FRONTEND_URL}/anuncio/${ad.id}`;

    await axios.post(process.env.WHATSAPP_API_URL, {
      number: phone,
      message
    });

    console.log(`📲 WhatsApp enviado para ${phone}`);
    return true;
  } catch (err) {
    console.error("Erro no WhatsApp:", err.message);
    return false;
  }
}

module.exports = { sendWhatsAppAlert };
