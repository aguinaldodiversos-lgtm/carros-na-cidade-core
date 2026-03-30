import { logger } from "../../shared/logger.js";
import { runSitemapEngine } from "../../brain/engines/sitemap.engine.js";

let sitemapInterval = null;
let sitemapRunning = false;
let sitemapStarted = false;

async function runOnce() {
  if (sitemapRunning) {
    logger.warn("[sitemap.worker] Execução já em andamento; ignorando");
    return;
  }

  sitemapRunning = true;

  try {
    await runSitemapEngine(50000);
  } catch (error) {
    logger.error({ error }, "[sitemap.worker] Erro no processamento");
  } finally {
    sitemapRunning = false;
  }
}

export async function startSitemapWorker() {
  if (sitemapStarted) {
    logger.warn("[sitemap.worker] Worker já inicializado");
    return;
  }

  sitemapStarted = true;

  const intervalMs = Number(process.env.SITEMAP_WORKER_INTERVAL_MS || 6 * 60 * 60 * 1000);

  logger.info({ intervalMs }, "[sitemap.worker] Inicializando worker");

  await runOnce();

  sitemapInterval = setInterval(() => {
    runOnce().catch((error) => {
      logger.error({ error }, "[sitemap.worker] Erro na execução agendada");
    });
  }, intervalMs);
}

export async function stopSitemapWorker() {
  if (!sitemapStarted) {
    logger.info("[sitemap.worker] Nenhum worker ativo para encerrar");
    return;
  }

  if (sitemapInterval) {
    clearInterval(sitemapInterval);
    sitemapInterval = null;
  }

  sitemapStarted = false;

  logger.info("[sitemap.worker] Worker encerrado com sucesso");
}
