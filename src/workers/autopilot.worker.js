require("dotenv").config();
const { Pool } = require("pg");

const { garantirSEO } = require("../services/seo/seoPages.service");
const {
  ativarAquisicaoDeLojistas,
} = require("../services/acquisition/dealerAcquisition.service");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const LEAD_META = 20;
const ESTOQUE_MINIMO = 30;

/* =====================================================
   CRIAR CAMPANHA LOCAL
===================================================== */
async function criarCampanhaLocal(cidade) {
  console.log(`📢 Criando campanha local para ${cidade.name}`);

  await pool.query(
    `
    INSERT INTO autopilot_campaigns
    (city_id, type, status, created_at)
    VALUES ($1, 'local_growth', 'active', NOW())
    `,
    [cidade.id]
  );
}

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

    if (!["critical", "high"].includes(oportunidade)) {
      return;
    }

    console.log(`🚀 Cidade estratégica: ${cidade.name}`);

    // 2) Garantir SEO
    await garantirSEO(cidade, pool);

    // 3) Contar leads
    const leadsResult = await pool.query(
      `
      SELECT COUNT(*)::int AS total
      FROM alerts
      WHERE city_id = $1
      `,
      [cidade.id]
    );

    const totalLeads = leadsResult.rows[0].total || 0;

    if (totalLeads < LEAD_META) {
      await criarCampanhaLocal(cidade);
    }

    // 4) Contar estoque (anúncios)
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

    if (estoque < ESTOQUE_MINIMO) {
      await ativarAquisicaoDeLojistas(cidade, pool);
    }
  } catch (err) {
    console.error("Erro ao processar cidade:", cidade.name, err);
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
