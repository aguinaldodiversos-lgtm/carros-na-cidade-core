// src/modules/ai/hybridForecast.service.js

import { generateText } from "./ai.service.js";
import { linearTrendForecast } from "./statForecast.service.js";

export async function hybridForecast(history, context) {
  const statPrediction = linearTrendForecast(history);

  const prompt = `
Dados históricos: ${history.join(",")}
Contexto da cidade: ${context}

A tendência futura é de crescimento ou queda?
Responda apenas: Crescimento, Estável ou Queda.
`;

  const aiPrediction = await generateText(prompt);

  return {
    statPrediction,
    aiPrediction,
  };
}
