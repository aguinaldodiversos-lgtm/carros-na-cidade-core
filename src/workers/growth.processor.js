// src/workers/growth.processor.js

import { Worker } from "bullmq";
import { redis } from "../infrastructure/queue/redis.js";

new Worker(
  "growth-actions",
  async job => {
    console.log("🚀 Executando:", job.name, job.data);

    switch (job.name) {
      case "IMPROVE_SEO":
        // lógica real aqui
        break;
    }
  },
  { connection: redis }
);
