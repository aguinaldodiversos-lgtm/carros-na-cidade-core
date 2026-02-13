require("dotenv").config();

const app = require("./app");
const runMigrations = require("./database/migrate");

const { startStrategyWorker } = require("./workers/strategy.worker");
const { startAutopilotWorker } = require("./workers/autopilot.worker");
const { startSeoWorker } = require("./workers/seo.worker");
const { startMetricsWorker } = require("./workers/metrics.worker");

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
        startSeoWorker();
        startMetricsWorker();

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
