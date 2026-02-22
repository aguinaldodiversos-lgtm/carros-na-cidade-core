import { generateText } from "./ai.service.js";

export async function forecastCityGrowth(history) {
  const prompt = `
Baseado nesses dados históricos mensais:

${JSON.stringify(history)}

Preveja o crescimento para os próximos 3 meses.
Responda com: Alto, Médio ou Baixo.
Seja objetivo.
`;

  return await generateText(prompt);
}
