const { runSeoEngine } = require("../services/seoEngine.service");

function startSeoWorker() {
  console.log("📝 SEO worker iniciado");

  // roda a cada 24 horas
  setInterval(() => {
    runSeoEngine();
  }, 1000 * 60 * 60 * 24);
}

module.exports = { startSeoWorker };
