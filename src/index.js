require("dotenv").config();

const runMigrations = require("./database/migrate");
const app = require("./app");

// Workers
const { startStrategyWorker } = require("./workers/strategy.worker");
const { startAutopilotWorker } = require("./workers/autopilot.worker");
const { startOpportunityWorker } = require("./workers/opportunity_engine");

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
