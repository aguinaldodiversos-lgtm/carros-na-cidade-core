require("dotenv").config();

const app = require("./app");
const runMigrations = require("./database/migrate");

/* =====================================================
   WORKERS
===================================================== */

// Estratégia e inteligência
const { startStrategyWorker } = require("./workers/strategy.worker");
const { startAutopilotWorker } = require("./workers/autopilot.worker");
const { startOpportunityEngine } = require("./workers/opportunity_engine");

// Aquisição e crescimento
const { startDealerAcquisitionWorker } = require("./workers/dealer_acquisition.worker");
const { startLeadScoringWorker } = require("./workers/lead_scoring.worker");

// Social e campanhas
const { startSocialPresenceWorker } = require("./workers/social_presence.worker");
const { startSocialPublisherWorker } = require("./workers/social_publisher.worker");

// Mensagens e notificações
const { startMessageGeneratorWorker } = require("./workers/message_generator.worker");
const { startNotificationWorker } = require("./workers/notification.worker");

// SEO
let startSeoWorker;
try {
  ({ startSeoWorker } = require("./workers/seo.worker"));
} catch {
  console.warn("⚠️ SEO worker não encontrado, ignorando...");
}

// Banner de eventos
let startBannerWorker;
try {
  ({ startBannerWorker } = require("./workers/banner_generator.worker"));
} catch {
  console.warn("⚠️ Banner worker não encontrado, ignorando...");
}

/* =====================================================
   START DO SERVIDOR
===================================================== */
const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    console.log("🔧 Rodando migrations...");
    await runMigrations();
    console.log("✅ Migrations concluídas.");

    app.listen(PORT, () => {
      console.log(`🚗 API Carros na Cidade rodando na porta ${PORT}`);

      try {
        // Inteligência central
        startStrategyWorker();
        startAutopilotWorker();
        startOpportunityEngine();

        // Aquisição
        startDealerAcquisitionWorker();
        startLeadScoringWorker();

        // Social
        startSocialPresenceWorker();
        startSocialPublisherWorker();

        // Mensagens
        startMessageGeneratorWorker();
        startNotificationWorker();

        // SEO
        if (startSeoWorker) {
          startSeoWorker();
        }

        // Banner de eventos
        if (startBannerWorker) {
          startBannerWorker();
        }

        console.log("🚀 Todos os workers iniciados");
      } catch (err) {
        console.error("Erro ao iniciar workers:", err);
      }
    });
  } catch (err) {
    console.error("Erro ao iniciar servidor:", err);
    process.exit(1);
  }
}

startServer();
