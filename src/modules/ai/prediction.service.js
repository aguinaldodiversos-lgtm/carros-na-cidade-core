import { generateText } from "./ai.service.js";

export async function predictCityGrowth(cityData) {
  const prompt = `
Com base nesses dados:

Anúncios: ${cityData.total_ads}
Conversão: ${cityData.conversion_rate}
Views: ${cityData.total_views}
População: ${cityData.population}
Frota: ${cityData.vehicle_fleet}

Preveja se a cidade tem potencial de crescimento alto, médio ou baixo.
Seja objetivo.
`;

  const result = await generateText(prompt);

  return result;
}
