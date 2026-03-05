// src/modules/ai/ai.service.js
import axios from "axios";
import { logger } from "../../shared/logger.js";

const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434/api/generate";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3";
const OLLAMA_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS || 12_000);

export async function generateText(prompt) {
  try {
    const response = await axios.post(
      OLLAMA_URL,
      {
        model: OLLAMA_MODEL,
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
          num_predict: 180,
        },
      },
      { timeout: OLLAMA_TIMEOUT_MS }
    );

    const text = response?.data?.response?.trim?.() || "";
    if (!text) throw new Error("Resposta vazia do Ollama");

    return text;
  } catch (error) {
    logger.error({
      message: "Erro ao gerar texto com Ollama",
      error: error?.message || String(error),
      ollamaUrl: OLLAMA_URL,
      model: OLLAMA_MODEL,
    });
    throw new Error("Falha na geração de texto IA (Ollama)");
  }
}
