require("dotenv").config();

const app = require("./app");
const runMigrations = require("./database/migrate");

const PORT = process.env.PORT || 3000;

/* =====================================================
   FUNÇÃO SEGURA PARA INICIAR WORKERS
===================================================== */
function startWorkerSafe(name, fn) {
  try {
    if (typeof fn === "function") {
      fn();
      console.log(`✅ ${name} iniciado`);
    } else {
      console.warn(`⚠️ ${name} não encontrado`);
    }
  } catch (err) {
    console.error(`❌ Erro ao iniciar ${name}:`, err);
  }
}

/* =====================================================
   IMPORTAÇÃO SEGURA DOS WORKERS
===================================================== */

let startStrategyWorker;
try {
  ({ startStrategyWorker } = require("./workers/strategy.worker"));
} catch (err) {}

let startAutopilotWorker;
try {
  ({ startAutopilotWorker } = require("./workers/autopilot.worker"));
} catch (err) {}

let startSeoWorker;
try {
  ({ startSeoWorker } = require("./workers/seo.worker"));
} catch (err) {}

let startOpportunityEngine;
try {
  ({ startOpportunityEngine } = require("./workers/opportunity_engine"));
} catch (err) {}

let startEventBannerWorker;
try {
  ({ startEventBannerWorker } = require("./workers/event_banner.worker"));
} catch (err) {}

let startEventDispatchWorker;
try {
  ({ startEventDispatchWorker } = require("./workers/event_dispatch.worker"));
} catch (err) {}

let startDealerAcquisitionWorker;
try {
  ({
    startDealerAcquisitionWorker,
  } = require("./workers/dealer_acquisition.worker"));
} catch (err) {}

let startCityMetricsWorker;
try {
  ({ startCityMetricsWorker } = require("./workers/city_metrics.worker"));
} catch (err) {}

let startDealerReportWorker;
try {
  ({ startDealerReportWorker } = require("./workers/dealer_report.worker"));
} catch (err) {}

let startCityRadarWorker;
try {
  ({ startCityRadarWorker } = require("./workers/city_radar.worker"));
} catch (err) {}

let startGoogleDealerCollectorWorker;
try {
  ({
    startGoogleDealerCollectorWorker,
  } = require("./workers/google_dealer_collector.worker"));
} catch (err) {}

let startAlertMatchWorker;
try {
  ({ startAlertMatchWorker } = require("./workers/alert_match.worker"));
} catch (err) {}

/* =====================================================
   START DO SERVIDOR
===================================================== */
async function startServer() {
  try {
    console.log("🔧 Rodando migrations...");
    await runMigrations();
    console.log("✅ Migrations concluídas.");

    app.listen(PORT, () => {
      console.log(`🚗 API Carros na Cidade rodando na porta ${PORT}`);
      console.log("🚀 Iniciando workers...");

      startWorkerSafe("Strategy Worker", startStrategyWorker);
      startWorkerSafe("Autopilot Worker", startAutopilotWorker);
      startWorkerSafe("Opportunity Engine", startOpportunityEngine);
      startWorkerSafe("SEO Worker", startSeoWorker);
      startWorkerSafe("Event Banner Worker", startEventBannerWorker);
      startWorkerSafe("Event Dispatch Worker", startEventDispatchWorker);
      startWorkerSafe(
        "Dealer Acquisition Worker",
        startDealerAcquisitionWorker
      );
      startWorkerSafe(
        "Google Dealer Collector",
        startGoogleDealerCollectorWorker
      );
      startWorkerSafe("City Metrics Worker", startCityMetricsWorker);
      startWorkerSafe("Dealer Report Worker", startDealerReportWorker);
      startWorkerSafe("City Radar Worker", startCityRadarWorker);
      startWorkerSafe("Alert Match Worker", startAlertMatchWorker);

      try {
        require("./workers/whatsapp.worker");
        console.log("✅ WhatsApp Worker iniciado");
      } catch (err) {
        console.warn("⚠️ WhatsApp Worker não encontrado");
      }

      console.log("🏁 Workers inicializados");
    });
  } catch (err) {
    console.error("❌ Erro ao iniciar servidor:", err);
    process.exit(1);
  }
}

startServer();
