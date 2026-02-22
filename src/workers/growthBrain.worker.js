import { evaluateCities } from "../modules/ai/growth.brain.js";

export function startGrowthBrainWorker() {
  setInterval(evaluateCities, 15 * 60 * 1000);
}
