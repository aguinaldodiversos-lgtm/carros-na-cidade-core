require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function registerAction(cityId, alertId, type, details) {
  await pool.query(
    `
    INSERT INTO alert_actions (
      city_id,
      alert_id,
      action_type,
      details
    )
    VALUES ($1,$2,$3,$4)
  `,
    [cityId, alertId, type, details]
  );
}

async function resolveAlert(alertId) {
  await pool.query(
    `
    UPDATE city_alerts
    SET resolved = true
    WHERE id = $1
  `,
    [alertId]
  );
}

async function handleNoConversion(alert) {
  // reduzir esforço da cidade
  await pool.query(
    `
    UPDATE city_strategy_state
    SET effort_level = 'low',
        status = 'declining'
    WHERE city_id = $1
  `,
    [alert.city_id]
  );

  await registerAction(
    alert.city_id,
    alert.id,
    "reduce_effort",
    "Cidade estratégica sem conversão. Esforço reduzido."
  );

  await resolveAlert(alert.id);
}

async function handleFastGrowth(alert) {
  // aumentar esforço
  await pool.query(
    `
    UPDATE city_strategy_state
    SET effort_level = 'aggressive',
        status = 'scaling'
    WHERE city_id = $1
  `,
    [alert.city_id]
  );

  await registerAction(
    alert.city_id,
    alert.id,
    "increase_effort",
    "Cidade com crescimento acelerado. Esforço aumentado."
  );

  await resolveAlert(alert.id);
}

async function handleClusterReady(alert) {
  // marcar cidade como pronta para cluster
  await pool.query(
    `
    UPDATE city_strategy_state
    SET status = 'stable'
    WHERE city_id = $1
  `,
    [alert.city_id]
  );

  await registerAction(
    alert.city_id,
    alert.id,
    "activate_cluster",
    "Cidade marcada para expansão regional."
  );

  await resolveAlert(alert.id);
}

async function runAlertActions() {
  try {
    console.log("⚙️ Rodando Alert Action Engine...");

    const alerts = await pool.query(`
      SELECT *
      FROM city_alerts
      WHERE resolved = false
      ORDER BY created_at ASC
      LIMIT 50
    `);

    for (const alert of alerts.rows) {
      if (alert.alert_type === "no_conversion") {
        await handleNoConversion(alert);
      }

      if (alert.alert_type === "fast_growth") {
        await handleFastGrowth(alert);
      }

      if (alert.alert_type === "cluster_ready") {
        await handleClusterReady(alert);
      }
    }

    console.log("✅ Alert actions finalizadas");
  } catch (err) {
    console.error("❌ Erro nas ações automáticas:", err);
  }
}

function startAlertActionWorker() {
  setInterval(runAlertActions, 60 * 60 * 1000);
  runAlertActions();
}

module.exports = { startAlertActionWorker };
