const axios = require("axios");

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const MODEL = "gpt-5.2";

/* =====================================================
   FUNÇÃO BASE DE CHAMADA DA OPENAI
===================================================== */
async function callOpenAI(prompt, temperature = 0.7) {
  try {
    const response = await axios.post(
      OPENAI_URL,
      {
        model: MODEL,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: 60000,
      }
    );

    return response.data.choices[0].message.content;
  } catch (err) {
    console.error("Erro na chamada OpenAI:", err.message);
    return null;
  }
}

/* =====================================================
   GERADOR DE ARTIGO POR MODELO
===================================================== */
async function generateSeoArticle({ city, brand, model }) {
  const prompt = `
Você é um especialista em SEO automotivo.

Gere um artigo completo, natural e otimizado para Google.

Cidade: ${city}
Veículo: ${brand} ${model}

Regras:
- Texto 100% original
- Linguagem natural
- Foco em compradores
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

  const content = await callOpenAI(prompt);

  if (!content) {
    return {
      title: `${brand} ${model} em ${city}`,
      content: `Confira as melhores ofertas de ${brand} ${model} disponíveis em ${city}.`,
    };
  }

  const title = extractTitle(content, `${brand} ${model} em ${city}`);

  return {
    title,
    content,
  };
}

/* =====================================================
   NOVA FUNÇÃO: GERAR PÁGINA SEO POR CIDADE
===================================================== */
async function gerarConteudoSEO(cidade, slug) {
  const prompt = `
Você é um especialista em SEO automotivo.

Crie um conteúdo otimizado para Google para uma página de listagem de carros.

Cidade: ${cidade.name}
Slug: ${slug}

Regras:
- Texto natural e humano
- Foco em quem quer comprar carro na cidade
- Mencionar a cidade ao longo do texto
- Evitar exageros ou promessas falsas
- Tom informativo e confiável
- Entre 300 e 600 palavras

Estrutura:
Título
Texto descritivo da página
`;

  const content = await callOpenAI(prompt, 0.6);

  if (!content) {
    return {
      title: `Carros em ${cidade.name}`,
      content: `Confira os melhores carros disponíveis em ${cidade.name}. Ofertas atualizadas diariamente.`,
    };
  }

  const title = extractTitle(content, `Carros em ${cidade.name}`);

  return {
    title,
    content,
  };
}

/* =====================================================
   UTIL: EXTRAIR TÍTULO
===================================================== */
function extractTitle(content, fallback) {
  if (!content) return fallback;

  const lines = content.split("\n").map((l) => l.trim()).filter(Boolean);

  if (lines.length > 0 && lines[0].length < 120) {
    return lines[0];
  }

  return fallback;
}

module.exports = {
  generateSeoArticle,
  gerarConteudoSEO,
};
