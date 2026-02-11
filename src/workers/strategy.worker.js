const { sendStrategyReport } = require("../services/strategyReport.service");

function startStrategyWorker() {
  console.log("🧠 Strategy worker iniciado");

  // roda a cada 7 dias
  const oneWeek = 7 * 24 * 60 * 60 * 1000;

  setInterval(() => {
    sendStrategyReport();
  }, oneWeek);
}

module.exports = { startStrategyWorker };
