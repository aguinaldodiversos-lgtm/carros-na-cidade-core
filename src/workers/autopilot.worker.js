const { runAutopilot } = require("../services/autopilot.service");

/* =====================================================
   AUTOPILOT WORKER
   Roda a cada 6 horas
===================================================== */

function startAutopilotWorker() {
  console.log("🤖 Autopilot worker iniciado");

  // roda imediatamente ao iniciar
  runAutopilot();

  // roda a cada 6 horas
  setInterval(() => {
    runAutopilot();
  }, 1000 * 60 * 60 * 6);
}

module.exports = { startAutopilotWorker };
