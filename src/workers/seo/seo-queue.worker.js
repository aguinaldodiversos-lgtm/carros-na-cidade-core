import { logger } from "../../shared/logger.js";
import { runSeoQueueEngine } from "../../brain/engines/seo-queue.engine.js";

let seoQueueInterval = null;
let seoQueueRunning = false;
let seoQueueStarted = false;

async function runOnce() {
  if (seoQueueRunning) {
    logger.warn("[seo-queue.worker] Execução já em andamento; ignorando");
    return;
  }

  seoQueueRunning = true;

  try {
    await runSeoQueueEngine(2000);
  } catch (error) {
    logger.error({ error }, "[seo-queue.worker] Erro no processamento");
  } finally {
    seoQueueRunning = false;
  }
}

export async function startSeoQueueWorker() {
  if (seoQueueStarted) {
    logger.warn("[seo-queue.worker] Worker já inicializado");
    return;
  }

  seoQueueStarted = true;

  const intervalMs = Number(process.env.SEO_QUEUE_WORKER_INTERVAL_MS || 6 * 60 * 60 * 1000);

  logger.info({ intervalMs }, "[seo-queue.worker] Inicializando worker");

  await runOnce();

  seoQueueInterval = setInterval(() => {
    runOnce().catch((error) => {
      logger.error({ error }, "[seo-queue.worker] Erro na execução agendada");
    });
  }, intervalMs);
}

export async function stopSeoQueueWorker() {
  if (!seoQueueStarted) {
    logger.info("[seo-queue.worker] Nenhum worker ativo para encerrar");
    return;
  }

  if (seoQueueInterval) {
    clearInterval(seoQueueInterval);
    seoQueueInterval = null;
  }

  seoQueueStarted = false;

  logger.info("[seo-queue.worker] Worker encerrado com sucesso");
}
