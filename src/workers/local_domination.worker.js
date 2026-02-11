require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

function calculateCityPowerScore(state) {
  return (
    state.seo_score * 0.25 +
    state.dealer_score * 0.25 +
    state.buyer_score * 0.2 +
    state.social_score * 0.15 +
    state.competitor_gap * 0.15
  );
}

function getPriority(score) {
  if (score >= 80) return "critical";
  if (score >= 50) return "high";
  if (score >= 20) return "medium";
  return "low";
}

async function analyzeCity(cityId) {
  // 1) Buscar dados de oportunidade
  const oppResult = await pool.query(
    `
    SELECT *
    FROM city_opportunities
    WHERE city_id = $1
    ORDER BY created_at DESC
    LIMIT 1
  `,
    [cityId]
  );

  if (oppResult.rowCount === 0) return;

  const opp = oppResult.rows[0];

  const demand = Number(opp.demand_index || 0);
  const supply = Number(opp.supply_index || 0);

  // 2) Calcular scores simples
  const dealerScore = Math.max(0, 100 - supply);
  const buyerScore = Math.min(100, demand);
  const seoScore = Math.max(0, demand - supply);
  const socialScore = Math.min(100, demand / 2);
  const competitorGap = Math.max(0, demand - supply);

  const state = {
    dealer_score: dealerScore,
    buyer_score: buyerScore,
    seo_score: seoScore,
    social_score: socialScore,
    competitor_gap: competitorGap,
  };

  const cityPowerScore = calculateCityPowerScore(state);
  const priority = getPriority(cityPowerScore);

  // 3) Upsert do estado
  await pool.query(
    `
    INSERT INTO city_growth_state (
      city_id,
      dealer_score,
      buyer_score,
      seo_score,
      social_score,
      competitor_gap,
      city_power_score,
      priority_level,
      updated_at
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
    ON CONFLICT (city_id)
    DO UPDATE SET
      dealer_score = EXCLUDED.dealer_score,
      buyer_score = EXCLUDED.buyer_score,
      seo_score = EXCLUDED.seo_score,
      social_score = EXCLUDED.social_score,
      competitor_gap = EXCLUDED.competitor_gap,
      city_power_score = EXCLUDED.city_power_score,
      priority_level = EXCLUDED.priority_level,
      updated_at = NOW()
  `,
    [
      cityId,
      state.dealer_score,
      state.buyer_score,
      state.seo_score,
      state.social_score,
      state.competitor_gap,
      cityPowerScore,
      priority,
    ]
  );

  console.log(
    `🏙️ Cidade ${cityId} analisada | score: ${cityPowerScore.toFixed(2)}`
  );
}

async function runLocalDomination() {
  try {
    console.log("🌎 Rodando Local Domination Agent...");

    // Buscar cidades com oportunidade relevante
    const cities = await pool.query(`
      SELECT DISTINCT city_id
      FROM city_opportunities
      WHERE priority_level IN ('critical', 'high', 'medium')
      ORDER BY city_id
      LIMIT 20
    `);

    for (const row of cities.rows) {
      await analyzeCity(row.city_id);
    }

    console.log("✅ Local Domination finalizado");
  } catch (err) {
    console.error("❌ Erro no Local Domination Agent:", err);
  }
}

function startLocalDominationWorker() {
  // roda a cada 6 horas
  setInterval(runLocalDomination, 6 * 60 * 60 * 1000);
  runLocalDomination();
}

module.exports = { startLocalDominationWorker };
