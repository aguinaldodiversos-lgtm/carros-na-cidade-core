const { generateMarketIntelligence } = require("../services/marketIntelligence.service");

function startMarketWorker() {
  console.log("🧠 Market intelligence worker iniciado");

  setInterval(async () => {
    const data = await generateMarketIntelligence();
    console.log("📊 Top oportunidades:");
    console.log(data.opportunities.slice(0, 3));
  }, 1000 * 60 * 60 * 6); // a cada 6h
}

module.exports = { startMarketWorker };
