import { Queue } from "bullmq";
import { createRedisClient } from "../cache/ai.cache.js";

export function createAiQueue({ logger }) {
  const redis = createRedisClient({ logger });

  if (!redis) {
    return { aiQueue: null, redis: null };
  }

  const aiQueue = new Queue("ai-jobs", {
    connection: redis,
    defaultJobOptions: {
      removeOnComplete: 500,
      removeOnFail: 500,
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 5000,
      },
    },
  });

  return { aiQueue, redis };
}
