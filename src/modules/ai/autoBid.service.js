// src/modules/ai/autoBid.service.js

export function calculateAutoBid(cityData) {
  let baseBid = 1.0;

  if (cityData.roas > 3) {
    baseBid += 0.5;
  }

  if (cityData.conversion_rate > 0.03) {
    baseBid += 0.3;
  }

  if (cityData.cluster === "EXPANSION_OPPORTUNITY") {
    baseBid += 0.7;
  }

  return Number(baseBid.toFixed(2));
}
