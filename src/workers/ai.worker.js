import { Worker } from "bullmq";
import { logger } from "../shared/logger.js";
import { createRedisClient, createCache } from "../modules/ai/orchestrator/ai.cache.js";
import { AiOrchestrator } from "../modules/ai/orchestrator/ai.orchestrator.js";

export async function startAiWorker() {
  const redis = createRedisClient({ logger });
  const cache = createCache({ redis });

  const orchestrator = new AiOrchestrator({ logger, cache, aiQueue: null });

  const worker = new Worker(
    "ai-jobs",
    async (job) => {
      const payload = job.data;
      const res = await orchestrator.generate(payload);
      return res;
    },
    {
      connection: redis,
      concurrency: Number(process.env.AI_WORKER_CONCURRENCY || 5),
    }
  );

  worker.on("completed", (job) => {
    logger.info({ message: "AI job completed", jobId: job.id, name: job.name });
  });

  worker.on("failed", (job, err) => {
    logger.error({
      message: "AI job failed",
      jobId: job?.id,
      name: job?.name,
      error: err?.message || String(err),
    });
  });

  logger.info("✅ AI Worker online (ai-jobs)");
}
