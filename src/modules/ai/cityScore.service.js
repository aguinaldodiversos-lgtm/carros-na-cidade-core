// src/modules/ai/cityScore.service.js

export function calculateCityScore(data) {
  let score = 0;

  score += data.total_ads * 1;
  score += data.total_views * 0.01;
  score += data.total_leads * 5;
  score += data.conversion_rate * 100;

  if (data.population) score += data.population * 0.0001;
  if (data.vehicle_fleet) score += data.vehicle_fleet * 0.00005;

  return Math.round(score);
}
