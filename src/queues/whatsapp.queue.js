import { Queue, QueueEvents } from "bullmq";
import { logger } from "../shared/logger.js";
import { getQueueRedisConnection } from "../infrastructure/queue/redis.connection.js";
import {
  QUEUE_NAMES,
  QUEUE_DEFAULT_JOB_OPTIONS,
} from "../infrastructure/queue/queue.constants.js";

const redisConnection = getQueueRedisConnection();

export const WHATSAPP_QUEUE_NAME = QUEUE_NAMES.WHATSAPP;

export const whatsappQueue = new Queue(WHATSAPP_QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: QUEUE_DEFAULT_JOB_OPTIONS,
});

export const whatsappQueueEvents = new QueueEvents(WHATSAPP_QUEUE_NAME, {
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
      queue: WHATSAPP_QUEUE_NAME,
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
  ]);

  logger.info("[whatsapp.queue] Fila encerrada com sucesso");
}
