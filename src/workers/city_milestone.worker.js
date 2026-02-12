require("dotenv").config();
const { Pool } = require("pg");
const {
  calculateTargets,
  evaluateStatus,
} = require("../services/cityMilestone.service");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function runCityMilestones() {
  try {
    console.log("🎯 Rodando City Milestone Engine...");

    const cities = await pool.query(`
      SELECT id, name, population
      FROM cities
      LIMIT 200
    `);

    for (const city of cities.rows) {
      const targets = calculateTargets(city);

      const stats = await pool.query(
        `
        SELECT
          COUNT(DISTINCT dl.id) AS dealers,
          COUNT(DISTINCT a.id) AS ads
        FROM cities c
        LEFT JOIN dealer_leads dl
          ON dl.city_id = c.id
          AND dl.converted = true
        LEFT JOIN ads a
          ON a.city_id = c.id
        WHERE c.id = $1
      `,
        [city.id]
      );

      const dealers = Number(stats.rows[0].dealers || 0);
      const ads = Number(stats.rows[0].ads || 0);

      // tráfego placeholder (até integrar analytics real)
      const traffic = ads * 20;

      const status = evaluateStatus(
        { dealers, ads, traffic },
        targets
      );

      await pool.query(
        `
        INSERT INTO city_milestones (
          city_id,
          target_dealers,
          target_ads,
          target_traffic,
          current_dealers,
          current_ads,
          current_traffic,
          status,
          last_evaluated_at
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
        ON CONFLICT (city_id)
        DO UPDATE SET
          target_dealers = EXCLUDED.target_dealers,
          target_ads = EXCLUDED.target_ads,
          target_traffic = EXCLUDED.target_traffic,
          current_dealers = EXCLUDED.current_dealers,
          current_ads = EXCLUDED.current_ads,
          current_traffic = EXCLUDED.current_traffic,
          status = EXCLUDED.status,
          last_evaluated_at = NOW()
      `,
        [
          city.id,
          targets.dealers,
          targets.ads,
          targets.traffic,
          dealers,
          ads,
          traffic,
          status,
        ]
      );

      console.log(
        `Cidade ${city.name}: ${status} (${dealers} lojistas)`
      );
    }

    console.log("✅ City milestones atualizados");
  } catch (err) {
    console.error("❌ Erro no milestone engine:", err);
  }
}

function startCityMilestoneWorker() {
  setInterval(runCityMilestones, 4 * 60 * 60 * 1000);
  runCityMilestones();
}

module.exports = { startCityMilestoneWorker };
