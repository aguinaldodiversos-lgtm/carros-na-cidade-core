import { logger } from "../../shared/logger.js";
import { generateMarketIntelligence } from "../../brain/engines/market-intelligence.engine.js";

let marketInterval = null;
let marketRunning = false;
let marketStarted = false;

async function runOnce() {
  if (marketRunning) {
    logger.warn("[market.worker] Execução já em andamento; ignorando");
    return;
  }

  marketRunning = true;

  try {
    const data = await generateMarketIntelligence();

    logger.info(
      {
        top: data.opportunities.slice(0, 3),
      },
      "[market.worker] Inteligência de mercado gerada"
    );
  } catch (error) {
    logger.error({ error }, "[market.worker] Erro no processamento");
  } finally {
    marketRunning = false;
  }
}

export async function startMarketWorker() {
  if (marketStarted) {
    logger.warn("[market.worker] Worker já inicializado");
    return;
  }

  marketStarted = true;

  const intervalMs = Number(
    process.env.MARKET_WORKER_INTERVAL_MS || 6 * 60 * 60 * 1000
  );

  logger.info({ intervalMs }, "[market.worker] Inicializando worker");

  await runOnce();

  marketInterval = setInterval(() => {
    runOnce().catch((error) => {
      logger.error({ error }, "[market.worker] Erro na execução agendada");
    });
  }, intervalMs);
}

export async function stopMarketWorker() {
  if (!marketStarted) {
    logger.info("[market.worker] Nenhum worker ativo para encerrar");
    return;
  }

  if (marketInterval) {
    clearInterval(marketInterval);
    marketInterval = null;
  }

  marketStarted = false;

  logger.info("[market.worker] Worker encerrado com sucesso");
}
