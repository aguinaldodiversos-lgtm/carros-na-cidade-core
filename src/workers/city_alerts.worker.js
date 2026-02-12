require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function createAlert(cityId, type, severity, message) {
  await pool.query(
    `
    INSERT INTO city_alerts (
      city_id,
      alert_type,
      severity,
      message
    )
    VALUES ($1,$2,$3,$4)
    ON CONFLICT DO NOTHING
  `,
    [cityId, type, severity, message]
  );
}

async function runCityAlerts() {
  try {
    console.log("🚨 Rodando City Alerts...");

    const cities = await pool.query(`
      SELECT
        css.city_id,
        css.city_type,
        css.status,
        css.growth_score,
        css.confidence_score,
        COUNT(dl.id) AS leads,
        SUM(CASE WHEN dl.converted THEN 1 ELSE 0 END) AS converted
      FROM city_strategy_state css
      LEFT JOIN dealer_leads dl
        ON dl.city_id = css.city_id
      GROUP BY
        css.city_id,
        css.city_type,
        css.status,
        css.growth_score,
        css.confidence_score
      LIMIT 200
    `);

    for (const city of cities.rows) {
      const leads = Number(city.leads || 0);
      const converted = Number(city.converted || 0);

      /* ========================================
         ALERTA 1: estratégica sem conversão
      ======================================== */
      if (
        city.city_type === "strategic" &&
        leads > 20 &&
        converted === 0
      ) {
        await createAlert(
          city.city_id,
          "no_conversion",
          "high",
          "Cidade estratégica com leads mas sem conversões."
        );
      }

      /* ========================================
         ALERTA 2: crescimento acelerado
      ======================================== */
      if (
        city.status === "scaling" &&
        city.growth_score > 120 &&
        city.confidence_score > 15
      ) {
        await createAlert(
          city.city_id,
          "fast_growth",
          "medium",
          "Cidade com crescimento acelerado."
        );
      }

      /* ========================================
         ALERTA 3: pronta para cluster
      ======================================== */
      if (city.status === "stable") {
        await createAlert(
          city.city_id,
          "cluster_ready",
          "low",
          "Cidade pronta para expansão regional."
        );
      }
    }

    console.log("✅ Alertas atualizados");
  } catch (err) {
    console.error("❌ Erro nos alertas:", err);
  }
}

function startCityAlertsWorker() {
  setInterval(runCityAlerts, 2 * 60 * 60 * 1000);
  runCityAlerts();
}

module.exports = { startCityAlertsWorker };
