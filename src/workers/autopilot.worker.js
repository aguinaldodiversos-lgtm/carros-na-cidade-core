const { runAutopilot } = require("../services/autopilot.service");

function startAutopilotWorker() {
  console.log("🤖 Autopilot worker iniciado");

  // roda a cada 12 horas
  setInterval(() => {
    runAutopilot();
  }, 1000 * 60 * 60 * 12);
}

module.exports = { startAutopilotWorker };
