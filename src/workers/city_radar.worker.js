require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

/* =====================================================
   CALCULAR SCORE DE DOMINAÇÃO
===================================================== */
function calcularScore(metrics) {
  let score = 0;

  // Peso por anúncios
  if (metrics.ads_count >= 50) score += 30;
  else score += (metrics.ads_count / 50) * 30;

  // Peso por leads
  if (metrics.leads >= 20) score += 25;
  else score += (metrics.leads / 20) * 25;

  // Peso por lojistas
  if (metrics.advertisers_count >= 10) score += 25;
  else score += (metrics.advertisers_count / 10) * 25;

  // Peso por conversão
  if (metrics.conversion_rate >= 5) score += 20;
  else score += (metrics.conversion_rate / 5) * 20;

  return Math.round(score);
}

/* =====================================================
   DEFINIR STATUS DA CIDADE
===================================================== */
function definirStatus(score) {
  if (score >= 80) return "dominated";
  if (score >= 40) return "growing";
  return "exploring";
}

/* =====================================================
   PROCESSAR UMA CIDADE
===================================================== */
async function processarCidade(cidade) {
  try {
    const metricsResult = await pool.query(
      `
      SELECT
        visits,
        leads,
        ads_count,
        advertisers_count,
        conversion_rate
      FROM city_metrics
      WHERE city_id = $1
      `,
      [cidade.id]
    );

    if (metricsResult.rows.length === 0) return;

    const metrics = metricsResult.rows[0];

    const score = calcularScore(metrics);
    const status = definirStatus(score);

    // Upsert
    await pool.query(
      `
      INSERT INTO city_status (
        city_id,
        status,
        score,
        updated_at
      )
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (city_id)
      DO UPDATE SET
        status = EXCLUDED.status,
        score = EXCLUDED.score,
        updated_at = NOW()
      `,
      [cidade.id, status, score]
    );

    console.log(
      `📍 ${cidade.name} → status: ${status} | score: ${score}`
    );
  } catch (err) {
    console.error("Erro no radar da cidade:", cidade.name, err);
  }
}

/* =====================================================
   WORKER PRINCIPAL
===================================================== */
async function runCityRadarWorker() {
  try {
    console.log("🧠 Rodando radar de cidades...");

    const citiesResult = await pool.query(`
      SELECT id, name
      FROM cities
    `);

    const cities = citiesResult.rows;

    for (const cidade of cities) {
      await processarCidade(cidade);
    }

    console.log("✅ Radar de cidades atualizado");
  } catch (err) {
    console.error("❌ Erro no city radar worker:", err);
  }
}

function startCityRadarWorker() {
  runCityRadarWorker();

  // roda a cada 24h
  setInterval(runCityRadarWorker, 24 * 60 * 60 * 1000);
}

module.exports = {
  startCityRadarWorker,
};
