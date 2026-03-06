import { Queue } from "bullmq";
import { createRedisClient } from "./ai.cache.js";

export function createAiQueue({ logger }) {
  const redis = createRedisClient({ logger });

  const aiQueue = new Queue("ai-jobs", {
    connection: redis,
    defaultJobOptions: {
      removeOnComplete: 500,
      removeOnFail: 500,
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
    },
  });

  return { aiQueue, redis };
}
