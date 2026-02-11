const { runCompetitorScan } = require("../services/competitorMonitor.service");

function startCompetitorWorker() {
  console.log("📡 Competitor worker iniciado");

  // roda a cada 12 horas
  setInterval(() => {
    runCompetitorScan();
  }, 1000 * 60 * 60 * 12);
}

module.exports = { startCompetitorWorker };
