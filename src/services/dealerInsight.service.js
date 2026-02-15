const axios = require("axios");

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

async function gerarInsightsLojista(dealer, metrics, cityStats) {
  try {
    const prompt = `
Você é um consultor de vendas automotivas.

Dados da loja:
Visualizações: ${metrics.visits}
Leads: ${metrics.leads}
Contatos: ${metrics.contacts}
Leads qualificados: ${metrics.qualified_leads}

Dados médios da cidade:
Visualizações médias: ${cityStats.avg_visits}
Leads médios: ${cityStats.avg_leads}

Objetivo:
Gerar recomendações curtas e práticas para o lojista vender mais.

Regras:
- Texto curto
- Tom profissional
- Máximo 5 sugestões
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
        temperature: 0.5,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    return response.data.choices[0].message.content;
  } catch (err) {
    console.error("Erro ao gerar insights:", err.message);

    return `
• Adicione mais veículos ao seu estoque
• Responda leads rapidamente
• Cadastre carros entre os mais procurados da cidade
`;
  }
}

module.exports = {
  gerarInsightsLojista,
};
