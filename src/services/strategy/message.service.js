const axios = require("axios");

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

async function gerarTextoCampanhaIA(cidade) {
  try {
    const prompt = `
Você é um especialista em marketing automotivo local.

Crie um texto curto e persuasivo para redes sociais.

Cidade: ${cidade.name}

Objetivo:
Gerar tráfego para o portal de carros da cidade.

Regras:
- Tom direto e humano
- Sem exageros
- Máximo 2 parágrafos
- Foco em oportunidade local
`;

    const response = await axios.post(
      OPENAI_URL,
      {
        model: "gpt-5.2",
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.7,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: 30000,
      }
    );

    return response.data.choices[0].message.content;
  } catch (err) {
    console.error("Erro ao gerar texto de campanha:", err.message);

    // fallback
    return `🚗 Novos carros disponíveis em ${cidade.name}. Confira as ofertas atualizadas na sua cidade.`;
  }
}

module.exports = {
  gerarTextoCampanhaIA,
};
