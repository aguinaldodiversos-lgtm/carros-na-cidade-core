require("dotenv").config();

const app = require("./app");
const runMigrations = require("./database/migrate");

/* =====================================================
   IMPORTAÇÃO DOS WORKERS
===================================================== */
const { startStrategyWorker } = require("./workers/strategy.worker");
const { startAutopilotWorker } = require("./workers/autopilot.worker");
const { startSeoWorker } = require("./workers/seo.worker");

// Opportunity engine pode ter nome diferente
let startOpportunityEngine;
try {
  ({ startOpportunityEngine } = require("./workers/opportunity_engine"));
} catch {
  console.warn("⚠️ Opportunity engine não encontrado, ignorando...");
}

// Event workers
let startEventBannerWorker;
let startEventDispatchWorker;

try {
  ({ startEventBannerWorker } = require("./workers/event_banner.worker"));
} catch {
  console.warn("⚠️ Event banner worker não encontrado, ignorando...");
}

try {
  ({ startEventDispatchWorker } = require("./workers/event_dispatch.worker"));
} catch {
  console.warn("⚠️ Event dispatch worker não encontrado, ignorando...");
}

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

      try {
        console.log("🚀 Iniciando workers...");

        startStrategyWorker();
        startAutopilotWorker();
        startSeoWorker();

        if (startOpportunityEngine) {
          startOpportunityEngine();
        }

        if (startEventBannerWorker) {
          startEventBannerWorker();
        }

        if (startEventDispatchWorker) {
          startEventDispatchWorker();
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
