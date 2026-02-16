require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

/* =====================================================
   FUNÇÃO SEGURA PARA CONTAR REGISTROS
===================================================== */
async function safeCount(query, params = []) {
  try {
    const result = await pool.query(query, params);
    return result.rows[0].total || 0;
  } catch (err) {
    console.warn("⚠️ Erro em contagem segura:", err.message);
    return 0;
  }
}

/* =====================================================
   PROCESSAR MÉTRICAS DE UMA CIDADE
===================================================== */
async function processarMetricasCidade(cidade) {
  try {
    const cityId = cidade.id;

    // 1) Visitas
    const visits = await safeCount(
      `
      SELECT COUNT(*)::int AS total
      FROM analytics
      WHERE city_id = $1
      `,
      [cityId]
    );

    // 2) Leads
    const leads = await safeCount(
      `
      SELECT COUNT(*)::int AS total
      FROM alerts
      WHERE city_id = $1
      `,
      [cityId]
    );

    // 3) Anúncios ativos
    const adsCount = await safeCount(
      `
      SELECT COUNT(*)::int AS total
      FROM ads
      WHERE city_id = $1
      AND status = 'active'
      `,
      [cityId]
    );

    // 4) Lojistas (sem depender de status)
    const advertisersCount = await safeCount(
      `
      SELECT COUNT(*)::int AS total
      FROM advertisers
      WHERE city_id = $1
      `,
      [cityId]
    );

    // 5) Taxa de conversão
    let conversionRate = 0;
    if (visits > 0) {
      conversionRate = (leads / visits) * 100;
    }

    // 6) Upsert na tabela city_metrics
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
        cityId,
        visits,
        leads,
        adsCount,
        advertisersCount,
        conversionRate,
      ]
    );

    console.log(
      `📊 Métricas: ${cidade.name} | visitas: ${visits} | leads: ${leads}`
    );
  } catch (err) {
    console.error(
      "❌ Erro ao processar métricas da cidade:",
      cidade.name,
      err.message
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
    console.error("❌ Erro no city metrics worker:", err.message);
  }
}

/* =====================================================
   START DO WORKER
===================================================== */
function startCityMetricsWorker() {
  runCityMetricsWorker();

  // Executa a cada 24 horas
  setInterval(runCityMetricsWorker, 24 * 60 * 60 * 1000);
}

module.exports = {
  startCityMetricsWorker,
};
