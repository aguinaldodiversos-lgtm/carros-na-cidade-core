const { sendStrategyReport } = require("../services/strategy.service");

/* =====================================================
   STRATEGY WORKER
   Responsável por enviar relatórios estratégicos
===================================================== */

function startStrategyWorker() {
  console.log("🧠 Strategy worker iniciado");

  // executa uma vez ao iniciar (opcional, mas útil)
  setTimeout(() => {
    sendStrategyReport();
  }, 10000); // 10 segundos após o start

  // executa a cada 6 horas
  setInterval(() => {
    console.log("📊 Gerando relatório estratégico...");
    sendStrategyReport();
  }, 1000 * 60 * 60 * 6);
}

module.exports = { startStrategyWorker };
