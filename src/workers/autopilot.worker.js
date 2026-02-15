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
   BUSCAR CIDADE FOCO
===================================================== */
async function getCidadeFoco() {
  const result = await pool.query(
    `
    SELECT value
    FROM system_settings
    WHERE key = 'cidade_foco'
    LIMIT 1
    `
  );

  if (result.rows.length === 0) return null;

  return parseInt(result.rows[0].value);
}

/* =====================================================
   PROCESSAR CIDADE
===================================================== */
async function processarCidade(cidade, cidadeFocoId) {
  try {
    const isCidadeFoco = cidade.id === cidadeFocoId;

    // buscar oportunidade
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

    // cidades que não são foco → apenas monitoramento
    if (!isCidadeFoco && !["critical"].includes(oportunidade)) {
      return;
    }

    console.log(
      `🤖 Processando cidade: ${cidade.name} ${
        isCidadeFoco ? "(FOCO)" : ""
      }`
    );

    // 1) Garantir SEO
    await garantirSEO(cidade, pool);

    // 2) Contar leads
    const leadsResult = await pool.query(
      `
      SELECT COUNT(*)::int AS total
      FROM alerts
      WHERE city_id = $1
      `,
      [cidade.id]
    );

    const totalLeads = leadsResult.rows[0].total || 0;

    // Cidade foco: meta maior
    const metaLeads = isCidadeFoco ? LEAD_META * 2 : LEAD_META;

    if (totalLeads < metaLeads) {
      await criarCampanhaLocal(cidade, pool);
    }

    // 3) Contar estoque
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

    const metaEstoque = isCidadeFoco
      ? ESTOQUE_MINIMO * 2
      : ESTOQUE_MINIMO;

    if (estoque < metaEstoque) {
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

    const cidadeFocoId = await getCidadeFoco();

    if (!cidadeFocoId) {
      console.warn("⚠️ Nenhuma cidade foco definida");
    }

    const citiesResult = await pool.query(`
      SELECT id, name, slug
      FROM cities
    `);

    const cities = citiesResult.rows;

    for (const cidade of cities) {
      await processarCidade(cidade, cidadeFocoId);
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
