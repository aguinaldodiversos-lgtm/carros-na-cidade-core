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
} catch {}

let startAutopilotWorker;
try {
  ({ startAutopilotWorker } = require("./workers/autopilot.worker"));
} catch {}

let startSeoWorker;
try {
  ({ startSeoWorker } = require("./workers/seo.worker"));
} catch {}

let startOpportunityEngine;
try {
  ({ startOpportunityEngine } = require("./workers/opportunity_engine"));
} catch {}

let startEventBannerWorker;
try {
  ({ startEventBannerWorker } = require("./workers/event_banner.worker"));
} catch {}

let startEventDispatchWorker;
try {
  ({ startEventDispatchWorker } = require("./workers/event_dispatch.worker"));
} catch {}

let startDealerAcquisitionWorker;
try {
  ({
    startDealerAcquisitionWorker,
  } = require("./workers/dealer_acquisition.worker"));
} catch {}

let startCityMetricsWorker;
try {
  ({ startCityMetricsWorker } = require("./workers/city_metrics.worker"));
} catch {}

let startDealerReportWorker;
try {
  ({ startDealerReportWorker } = require("./workers/dealer_report.worker"));
} catch {}

let startCityRadarWorker;
try {
  ({ startCityRadarWorker } = require("./workers/city_radar.worker"));
} catch {}

let startGoogleDealerCollectorWorker;
try {
  ({
    startGoogleDealerCollectorWorker,
  } = require("./workers/google_dealer_collector.worker"));
} catch {}

let startAlertMatchWorker;
try {
  ({ startAlertMatchWorker } = require("./workers/alert_match.worker"));
} catch {}

/* NOVO: autoaprovação de banner */
let startBannerAutoApproveWorker;
try {
  ({
    startBannerAutoApproveWorker,
  } = require("./workers/banner_auto_approve.worker"));
} catch {}

/* =====================================================
   START DO SERVIDOR
===================================================== */
async function startServer() {
  try {
    console.log("🔧 Rodando migrations...");
    await runMigrations();
    console.log("✅ Migrations concluídas.");

    app.listen(PORT, () => {
      console.log(`🚗 API Carros na Cidade rodando na porta ${PO
