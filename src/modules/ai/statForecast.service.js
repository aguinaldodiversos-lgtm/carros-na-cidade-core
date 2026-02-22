// src/modules/ai/statForecast.service.js

export function linearTrendForecast(history) {
  if (history.length < 2) return 0;

  const first = history[0];
  const last = history[history.length - 1];

  const growthRate = (last - first) / history.length;

  return last + growthRate;
}
