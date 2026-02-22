// src/modules/ai/targetGenerator.service.js

export function generateTargets(cityData) {
  return {
    target_revenue: cityData.total_revenue * 1.2,
    target_leads: cityData.total_leads * 1.15,
    target_roas: cityData.roas * 1.1,
  };
}
