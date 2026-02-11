require("dotenv").config();

const runMigrations = require("./database/migrate");
const app = require("./app");

// Workers principais
const { startStrategyWorker } = require("./workers/strategy.worker");
const { startAutopilotWorker } = require("./workers/autopilot.worker");
const { startOpportunityWorker } = require("./workers/opportunity_engine");
const { startCampaignExecutorWorker } = require("./workers/campaign_executor.worker");
const { startDealerCollectorWorker } = require("./workers/dealer_collector.worker");
const { startLocalDominationWorker } = require("./workers/local_domination.worker");
const { startSocialPresenceWorker } = require("./workers/social_presence.worker");
const { startSocialPublisherWorker } = require("./workers/social_publisher.worker");

// Worker opcional de SEO
let startSeoWorker;
try {
  ({ startSeoWorker } = require("./workers/seo.worker"));
} catch {
  console.warn("⚠️ SEO worker não encontrado, ignorando...");
}

const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    console.log("🔧 Rodando migrations...");
    await runMigrations();
    console.log("✅ Migrations concluídas.");

    app.listen(PORT, () => {
      console.log(`🚗 API rodando na porta ${PORT}`);

      try {
        // Inicialização dos workers
        startStrategyWorker();
        startAutopilotWorker();
        startOpportunityWorker();
        startCampaignExecutorWorker();
        startDealerCollectorWorker();
        startLocalDominationWorker();
        startSocialPresenceWorker();
        startSocialPublisherWorker();

        if (startSeoWorker) {
          startSeoWorker();
        }

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
