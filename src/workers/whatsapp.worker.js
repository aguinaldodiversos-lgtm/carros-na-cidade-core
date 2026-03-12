import { Worker } from "bullmq";
import { logger } from "../shared/logger.js";
import { getQueueRedisConnection } from "../infrastructure/queue/redis.connection.js";
import { WHATSAPP_QUEUE_NAME } from "../queues/whatsapp.queue.js";
import { processWhatsAppJob } from "../modules/whatsapp/whatsapp.service.js";

let whatsappWorkerInstance = null;

export async function startWhatsAppWorker() {
  if (whatsappWorkerInstance) {
    logger.warn("[whatsapp.worker] Worker já inicializado");
    return whatsappWorkerInstance;
  }

  const redisConnection = getQueueRedisConnection();
  if (!redisConnection) {
    logger.warn(
      "[whatsapp.worker] Redis indisponível (DISABLE_REDIS ou REDIS_URL). Worker não iniciado."
    );
    return null;
  }

  const concurrency = Number(process.env.WHATSAPP_WORKER_CONCURRENCY || 5);

  whatsappWorkerInstance = new Worker(
    WHATSAPP_QUEUE_NAME,
    async (job) => processWhatsAppJob(job),
    {
      connection: redisConnection,
      concurrency,
      autorun: true,
    }
  );

  whatsappWorkerInstance.on("ready", () => {
    logger.info(
      { queue: WHATSAPP_QUEUE_NAME, concurrency },
      "[whatsapp.worker] Worker pronto"
    );
  });

  whatsappWorkerInstance.on("active", (job) => {
    logger.info(
      {
        jobId: job.id,
        jobName: job.name,
      },
      "[whatsapp.worker] Job ativo"
    );
  });

  whatsappWorkerInstance.on("completed", (job, result) => {
    logger.info(
      {
        jobId: job.id,
        jobName: job.name,
        result,
      },
      "[whatsapp.worker] Job concluído"
    );
  });

  whatsappWorkerInstance.on("failed", (job, error) => {
    logger.error(
      {
        jobId: job?.id,
        jobName: job?.name,
        attemptsMade: job?.attemptsMade,
        error,
      },
      "[whatsapp.worker] Job falhou"
    );
  });

  whatsappWorkerInstance.on("error", (error) => {
    logger.error({ error }, "[whatsapp.worker] Erro no worker");
  });

  logger.info("[whatsapp.worker] Inicialização concluída");

  return whatsappWorkerInstance;
}

export async function stopWhatsAppWorker() {
  if (!whatsappWorkerInstance) return;

  await whatsappWorkerInstance.close();
  whatsappWorkerInstance = null;

  logger.info("[whatsapp.worker] Worker encerrado com sucesso");
}
