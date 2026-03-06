import { Worker } from "bullmq";
import { logger } from "../shared/logger.js";
import {
  createRedisClient,
  createCache,
} from "../brain/cache/ai.cache.js";
import { AiOrchestrator } from "../brain/orchestrator/ai.orchestrator.js";

let aiWorkerInstance = null;
let aiRedisInstance = null;
let aiOrchestratorInstance = null;

export async function startAiWorker() {
  if (aiWorkerInstance) {
    logger.warn("[ai.worker] Worker já inicializado");
    return aiWorkerInstance;
  }

  aiRedisInstance = createRedisClient({ logger });
  const cache = createCache({ redis: aiRedisInstance });

  aiOrchestratorInstance = new AiOrchestrator({
    logger,
    cache,
    aiQueue: null,
  });

  aiWorkerInstance = new Worker(
    "ai-jobs",
    async (job) => {
      const payload = job.data;
      return aiOrchestratorInstance.generate(payload);
    },
    {
      connection: aiRedisInstance,
      concurrency: Number(process.env.AI_WORKER_CONCURRENCY || 5),
      autorun: true,
    }
  );

  aiWorkerInstance.on("ready", () => {
    logger.info("[ai.worker] Worker pronto (ai-jobs)");
  });

  aiWorkerInstance.on("completed", (job) => {
    logger.info(
      {
        jobId: job.id,
        name: job.name,
      },
      "[ai.worker] Job concluído"
    );
  });

  aiWorkerInstance.on("failed", (job, err) => {
    logger.error(
      {
        jobId: job?.id,
        name: job?.name,
        error: err?.message || String(err),
      },
      "[ai.worker] Job falhou"
    );
  });

  aiWorkerInstance.on("error", (error) => {
    logger.error({ error }, "[ai.worker] Erro no worker");
  });

  logger.info("[ai.worker] Inicialização concluída");

  return aiWorkerInstance;
}

export async function stopAiWorker() {
  if (!aiWorkerInstance) {
    logger.info("[ai.worker] Nenhum worker ativo para encerrar");
    return;
  }

  await aiWorkerInstance.close();
  aiWorkerInstance = null;

  if (aiRedisInstance) {
    await aiRedisInstance.quit();
    aiRedisInstance = null;
  }

  aiOrchestratorInstance = null;

  logger.info("[ai.worker] Worker encerrado com sucesso");
}
