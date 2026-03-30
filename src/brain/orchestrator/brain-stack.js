// Instância compartilhada do orquestrador + Redis (uma conexão para cache Bull/BullMQ e ioredis).
import { createRedisClient, createCache } from "../cache/ai.cache.js";
import { AiOrchestrator } from "./ai.orchestrator.js";

let stack = null;

/**
 * @param {{ logger: { warn: Function, info: Function, error: Function } }} opts
 */
export function getBrainAiStack({ logger }) {
  if (!logger) {
    throw new Error("getBrainAiStack: logger is required");
  }
  if (stack) {
    return stack;
  }

  const redis = createRedisClient({ logger });
  const cache = createCache({ redis });
  const orchestrator = new AiOrchestrator({
    logger,
    cache,
    aiQueue: null,
  });

  stack = { redis, cache, orchestrator };
  return stack;
}

/** Apenas o orquestrador (usa o mesmo singleton interno). */
export function getSharedAiOrchestrator(logger) {
  return getBrainAiStack({ logger }).orchestrator;
}

/**
 * Testes (incl. integração): libera o singleton para não herdar cache/instância entre ficheiros.
 * Combinar com `AI_MODE=local` quando não se pretender custo na API paga — ver docs/configuration/ai-environment.md
 */
export function resetBrainAiStackForTests() {
  stack = null;
}
