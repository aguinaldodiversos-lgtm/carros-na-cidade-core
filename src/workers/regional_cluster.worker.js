require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function getHubCities() {
  const result = await pool.query(`
    SELECT
      c.id AS city_id,
      COUNT(dl.id) AS converted
    FROM cities c
    JOIN dealer_leads dl ON dl.city_id = c.id
    WHERE dl.converted = true
    GROUP BY c.id
    HAVING COUNT(dl.id) >= 5
    LIMIT 20
  `);

  return result.rows;
}

async function getNearbyCities(cityId) {
  // versão simples: pegar cidades do mesmo estado
  const result = await pool.query(
    `
    SELECT c2.id
    FROM cities c1
    JOIN cities c2
      ON c1.state = c2.state
    WHERE c1.id = $1
      AND c2.id != $1
    LIMIT 5
  `,
    [cityId]
  );

  return result.rows;
}

async function activateCluster(hubCityId, targetCityId) {
  await pool.query(
    `
    INSERT INTO city_clusters (
      hub_city_id,
      target_city_id,
      activated
    )
    VALUES ($1,$2,true)
    ON CONFLICT DO NOTHING
  `,
    [hubCityId, targetCityId]
  );

  // ativar autopilot na cidade
  await pool.query(
    `
    INSERT INTO city_expansion_state (
      city_id,
      effort_level,
      status,
      last_evaluated_at
    )
    VALUES ($1,'medium','active',NOW())
    ON CONFLICT (city_id)
    DO UPDATE SET
      status = 'active',
      effort_level = 'medium',
      last_evaluated_at = NOW()
  `,
    [targetCityId]
  );

  console.log(
    `📍 Expansão ativada: ${hubCityId} → ${targetCityId}`
  );
}

async function runRegionalCluster() {
  try {
    console.log("🧭 Rodando Regional Cluster Engine...");

    const hubs = await getHubCities();

    for (const hub of hubs) {
      const nearby = await getNearbyCities(hub.city_id);

      for (const city of nearby) {
        await activateCluster(hub.city_id, city.id);
      }
    }

    console.log("✅ Cluster engine finalizado");
  } catch (err) {
    console.error("❌ Erro no cluster engine:", err);
  }
}

function startRegionalClusterWorker() {
  setInterval(runRegionalCluster, 12 * 60 * 60 * 1000);
  runRegionalCluster();
}

module.exports = { startRegionalClusterWorker };
