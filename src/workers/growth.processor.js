// src/workers/growth.processor.js

import { Worker } from "bullmq";
import { redis } from "../infrastructure/queue/redis.js";

if (redis) {
  new Worker(
    "growth-actions",
    async (job) => {
      console.log("🚀 Executando:", job.name, job.data);
      switch (job.name) {
        case "IMPROVE_SEO":
          break;
      }
    },
    { connection: redis }
  );
}
