// src/queues/whatsapp.queue.js
import { Queue } from "bullmq";
import IORedis from "ioredis";
import { logger } from "../shared/logger.js";

const REDIS_URL = process.env.REDIS_URL;
const DISABLE_WHATSAPP_QUEUE = String(process.env.DISABLE_WHATSAPP_QUEUE || "false") === "true";

let connection;
let whatsappQueue;

/**
 * Lazy init: sua API sobe mesmo sem Redis.
 * A fila só inicializa quando você realmente precisa enviar WhatsApp.
 */
function getWhatsAppQueue() {
  if (DISABLE_WHATSAPP_QUEUE) {
    logger.warn("🟡 WhatsApp Queue desabilitada via DISABLE_WHATSAPP_QUEUE=true");
    return null;
  }

  if (!REDIS_URL) {
    logger.warn("🟡 REDIS_URL não definido. WhatsApp Queue ficará desabilitada.");
    return null;
  }

  if (!connection) {
    connection = new IORedis(REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      // Em cloud instável, ajuda bastante:
      retryStrategy: (times) => Math.min(times * 1000, 10_000),
    });

    connection.on("error", (err) => {
      logger.error({ message: "❌ Erro no Redis (WhatsApp Queue)", error: err?.message || String(err) });
    });

    connection.on("connect", () => logger.info("✅ Redis conectado (WhatsApp Queue)"));
  }

  if (!whatsappQueue) {
    whatsappQueue = new Queue("whatsapp", { connection });
    logger.info("✅ BullMQ Queue 'whatsapp' inicializada");
  }

  return whatsappQueue;
}

/**
 * Export que o leads.service.js precisa.
 * Se Redis não estiver pronto, vira NO-OP e não derruba o deploy.
 */
export async function addWhatsAppJob(payload, options = {}) {
  const queue = getWhatsAppQueue();
  if (!queue) {
    // Retorno estruturado para você registrar/depurar sem quebrar fluxo.
    return { queued: false, reason: "queue_disabled_or_missing_redis" };
  }

  const jobName = options.jobName || "send-message";

  const job = await queue.add(jobName, payload, {
    attempts: Number(options.attempts ?? 3),
    backoff: options.backoff ?? { type: "exponential", delay: 5_000 },
    removeOnComplete: true,
    removeOnFail: false,
  });

  return { queued: true, jobId: job.id };
}

export { getWhatsAppQueue };
