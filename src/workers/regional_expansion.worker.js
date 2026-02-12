require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

function decideEffort(opportunity, conversionRate, leads) {
  if (opportunity > 70 && conversionRate > 8) {
    return { effort: "aggressive", status: "active" };
  }

  if (opportunity > 40 && conversionRate > 4) {
    return { effort: "medium", status: "active" };
  }

  if (leads > 50 && conversionRate < 1) {
    return { effort: "low", status: "abandoned" };
  }

  return { effort: "low", status: "active" };
}

async function runRegionalExpansion() {
  try {
    console.log("🌎 Rodando Regional Expansion...");

    const cities = await pool.query(`
      SELECT
        c.id AS city_id,
        co.opportunity_score,
        COUNT(dl.id) AS leads_total,
        SUM(CASE WHEN dl.converted THEN 1 ELSE 0 END) AS converted
      FROM cities c
      JOIN city_opportunities co ON co.city_id = c.id
      LEFT JOIN dealer_leads dl ON dl.city_id = c.id
      GROUP BY c.id, co.opportunity_score
      LIMIT 100
    `);

    for (const row of cities.rows) {
      const leads = Number(row.leads_total || 0);
      const converted = Number(row.converted || 0);

      const conversionRate =
        leads > 0 ? (converted / leads) * 100 : 0;

      const decision = decideEffort(
        Number(row.opportunity_score || 0),
        conversionRate,
        leads
      );

      await pool.query(
        `
        INSERT INTO city_expansion_state (
          city_id,
          effort_level,
          status,
          last_evaluated_at
        )
        VALUES ($1,$2,$3,NOW())
        ON CONFLICT (city_id)
        DO UPDATE SET
          effort_level = EXCLUDED.effort_level,
          status = EXCLUDED.status,
          last_evaluated_at = NOW()
      `,
        [
          row.city_id,
          decision.effort,
          decision.status,
        ]
      );

      console.log(
        `Cidade ${row.city_id}: ${decision.effort} / ${decision.status}`
      );
    }

    console.log("✅ Regional expansion finalizado");
  } catch (err) {
    console.error("❌ Erro na expansão regional:", err);
  }
}

function startRegionalExpansionWorker() {
  setInterval(runRegionalExpansion, 6 * 60 * 60 * 1000);
  runRegionalExpansion();
}

module.exports = { startRegionalExpansionWorker };
