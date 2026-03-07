import { logger } from "../../shared/logger.js";
import { runMoneyPagesEngine } from "../../brain/engines/money-pages.engine.js";

let moneyPagesInterval = null;
let moneyPagesRunning = false;
let moneyPagesStarted = false;

async function runOnce() {
  if (moneyPagesRunning) {
    logger.warn("[money-pages.worker] Execução já em andamento; ignorando");
    return;
  }

  moneyPagesRunning = true;

  try {
    await runMoneyPagesEngine(100);
  } catch (error) {
    logger.error({ error }, "[money-pages.worker] Erro no processamento");
  } finally {
    moneyPagesRunning = false;
  }
}

export async function startMoneyPagesWorker() {
  if (moneyPagesStarted) {
    logger.warn("[money-pages.worker] Worker já inicializado");
    return;
  }

  moneyPagesStarted = true;

  const intervalMs = Number(
    process.env.MONEY_PAGES_WORKER_INTERVAL_MS || 6 * 60 * 60 * 1000
  );

  logger.info({ intervalMs }, "[money-pages.worker] Inicializando worker");

  await runOnce();

  moneyPagesInterval = setInterval(() => {
    runOnce().catch((error) => {
      logger.error({ error }, "[money-pages.worker] Erro na execução agendada");
    });
  }, intervalMs);
}

export async function stopMoneyPagesWorker() {
  if (!moneyPagesStarted) {
    logger.info("[money-pages.worker] Nenhum worker ativo para encerrar");
    return;
  }

  if (moneyPagesInterval) {
    clearInterval(moneyPagesInterval);
    moneyPagesInterval = null;
  }

  moneyPagesStarted = false;

  logger.info("[money-pages.worker] Worker encerrado com sucesso");
}
