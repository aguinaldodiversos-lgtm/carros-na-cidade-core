// src/modules/ai/cityCluster.service.js

export function classifyCity(cityData) {
  if (cityData.population > 500000 && cityData.total_ads < 50) {
    return "EXPANSION_OPPORTUNITY";
  }

  if (cityData.conversion_rate > 0.05) {
    return "HIGH_PERFORMANCE";
  }

  if (cityData.roas < 1) {
    return "UNDERPERFORMING";
  }

  return "STABLE";
}
