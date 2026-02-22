// src/index.js

import dotenv from "dotenv";
dotenv.config();
import { collectExternalData } from "./workers/dataCollector.worker.js";
import app from "./app.js";
import runMigrations from "./infrastructure/database/migrate.js";
import { logger } from "./shared/logger.js";

const PORT = process.env.PORT || 3000;
setInterval(collectExternalData, 30 * 60 * 1000);
/* =====================================================
   FUNÇÃO SEGURA PARA INICIAR WORKERS
===================================================== */
async function startWorkerSafe(name, path, exportName) {
  try {
    const module = await import(path);
    const workerFn = module[exportName];

    if (typeof workerFn === "function") {
      workerFn();
      logger.info(`✅ ${name} iniciado`);
    } else {
      logger.warn(`⚠️ ${name} não encontrado`);
    }
  } catch (err) {
    logger.warn(`⚠️ ${name} não carregado`);
  }
}

/* =====================================================
   START DO SERVIDOR
===================================================== */
async function startServer() {
  try {
    logger.info("🔧 Rodando migrations...");
    await runMigrations();
    logger.info("✅ Migrations concluídas.");

    app.listen(PORT, async () => {
      logger.info(`🚗 API Carros na Cidade rodando na porta ${PORT}`);
      logger.info("🚀 Iniciando workers...");

      await startWorkerSafe(
        "Strategy Worker",
        "./workers/strategy.worker.js",
        "startStrategyWorker"
      );

      await startWorkerSafe(
        "Autopilot Worker",
        "./workers/autopilot.worker.js",
        "startAutopilotWorker"
      );

      await startWorkerSafe(
        "Opportunity Engine",
        "./workers/opportunity_engine.js",
        "startOpportunityEngine"
      );

      await startWorkerSafe(
        "SEO Worker",
        "./workers/seo.worker.js",
        "startSeoWorker"
      );

      await startWorkerSafe(
        "Event Banner Worker",
        "./workers/event_banner.worker.js",
        "startEventBannerWorker"
      );

      await startWorkerSafe(
        "Event Dispatch Worker",
        "./workers/event_dispatch.worker.js",
        "startEventDispatchWorker"
      );

      await startWorkerSafe(
        "Dealer Acquisition Worker",
        "./workers/dealer_acquisition.worker.js",
        "startDealerAcquisitionWorker"
      );

      await startWorkerSafe(
        "Google Dealer Collector",
        "./workers/google_dealer_collector.worker.js",
        "startGoogleDealerCollectorWorker"
      );

      await startWorkerSafe(
        "City Metrics Worker",
        "./workers/city_metrics.worker.js",
        "startCityMetricsWorker"
      );

      await startWorkerSafe(
        "Dealer Report Worker",
        "./workers/dealer_report.worker.js",
        "startDealerReportWorker"
      );

      await startWorkerSafe(
        "City Radar Worker",
        "./workers/city_radar.worker.js",
        "startCityRadarWorker"
      );

      await startWorkerSafe(
        "Alert Match Worker",
        "./workers/alert_match.worker.js",
        "startAlertMatchWorker"
      );

      await startWorkerSafe(
        "Banner Auto Approve Worker",
        "./workers/banner_auto_approve.worker.js",
        "startBannerAutoApproveWorker"
      );

      // WhatsApp Worker opcional
      try {
        await import("./workers/whatsapp.worker.js");
        logger.info("📲 WhatsApp Worker iniciado");
      } catch {
        logger.warn("⚠️ WhatsApp Worker não encontrado");
      }

      logger.info("🏁 Workers inicializados");
    });
  } catch (err) {
    logger.error({
      message: "Erro ao iniciar servidor",
      err,
    });
    process.exit(1);
  }
}

startServer();
