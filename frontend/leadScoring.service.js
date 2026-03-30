// leadScoring.service.js
function calculateScore(subscriber, ad, cityMetrics) {
  let score = 50;

  if (ad.model.includes(subscriber.vehicle_interest)) score += 30;
  if (cityMetrics.highDemand) score += 10;
  if (subscriber.lastInteraction) score += 15;

  return Math.max(0, Math.min(100, score));
}
