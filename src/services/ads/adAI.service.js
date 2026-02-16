const OpenAI = require("openai");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/* =====================================================
   IA ECONÔMICA (plano grátis)
===================================================== */
async function generateBasicAdText(ad) {
  try {
    const prompt = `
Corrija e padronize este anúncio de carro.

Regras:
- Texto curto
- Linguagem simples
- Sem exageros
- Máximo 80 palavras

Dados:
Marca: ${ad.brand}
Modelo: ${ad.model}
Ano: ${ad.year}
Descrição: ${ad.description || "Não informada"}
`;

    const response = await openai.chat.completions.create({
      model: "gpt-5.2-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.4,
    });

    return response.choices[0].message.content.trim();
  } catch (err) {
    console.error("Erro na IA básica:", err.message);
    return ad.description;
  }
}

/* =====================================================
   IA COMPLETA (planos pagos)
===================================================== */
async function generateAdvancedAdText(ad) {
  try {
    const prompt = `
Você é um especialista em vendas automotivas.

Crie uma descrição comercial profissional para o veículo abaixo.

Regras:
- Linguagem persuasiva
- Texto natural e humano
- Destacar benefícios
- Máximo 150 palavras

Dados:
Marca: ${ad.brand}
Modelo: ${ad.model}
Ano: ${ad.year}
Preço: ${ad.price}
Cidade: ${ad.city}
Descrição atual: ${ad.description || "Não informada"}
`;

    const response = await openai.chat.completions.create({
      model: "gpt-5.2",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.6,
    });

    return response.choices[0].message.content.trim();
  } catch (err) {
    console.error("Erro na IA avançada:", err.message);
    return ad.description;
  }
}

/* =====================================================
   FUNÇÃO PRINCIPAL
===================================================== */
async function improveAdText(ad) {
  try {
    const weight = ad.weight || 1;

    if (weight <= 1) {
      // plano grátis
      return await generateBasicAdText(ad);
    } else {
      // planos pagos
      return await generateAdvancedAdText(ad);
    }
  } catch (err) {
    console.error("Erro no improveAdText:", err);
    return ad.description;
  }
}

module.exports = {
  improveAdText,
};
