import { logger } from "../../shared/logger.js";
import { garantirSEO } from "../../modules/seo/pages/seo-pages.service.js";
import { generateCityDemandArticles } from "../../modules/seo/content/seo-content.service.js";
import { collectSeoMetricsForToday } from "../../modules/seo/metrics/seo-metrics.service.js";
import { getCitiesForExpansion } from "../../modules/cities/cities.service.js";

let seoInterval = null;
let seoRunning = false;
let seoStarted = false;

async function runSeoWorker() {
  if (seoRunning) {
    logger.warn("[seo.worker] Execução já em andamento; nova rodada ignorada");
    return;
  }

  seoRunning = true;

  try {
    logger.info("[seo.worker] Iniciando processamento");

    await collectSeoMetricsForToday();

    const cities = await getCitiesForExpansion(5);

    for (const cidade of cities) {
      logger.info(
        {
          cityId: cidade.id,
          cityName: cidade.name,
          priorityLevel: cidade.priority_level,
        },
        "[seo.worker] Processando cidade"
      );

      await garantirSEO(cidade);
      await generateCityDemandArticles(cidade);
    }

    logger.info("[seo.worker] Processamento finalizado com sucesso");
  } catch (error) {
    logger.error({ error }, "[seo.worker] Erro no processamento");
  } finally {
    seoRunning = false;
  }
}

export async function startSeoWorker() {
  if (seoStarted) {
    logger.warn("[seo.worker] Worker já inicializado");
    return;
  }

  seoStarted = true;

  const intervalMs = Number(process.env.SEO_WORKER_INTERVAL_MS || 6 * 60 * 60 * 1000);

  logger.info({ intervalMs }, "[seo.worker] Inicializando worker");

  await runSeoWorker();

  seoInterval = setInterval(() => {
    runSeoWorker().catch((error) => {
      logger.error({ error }, "[seo.worker] Erro na execução agendada");
    });
  }, intervalMs);

  logger.info("[seo.worker] Agendamento configurado");
}

export async function stopSeoWorker() {
  if (!seoStarted) {
    logger.info("[seo.worker] Nenhum worker ativo para encerrar");
    return;
  }

  if (seoInterval) {
    clearInterval(seoInterval);
    seoInterval = null;
  }

  seoStarted = false;

  logger.info("[seo.worker] Worker encerrado com sucesso");
}
