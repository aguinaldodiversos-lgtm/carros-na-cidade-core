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
const { startCnpjCollectorWorker } = require("./workers/cnpj_collector.worker");
const { startOpenCnpjCollectorWorker } = require("./workers/open_cnpj_collector.worker");
const { startLeadScoringWorker } = require("./workers/lead_scoring.worker");
const { startDealerFollowupWorker } = require("./workers/dealer_followup.worker");
const { startDealerConversionWorker } = require("./workers/dealer_conversion.worker");
const { startRegionalExpansionWorker } = require("./workers/regional_expansion.worker");
const { startRegionalClusterWorker } = require("./workers/regional_cluster.worker");
const { startCityMilestoneWorker } = require("./workers/city_milestone.worker");
const { startCityIntelligenceWorker } = require("./workers/city_intelligence.worker");
const { startCityAlertsWorker } = require("./workers/city_alerts.worker");
const { startAlertActionWorker } = require("./workers/alert_action.worker");
const { startMessageOptimizerWorker } = require("./workers/message_optimizer.worker");

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
        startStrategyWorker();
        startAutopilotWorker();
        startOpportunityWorker();
        startCampaignExecutorWorker();
        startDealerCollectorWorker();
        startLocalDominationWorker();
        startSocialPresenceWorker();
        startSocialPublisherWorker();
        startCnpjCollectorWorker();
        startOpenCnpjCollectorWorker();
        startLeadScoringWorker();
        startDealerFollowupWorker();
        startDealerConversionWorker();
        startRegionalExpansionWorker();
        startRegionalClusterWorker();
        startCityMilestoneWorker();
        startCityIntelligenceWorker();
        startCityAlertsWorker();
        startAlertActionWorker();
        startMessageOptimizerWorker();

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
