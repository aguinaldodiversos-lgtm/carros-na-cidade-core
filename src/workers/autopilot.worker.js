require("dotenv").config();
const { Pool } = require("pg");

const { garantirSEO } = require("../services/seo/seoPages.service");
const {
  ativarAquisicaoDeLojistas,
} = require("../services/acquisition/dealerAcquisition.service");

const {
  criarCampanhaLocal,
} = require("../services/campaigns/localCampaign.service");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const LEAD_META = 20;
const ESTOQUE_MINIMO = 30;

/* =====================================================
   PROCESSAR CIDADE
===================================================== */
async function processarCidade(cidade) {
  try {
    // 1) Buscar oportunidade
    const oppResult = await pool.query(
      `
      SELECT priority_level
      FROM city_opportunities
      WHERE city_id = $1
      LIMIT 1
      `,
      [cidade.id]
    );

    if (oppResult.rows.length === 0) return;

    const oportunidade = oppResult.rows[0].priority_level;

    // Só agir em cidades estratégicas
    if (!["critical", "high"].includes(oportunidade)) {
      return;
    }

    console.log(`🚀 Cidade estratégica: ${cidade.name}`);

    // 2) Garantir SEO
    await garantirSEO(cidade, pool);

    // 3) Contar leads (alertas)
    const leadsResult = await pool.query(
      `
      SELECT COUNT(*)::int AS total
      FROM alerts
      WHERE city_id = $1
      `,
      [cidade.id]
    );

    const totalLeads = leadsResult.rows[0].total || 0;

    // 4) Criar campanha se necessário
    if (totalLeads < LEAD_META) {
      await criarCampanhaLocal(cidade, pool);
    }

    // 5) Contar estoque (anúncios ativos)
    const stockResult = await pool.query(
      `
      SELECT COUNT(*)::int AS total
      FROM ads
      WHERE city_id = $1
        AND status = 'active'
      `,
      [cidade.id]
    );

    const estoque = stockResult.rows[0].total || 0;

    // 6) Ativar aquisição se estoque baixo
    if (estoque < ESTOQUE_MINIMO) {
      await ativarAquisicaoDeLojistas(cidade, pool);
    }
  } catch (err) {
    console.error("❌ Erro ao processar cidade:", cidade.name, err);
  }
}

/* =====================================================
   WORKER PRINCIPAL
===================================================== */
async function runAutopilotWorker() {
  try {
    console.log("🤖 Rodando Autopilot Worker...");

    const citiesResult = await pool.query(`
      SELECT id, name, slug
      FROM cities
    `);

    const cities = citiesResult.rows;

    for (const cidade of cities) {
      await processarCidade(cidade);
    }

    console.log("✅ Autopilot finalizado");
  } catch (err) {
    console.error("❌ Erro no Autopilot:", err);
  }
}

function startAutopilotWorker() {
  runAutopilotWorker();
  setInterval(runAutopilotWorker, 6 * 60 * 60 * 1000);
}

module.exports = {
  startAutopilotWorker,
};
