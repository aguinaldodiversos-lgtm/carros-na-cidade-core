import { logger } from "../../shared/logger.js";
import { runOpportunityScoringOnly } from "../../modules/growth/growth-brain-pipeline.js";

let opportunityInterval = null;
let opportunityRunning = false;
let opportunityStarted = false;

async function runOnce() {
  if (opportunityRunning) {
    logger.warn("[opportunity.worker] Execução já em andamento; ignorando");
    return;
  }

  opportunityRunning = true;

  try {
    await runOpportunityScoringOnly();
  } catch (error) {
    logger.error({ error }, "[opportunity.worker] Erro no processamento");
  } finally {
    opportunityRunning = false;
  }
}

export async function startOpportunityWorker() {
  if (opportunityStarted) {
    logger.warn("[opportunity.worker] Worker já inicializado");
    return;
  }

  opportunityStarted = true;

  const intervalMs = Number(
    process.env.OPPORTUNITY_WORKER_INTERVAL_MS || 6 * 60 * 60 * 1000
  );

  logger.info({ intervalMs }, "[opportunity.worker] Inicializando worker");

  await runOnce();

  opportunityInterval = setInterval(() => {
    runOnce().catch((error) => {
      logger.error({ error }, "[opportunity.worker] Erro na execução agendada");
    });
  }, intervalMs);
}

export async function stopOpportunityWorker() {
  if (!opportunityStarted) {
    logger.info("[opportunity.worker] Nenhum worker ativo para encerrar");
    return;
  }

  if (opportunityInterval) {
    clearInterval(opportunityInterval);
    opportunityInterval = null;
  }

  opportunityStarted = false;

  logger.info("[opportunity.worker] Worker encerrado com sucesso");
}
