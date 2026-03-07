import { logger } from "../../shared/logger.js";
import { runDealerAcquisitionEngine } from "../../brain/engines/dealer-acquisition.engine.js";

let dealerAcquisitionInterval = null;
let dealerAcquisitionRunning = false;
let dealerAcquisitionStarted = false;

async function runOnce() {
  if (dealerAcquisitionRunning) {
    logger.warn("[dealer-acquisition.worker] Execução já em andamento; ignorando");
    return;
  }

  dealerAcquisitionRunning = true;

  try {
    await runDealerAcquisitionEngine(150);
  } catch (error) {
    logger.error({ error }, "[dealer-acquisition.worker] Erro no processamento");
  } finally {
    dealerAcquisitionRunning = false;
  }
}

export async function startDealerAcquisitionWorker() {
  if (dealerAcquisitionStarted) {
    logger.warn("[dealer-acquisition.worker] Worker já inicializado");
    return;
  }

  dealerAcquisitionStarted = true;

  const intervalMs = Number(
    process.env.DEALER_ACQUISITION_WORKER_INTERVAL_MS || 6 * 60 * 60 * 1000
  );

  logger.info(
    { intervalMs },
    "[dealer-acquisition.worker] Inicializando worker"
  );

  await runOnce();

  dealerAcquisitionInterval = setInterval(() => {
    runOnce().catch((error) => {
      logger.error(
        { error },
        "[dealer-acquisition.worker] Erro na execução agendada"
      );
    });
  }, intervalMs);
}

export async function stopDealerAcquisitionWorker() {
  if (!dealerAcquisitionStarted) {
    logger.info("[dealer-acquisition.worker] Nenhum worker ativo para encerrar");
    return;
  }

  if (dealerAcquisitionInterval) {
    clearInterval(dealerAcquisitionInterval);
    dealerAcquisitionInterval = null;
  }

  dealerAcquisitionStarted = false;

  logger.info("[dealer-acquisition.worker] Worker encerrado com sucesso");
}
