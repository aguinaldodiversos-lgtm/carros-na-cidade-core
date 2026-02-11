const { runAutopilot } = require("../services/autopilot.service");

function startAutopilotWorker() {
  console.log("🤖 Autopilot worker iniciado");

  // roda a cada 30 minutos
  setInterval(async () => {
    await runAutopilot();
  }, 1000 * 60 * 30);
}

module.exports = { startAutopilotWorker };
