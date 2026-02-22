// src/infrastructure/queue/growth.queue.js

import { Queue } from "bullmq";
import { redis } from "./redis.js";

export const growthQueue = new Queue("growth-actions", {
  connection: redis,
});
