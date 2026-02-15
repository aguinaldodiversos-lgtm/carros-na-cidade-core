require("dotenv").config();
const { Pool } = require("pg");

const { sendWhatsAppMessage } = require("../services/whatsapp.service");
const { gerarInsightsLojista } = require("../services/dealers/dealerInsight.service");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function runDealerReportWorker() {
  try {
    console.log("📊 Gerando relatórios de lojistas...");

    const dealersResult = await pool.query(`
      SELECT id, name, whatsapp, city_id
      FROM advertisers
      WHERE status = 'active'
    `);

    const dealers = dealersResult.rows;

    for (const dealer of dealers) {
      // métricas do lojista
      const metricsResult = await pool.query(
        `
        SELECT visits, leads, contacts, qualified_leads
        FROM dealer_metrics
        WHERE advertiser_id = $1
        `,
        [dealer.id]
      );

      if (metricsResult.rows.length === 0) continue;

      const metrics = metricsResult.rows[0];

      // média da cidade
      const cityStatsResult = await pool.query(
        `
        SELECT
          AVG(visits)::int AS avg_visits,
          AVG(leads)::int AS avg_leads
        FROM dealer_metrics dm
        JOIN advertisers a
          ON a.id = dm.advertiser_id
        WHERE a.city_id = $1
        `,
        [dealer.city_id]
      );

      const cityStats = cityStatsResult.rows[0];

      // gerar insights com IA
      const insights = await gerarInsightsLojista(
        dealer,
        metrics,
        cityStats
      );

      const message = `
📊 Relatório semanal – Carros na Cidade

Sua loja teve:
• ${metrics.visits} visualizações
• ${metrics.leads} interessados
• ${metrics.contacts} contatos diretos
• ${metrics.qualified_leads} leads qualificados

Sugestões:
${insights}
`;

      if (dealer.whatsapp) {
        await sendWhatsAppMessage(dealer.whatsapp, message);
      }
    }

    console.log("✅ Relatórios enviados");
  } catch (err) {
    console.error("❌ Erro no dealer report worker:", err);
  }
}

function startDealerReportWorker() {
  runDealerReportWorker();

  // a cada 7 dias
  setInterval(runDealerReportWorker, 7 * 24 * 60 * 60 * 1000);
}

module.exports = {
  startDealerReportWorker,
};
