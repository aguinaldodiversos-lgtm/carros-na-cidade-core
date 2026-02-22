import { startStrategyWorker } from "./strategy.worker.js";
import { startAutopilotWorker } from "./autopilot.worker.js";
import { startSeoWorker } from "./seo.worker.js";

console.log("🚀 Iniciando Workers Isolados...");

startStrategyWorker();
startAutopilotWorker();
startSeoWorker();

console.log("✅ Workers ativos");
