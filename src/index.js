require("dotenv").config();

const app = require("./app");
const runMigrations = require("./database/migrate");

/* =====================================================
   WORKERS COM LOAD SEGURO
===================================================== */

function safeRequire(path, label) {
  try {
    return require(path);
  } catch (err) {
    console.warn(`⚠️ ${label} não encontrado, ignorando...`);
    return {};
  }
}

// Inteligência
const { startStrategyWorker } = safeRequire(
  "./workers/strategy.worker",
  "Strategy worker"
);

const { startAutopilotWorker } = safeRequire(
  "./workers/autopilot.worker",
  "Autopilot worker"
);

const { startOpportunityEngine } = safeRequire(
  "./workers/opportunity_engine",
  "Opportunity engine"
);

// Aquisição
const { startDealerAcquisitionWorker } = safeRequire(
  "./workers/dealer_acquisition.worker",
  "Dealer acquisition worker"
);

const { startLeadScoringWorker } = safeRequire(
  "./workers/lead_scoring.worker",
  "Lead scoring worker"
);

// Social
const { startSocialPresenceWorker } = safeRequire(
  "./workers/social_presence.worker",
  "Social presence worker"
);

const { startSocialPublisherWorker } = safeRequire(
  "./workers/social_publisher.worker",
  "Social publisher worker"
);

// Mensagens
const { startMessageGeneratorWorker } = safeRequire(
  "./workers/message_generator.worker",
  "Message generator worker"
);

const { startNotificationWorker } = safeRequire(
  "./workers/notification.worker",
  "Notification worker"
);

// SEO
const { startSeoWorker } = safeRequire(
  "./workers/seo.worker",
  "SEO worker"
);

// Eventos
const { startBannerWorker } = safeRequire(
  "./workers/banner_generator.worker",
  "Banner worker"
);

const { startEventDispatchWorker } = safeRequire(
  "./workers/event_dispatch.worker",
  "Event dispatch worker"
);

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
        startStrategyWorker && startStrategyWorker();
        startAutopilotWorker && startAutopilotWorker();
        startOpportunityEngine && startOpportunityEngine();

        startDealerAcquisitionWorker && startDealerAcquisitionWorker();
        startLeadScoringWorker && startLeadScoringWorker();

        startSocialPresenceWorker && startSocialPresenceWorker();
        startSocialPublisherWorker && startSocialPublisherWorker();

        startMessageGeneratorWorker && startMessageGeneratorWorker();
        startNotificationWorker && startNotificationWorker();

        startSeoWorker && startSeoWorker();

        startBannerWorker && startBannerWorker();
        startEventDispatchWorker && startEventDispatchWorker();

        console.log("🚀 Workers iniciados");
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
