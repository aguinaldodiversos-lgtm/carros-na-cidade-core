require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function executeCampaign(campaign) {
  const { id, city_id, campaign_type } = campaign;

  try {
    console.log(`🚀 Executando campanha ${campaign_type} (ID: ${id})`);

    // Marcar como running
    await pool.query(
      `
      UPDATE autopilot_campaigns
      SET status = 'running',
          started_at = NOW()
      WHERE id = $1
    `,
      [id]
    );

    // Executar conforme tipo
    if (campaign_type === "seo_city") {
      await executeSeoCampaign(city_id);
    }

    if (campaign_type === "dealer_acquisition") {
      await executeDealerAcquisition(city_id);
    }

    // Marcar como concluída
    await pool.query(
      `
      UPDATE autopilot_campaigns
      SET status = 'completed',
          finished_at = NOW(),
          result_score = 1
      WHERE id = $1
    `,
      [id]
    );

    console.log(`✅ Campanha ${id} finalizada`);
  } catch (err) {
    console.error(`❌ Erro na campanha ${id}:`, err);

    await pool.query(
      `
      UPDATE autopilot_campaigns
      SET status = 'failed',
          finished_at = NOW()
      WHERE id = $1
    `,
      [id]
    );
  }
}

async function executeSeoCampaign(cityId) {
  console.log(`🔎 Executando SEO para cidade ${cityId}`);

  // Aqui você pode integrar com seu seoEngine.service
  await pool.query(
    `
    INSERT INTO autopilot_actions (
      city_id,
      action_type,
      status,
      created_at
    )
    VALUES ($1, 'seo_city', 'done', NOW())
  `,
    [cityId]
  );
}

async function executeDealerAcquisition(cityId) {
  console.log(`📞 Executando aquisição de lojistas para cidade ${cityId}`);

  // Ação inicial: registrar tentativa
  await pool.query(
    `
    INSERT INTO autopilot_actions (
      city_id,
      action_type,
      status,
      created_at
    )
    VALUES ($1, 'dealer_acquisition', 'done', NOW())
  `,
    [cityId]
  );
}

async function runCampaignExecutor() {
  try {
    console.log("⚙️ Rodando Campaign Executor...");

    const campaigns = await pool.query(
      `
      SELECT *
      FROM autopilot_campaigns
      WHERE status = 'pending'
      ORDER BY created_at ASC
      LIMIT 5
    `
    );

    for (const campaign of campaigns.rows) {
      await executeCampaign(campaign);
    }
  } catch (err) {
    console.error("❌ Erro no Campaign Executor:", err);
  }
}

function startCampaignExecutorWorker() {
  // Executa a cada 5 minutos
  setInterval(runCampaignExecutor, 5 * 60 * 1000);

  // Executa ao iniciar
  runCampaignExecutor();
}

module.exports = { startCampaignExecutor
