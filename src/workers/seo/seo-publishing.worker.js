import { logger } from "../../shared/logger.js";
import { runSeoPublishingEngine } from "../../brain/engines/seo-publishing.engine.js";

let seoPublishingInterval = null;
let seoPublishingRunning = false;
let seoPublishingStarted = false;

async function runOnce() {
  if (seoPublishingRunning) {
    logger.warn("[seo-publishing.worker] Execução já em andamento; ignorando");
    return;
  }

  seoPublishingRunning = true;

  try {
    await runSeoPublishingEngine();
  } catch (error) {
    logger.error({ error }, "[seo-publishing.worker] Erro no processamento");
  } finally {
    seoPublishingRunning = false;
  }
}

export async function startSeoPublishingWorker() {
  if (seoPublishingStarted) {
    logger.warn("[seo-publishing.worker] Worker já inicializado");
    return;
  }

  seoPublishingStarted = true;

  const intervalMs = Number(
    process.env.SEO_PUBLISHING_WORKER_INTERVAL_MS || 6 * 60 * 60 * 1000
  );

  logger.info(
    { intervalMs },
    "[seo-publishing.worker] Inicializando worker"
  );

  await runOnce();

  seoPublishingInterval = setInterval(() => {
    runOnce().catch((error) => {
      logger.error(
        { error },
        "[seo-publishing.worker] Erro na execução agendada"
      );
    });
  }, intervalMs);
}

export async function stopSeoPublishingWorker() {
  if (!seoPublishingStarted) {
    logger.info("[seo-publishing.worker] Nenhum worker ativo para encerrar");
    return;
  }

  if (seoPublishingInterval) {
    clearInterval(seoPublishingInterval);
    seoPublishingInterval = null;
  }

  seoPublishingStarted = false;

  logger.info("[seo-publishing.worker] Worker encerrado com sucesso");
}
