// src/modules/ai/budgetOptimizer.service.js

export function optimizeBudget(cityData) {
  if (cityData.roas > 3) {
    return { action: "INCREASE_BUDGET", percent: 20 };
  }

  if (cityData.roas < 1) {
    return { action: "DECREASE_BUDGET", percent: 30 };
  }

  return { action: "MAINTAIN" };
}
