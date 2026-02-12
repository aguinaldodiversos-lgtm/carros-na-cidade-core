require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

function classifyCity(population, opportunity) {
  if (population > 500000) return "metro";
  if (population < 60000) return "satellite";
  if (opportunity > 40) return "strategic";
  return "satellite";
}

function calculateGrowthScore(data) {
  const ads = Number(data.ads || 0);
  const dealers = Number(data.dealers || 0);
  const opportunity = Number(data.opportunity_score || 0);

  return (
    dealers * 5 +
    ads * 0.5 +
    opportunity
  );
}

function calculateConfidence(converted, leads) {
  if (leads === 0) return 0;
  const rate = (converted / leads) * 100;

  return Math.min(rate * 2, 100);
}

function decideStatus(growth, confidence) {
  if (confidence > 15 && growth > 100) {
    return { status: "scaling", effort: "aggressive" };
  }

  if (confidence > 8 && growth > 60) {
    return { status: "stable", effort: "medium" };
  }

  if (confidence < 2 && growth < 20) {
    return { status: "abandoned", effort: "low" };
  }

  if (confidence < 5) {
    return { status: "declining", effort: "low" };
  }

  return { status: "testing", effort: "medium" };
}

async function runCityIntelligence() {
  try {
    console.log("🧠 Rodando City Intelligence Engine...");

    const cities = await pool.query(`
      SELECT
        c.id,
        c.population,
        co.opportunity_score,
        COUNT(DISTINCT dl.id) AS leads,
        SUM(CASE WHEN dl.converted THEN 1 ELSE 0 END) AS converted,
        COUNT(DISTINCT a.id) AS ads
      FROM cities c
      LEFT JOIN city_opportunities co ON co.city_id = c.id
      LEFT JOIN dealer_leads dl ON dl.city_id = c.id
      LEFT JOIN ads a ON a.city_id = c.id
      GROUP BY c.id, c.population, co.opportunity_score
      LIMIT 300
    `);

    for (const city of cities.rows) {
      const population = Number(city.population || 0);
      const opportunity = Number(city.opportunity_score || 0);
      const leads = Number(city.leads || 0);
      const converted = Number(city.converted || 0);

      const cityType = classifyCity(population, opportunity);

      const growthScore = calculateGrowthScore(city);
      const confidence = calculateConfidence(converted, leads);

      const decision = decideStatus(growthScore, confidence);

      await pool.query(
        `
        INSERT INTO city_strategy_state (
          city_id,
          city_type,
          confidence_score,
          growth_score,
          effort_level,
          status,
          last_evaluated_at
        )
        VALUES ($1,$2,$3,$4,$5,$6,NOW())
        ON CONFLICT (city_id)
        DO UPDATE SET
          city_type = EXCLUDED.city_type,
          confidence_score = EXCLUDED.confidence_score,
          growth_score = EXCLUDED.growth_score,
          effort_level = EXCLUDED.effort_level,
          status = EXCLUDED.status,
          last_evaluated_at = NOW()
      `,
        [
          city.id,
          cityType,
          confidence,
          growthScore,
          decision.effort,
          decision.status,
        ]
      );

      console.log(
        `Cidade ${city.id}: ${cityType} | ${decision.status} | effort ${decision.effort}`
      );
    }

    console.log("✅ City intelligence finalizado");
  } catch (err) {
    console.error("❌ Erro no city intelligence:", err);
  }
}

function startCityIntelligenceWorker() {
  setInterval(runCityIntelligence, 3 * 60 * 60 * 1000);
  runCityIntelligence();
}

module.exports = { startCityIntelligenceWorker };
