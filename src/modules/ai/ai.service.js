// src/modules/ai/ai.service.js

import axios from "axios";

const OLLAMA_URL = "http://localhost:11434/api/generate";

export async function generateText(prompt) {
  try {
    const response = await axios.post(OLLAMA_URL, {
      model: "llama3",
      prompt: `
Crie uma descrição curta e persuasiva para venda de veículo.
Máximo 5 parágrafos curtos.
Português do Brasil.
Tom profissional e direto.
Foque em conversão.
Evite textos longos.
Não explique demais.

${prompt}
`,
      stream: false,
      options: {
        temperature: 0.6,
        top_p: 0.9,
        num_predict: 180
      }
    });

    return response.data.response.trim();
  } catch (error) {
    console.error("Erro ao gerar texto com Ollama:", error.message);
    throw new Error("Falha na geração de texto IA");
  }
}
