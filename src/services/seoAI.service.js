const axios = require("axios");

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

async function generateSeoArticle({ city, brand, model }) {
  try {
    const prompt = `
Você é um especialista em SEO automotivo.

Gere um artigo completo, natural e otimizado para Google com as seguintes características:

Cidade: ${city}
Veículo: ${brand} ${model}

Regras:
- Texto 100% original
- Linguagem natural e humana
- Foco em quem quer comprar o carro
- Mencionar a cidade ao longo do texto
- Estrutura:

Título
Introdução
Vantagens do modelo
Consumo e manutenção
Para quem esse carro é ideal
Onde encontrar ${brand} ${model} em ${city}
Conclusão

Tamanho: entre 800 e 1200 palavras.
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
        timeout: 60000,
      }
    );

    const content = response.data.choices[0].message.content;

    const titleMatch = content.match(/^(.+)\n/);
    const title = titleMatch ? titleMatch[1] : `${brand} ${model} em ${city}`;

    return {
      title,
      content,
    };
  } catch (err) {
    console.error("Erro ao gerar artigo SEO:", err.message);
    return null;
  }
}

module.exports = { generateSeoArticle };
