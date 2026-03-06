import { createAiQueue } from "./ai.queue.js";
import { createRedisClient, createCache } from "./ai.cache.js";
import { AiOrchestrator } from "./ai.orchestrator.js";
import { logger } from "../../shared/logger.js";

let orchestrator;
let aiQueue;

export function getAiOrchestrator() {
  if (orchestrator) return orchestrator;

  // redis + cache
  const redis = createRedisClient({ logger });
  const cache = createCache({ redis });

  // queue (opcional)
  const { aiQueue: q } = createAiQueue({ logger });
  aiQueue = q;

  orchestrator = new AiOrchestrator({ logger, cache, aiQueue });

  return orchestrator;
}

export function getAiQueue() {
  return aiQueue;
}
