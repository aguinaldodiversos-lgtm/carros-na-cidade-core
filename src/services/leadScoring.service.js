const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

function calculateScore(lead, cityPriority) {
  let score = 0;

  // 1) Cidade prioritária
  if (cityPriority === "critical") score += 40;
  else if (cityPriority === "high") score += 25;
  else if (cityPriority === "medium") score += 10;

  // 2) CNAE principal
  if (lead.cnae === "4511101") {
    score += 30;
  } else if (lead.cnae) {
    score += 15;
  }

  // 3) Telefone válido
  if (lead.phone) {
    score += 20;
  }

  return score;
}

function getPriority(score) {
  if (score >= 80) return "critical";
  if (score >= 60) return "high";
  if (score >= 40) return "medium";
  return "low";
}

async function scoreLead(lead) {
  const cityResult = await pool.query(
    `
    SELECT priority_level
    FROM city_growth_state
    WHERE city_id = $1
    LIMIT 1
  `,
    [lead.city_id]
  );

  const cityPriority =
    cityResult.rows[0]?.priority_level || "low";

  const score = calculateScore(lead, cityPriority);
  const priority = getPriority(score);

  await pool.query(
    `
    INSERT INTO dealer_lead_scores (
      dealer_lead_id,
      score,
      priority_level,
      calculated_at
    )
    VALUES ($1,$2,$3,NOW())
    ON CONFLICT (dealer_lead_id)
    DO UPDATE SET
      score = EXCLUDED.score,
      priority_level = EXCLUDED.priority_level,
      calculated_at = NOW()
  `,
    [lead.id, score, priority]
  );

  return { score, priority };
}

module.exports = { scoreLead };
