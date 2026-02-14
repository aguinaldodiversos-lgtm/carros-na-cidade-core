require("dotenv").config();

const app = require("./app");
const runMigrations = require("./database/migrate");

/* =====================================================
   IMPORTAÇÃO DOS WORKERS
===================================================== */
const { startStrategyWorker } = require("./workers/strategy.worker");
const { startAutopilotWorker } = require("./workers/autopilot.worker");
const { startSeoWorker } = require("./workers/seo.worker");
const { startOpportunityEngine } = require("./workers/opportunity_engine");
const { startDealerAcquisitionWorker } = require("./workers/dealer_acquisition.worker");
const { startLeadScoringWorker } = require("./workers/lead_scoring.worker");
const { startSocialPublisherWorker } = require("./workers/social_publisher.worker");
const { startMessageGeneratorWorker } = require("./workers/message_generator.worker");
const { startEventBannerWorker } = require("./workers/event_banner.worker");
const { startEventDispatchWorker } = require("./workers/event_dispatch.worker");

const PORT = process.env.PORT || 3000;

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

      /* =====================================================
         INICIALIZAÇÃO DOS WORKERS
      ===================================================== */
      try {
        console.log("🚀 Iniciando workers...");

        startStrategyWorker();
        startAutopilotWorker();
        startSeoWorker();
        startOpportunityEngine();
        startDealerAcquisitionWorker();
        startLeadScoringWorker();
        startSocialPublisherWorker();
        startMessageGeneratorWorker();
        startEventBannerWorker();     // Geração de banner de eventos
        startEventDispatchWorker();   // Disparo automático

        console.log("✅ Todos os workers iniciados");
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
