import { Queue, QueueEvents } from "bullmq";
import IORedis from "ioredis";
import { logger } from "../shared/logger.js";

const QUEUE_NAME = "whatsapp";

const redisConnection = new IORedis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  lazyConnect: true,
});

redisConnection.on("connect", () => {
  logger.info("[whatsapp.queue] Redis conectado");
});

redisConnection.on("error", (error) => {
  logger.error({ error }, "[whatsapp.queue] Erro na conexão Redis");
});

export const whatsappQueue = new Queue(QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 1000,
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 3000,
    },
  },
});

export const whatsappQueueEvents = new QueueEvents(QUEUE_NAME, {
  connection: redisConnection,
});

whatsappQueueEvents.on("completed", ({ jobId }) => {
  logger.info({ jobId }, "[whatsapp.queue] Job concluído");
});

whatsappQueueEvents.on("failed", ({ jobId, failedReason }) => {
  logger.error(
    { jobId, failedReason },
    "[whatsapp.queue] Job falhou"
  );
});

/**
 * Adiciona job na fila de WhatsApp.
 *
 * Assinaturas suportadas:
 * 1) addWhatsAppJob("send-message", { ...data }, { ...opts })
 * 2) addWhatsAppJob({ ...data }, { ...opts }) -> usa name padrão "send-message"
 */
export async function addWhatsAppJob(nameOrData, dataOrOptions = {}, maybeOptions = {}) {
  let jobName = "send-message";
  let jobData = {};
  let jobOptions = {};

  if (typeof nameOrData === "string") {
    jobName = nameOrData;
    jobData = dataOrOptions || {};
    jobOptions = maybeOptions || {};
  } else {
    jobData = nameOrData || {};
    jobOptions = dataOrOptions || {};
  }

  const job = await whatsappQueue.add(jobName, jobData, jobOptions);

  logger.info(
    {
      queue: QUEUE_NAME,
      jobId: job.id,
      jobName,
    },
    "[whatsapp.queue] Job adicionado"
  );

  return job;
}

export async function closeWhatsAppQueue() {
  await Promise.all([
    whatsappQueue.close(),
    whatsappQueueEvents.close(),
    redisConnection.quit(),
  ]);

  logger.info("[whatsapp.queue] Fila encerrada com sucesso");
}

export { QUEUE_NAME as WHATSAPP_QUEUE_NAME };
