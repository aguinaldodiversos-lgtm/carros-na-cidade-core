// src/modules/ai/ai.service.js

import axios from "axios";

const OLLAMA_URL = "http://localhost:11434/api/generate";

export async function generateText(prompt) {
  const response = await axios.post(OLLAMA_URL, {
    model: "llama3",
    prompt: `
Responda apenas em Português do Brasil.

Seja objetivo, comercial e direto.
Limite máximo de 120 palavras.
Não escreva textos longos.
Não use explicações desnecessárias.

${prompt}
`,
    stream: false,
    options: {
      temperature: 0.6,
      top_p: 0.9,
      num_predict: 200 // limita tamanho da resposta
    }
  });

  return response.data.response.trim();
}
