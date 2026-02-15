require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

/* =====================================================
   PROCESSAR MÉTRICAS DE UMA CIDADE
===================================================== */
async function processarMetricasCidade(cidade) {
  try {
    // 1) Visitas (analytics)
    const visitsResult = await pool.query(
      `
      SELECT COUNT(*)::int AS total
      FROM analytics
      WHERE city_id = $1
        AND created_at >= NOW() - INTERVAL '30 days'
      `,
      [cidade.id]
    );

    const visits = visitsResult.rows[0].total || 0;

    // 2) Leads
    const leadsResult = await pool.query(
      `
      SELECT COUNT(*)::int AS total
      FROM alerts
      WHERE city_id = $1
        AND created_at >= NOW() - INTERVAL '30 days'
      `,
      [cidade.id]
    );

    const leads = leadsResult.rows[0].total || 0;

    // 3) Anúncios ativos
    const adsResult = await pool.query(
      `
      SELECT COUNT(*)::int AS total
      FROM ads
      WHERE city_id = $1
        AND status = 'active'
      `,
      [cidade.id]
    );

    const adsCount = adsResult.rows[0].total || 0;

    // 4) Lojistas ativos
    const advertisersResult = await pool.query(
      `
      SELECT COUNT(*)::int AS total
      FROM advertisers
      WHERE city_id = $1
        AND status = 'active'
      `,
      [cidade.id]
    );

    const advertisersCount = advertisersResult.rows[0].total || 0;

    // 5) Taxa de conversão
    let conversionRate = 0;
    if (visits > 0) {
      conversionRate = (leads / visits) * 100;
    }

    // 6) Upsert na tabela
    await pool.query(
      `
      INSERT INTO city_metrics (
        city_id,
        visits,
        leads,
        ads_count,
        advertisers_count,
        conversion_rate,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
      ON CONFLICT (city_id)
      DO UPDATE SET
        visits = EXCLUDED.visits,
        leads = EXCLUDED.leads,
        ads_count = EXCLUDED.ads_count,
        advertisers_count = EXCLUDED.advertisers_count,
        conversion_rate = EXCLUDED.conversion_rate,
        updated_at = NOW()
      `,
      [
        cidade.id,
        visits,
        leads,
        adsCount,
        advertisersCount,
        conversionRate,
      ]
    );

    console.log(
      `📊 Métricas atualizadas: ${cidade.name} | visitas: ${visits} | leads: ${leads}`
    );
  } catch (err) {
    console.error(
      "❌ Erro ao processar métricas da cidade:",
      cidade.name,
      err
    );
  }
}

/* =====================================================
   WORKER PRINCIPAL
===================================================== */
async function runCityMetricsWorker() {
  try {
    console.log("📊 Atualizando métricas das cidades...");

    const citiesResult = await pool.query(`
      SELECT id, name
      FROM cities
    `);

    const cities = citiesResult.rows;

    for (const cidade of cities) {
      await processarMetricasCidade(cidade);
    }

    console.log("✅ Métricas atualizadas com sucesso");
  } catch (err) {
    console.error("❌ Erro no city metrics worker:", err);
  }
}

function startCityMetricsWorker() {
  runCityMetricsWorker();

  // Executa a cada 24 horas
  setInterval(runCityMetricsWorker, 24 * 60 * 60 * 1000);
}

module.exports = {
  startCityMetricsWorker,
};
