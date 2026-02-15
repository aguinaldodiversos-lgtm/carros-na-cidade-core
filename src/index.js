require("dotenv").config();

const app = require("./app");
const runMigrations = require("./database/migrate");

const PORT = process.env.PORT || 3000;

/* =====================================================
   IMPORTAÇÃO SEGURA DOS WORKERS
===================================================== */

let startStrategyWorker;
try {
  ({ startStrategyWorker } = require("./workers/strategy.worker"));
} catch {
  console.warn("⚠️ Strategy worker não encontrado, ignorando...");
}

let startAutopilotWorker;
try {
  ({ startAutopilotWorker } = require("./workers/autopilot.worker"));
} catch {
  console.warn("⚠️ Autopilot worker não encontrado, ignorando...");
}

let startSeoWorker;
try {
  ({ startSeoWorker } = require("./workers/seo.worker"));
} catch {
  console.warn("⚠️ SEO worker não encontrado, ignorando...");
}

let startOpportunityEngine;
try {
  ({ startOpportunityEngine } = require("./workers/opportunity_engine"));
} catch {
  console.warn("⚠️ Opportunity engine não encontrado, ignorando...");
}

let startEventBannerWorker;
try {
  ({ startEventBannerWorker } = require("./workers/event_banner.worker"));
} catch {
  console.warn("⚠️ Event banner worker não encontrado, ignorando...");
}

let startEventDispatchWorker;
try {
  ({ startEventDispatchWorker } = require("./workers/event_dispatch.worker"));
} catch {
  console.warn("⚠️ Event dispatch worker não encontrado, ignorando...");
}

let startDealerAcquisitionWorker;
try {
  ({
    startDealerAcquisitionWorker,
  } = require("./workers/dealer_acquisition.worker"));
} catch {
  console.warn("⚠️ Dealer acquisition worker não encontrado, ignorando...");
}

let startCityMetricsWorker;
try {
  ({ startCityMetricsWorker } = require("./workers/city_metrics.worker"));
} catch {
  console.warn("⚠️ City metrics worker não encontrado, ignorando...");
}

let startDealerReportWorker;
try {
  ({ startDealerReportWorker } = require("./workers/dealer_report.worker"));
} catch {
  console.warn("⚠️ Dealer report worker não encontrado, ignorando...");
}

let startCityRadarWorker;
try {
  ({ startCityRadarWorker } = require("./workers/city_radar.worker"));
} catch {
  console.warn("⚠️ City radar worker não encontrado, ignorando...");
}

let startGoogleDealerCollectorWorker;
try {
  ({
    startGoogleDealerCollectorWorker,
  } = require("./workers/google_dealer_collector.worker"));
} catch {
  console.warn("⚠️ Google dealer collector não encontrado, ignorando...");
}

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

      try {
        console.log("🚀 Iniciando workers...");

        if (startStrategyWorker) startStrategyWorker();
        if (startAutopilotWorker) startAutopilotWorker();
        if (startSeoWorker) startSeoWorker();
        if (startOpportunityEngine) startOpportunityEngine();
        if (startEventBannerWorker) startEventBannerWorker();
        if (startEventDispatchWorker) startEventDispatchWorker();
        if (startDealerAcquisitionWorker)
          startDealerAcquisitionWorker();
        if (startCityMetricsWorker) startCityMetricsWorker();
        if (startDealerReportWorker) startDealerReportWorker();
        if (startCityRadarWorker) startCityRadarWorker();
        if (startGoogleDealerCollectorWorker)
          startGoogleDealerCollectorWorker();

        // Worker de WhatsApp (fila)
        try {
          require("./workers/whatsapp.worker");
          console.log("📲 WhatsApp worker carregado");
        } catch {
          console.warn("⚠️ WhatsApp worker não encontrado, ignorando...");
        }

        console.log("✅ Workers iniciados");
      } catch (err) {
        console.error("❌ Erro ao iniciar workers:", err);
      }
    });
  } catch (err) {
    console.error("❌ Erro ao iniciar servidor:", err);
    process.exit(1);
  }
}

startServer();
