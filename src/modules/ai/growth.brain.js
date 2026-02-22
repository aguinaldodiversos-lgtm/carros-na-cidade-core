import { pool } from "../../infrastructure/database/db.js";

export async function evaluateCities() {
  const cities = await pool.query(`
    SELECT c.id, cg.*, ed.population, ed.vehicle_fleet
    FROM cities c
    JOIN city_growth_metrics cg ON c.id = cg.city_id
    LEFT JOIN city_demographics ed ON c.id = ed.city_id
  `);

  for (const city of cities.rows) {
    const {
      id: cityId,
      total_ads,
      conversion_rate,
      total_views,
      population,
      vehicle_fleet
    } = city;

    // 🔎 Regra 1 — Baixa conversão
    if (conversion_rate < 0.01 && total_ads > 10) {
      await createAction(cityId, "IMPROVE_SEO", 2);
    }

    // 🔎 Regra 2 — Alta população, poucos anúncios
    if (population && total_ads < 20) {
      await createAction(cityId, "ACQUIRE_DEALERS", 3);
    }

    // 🔎 Regra 3 — Alta frota, baixa view
    if (vehicle_fleet && total_views < 500) {
      await createAction(cityId, "RUN_PAID_CAMPAIGN", 2);
    }
  }

  console.log("🧠 Growth Brain executado");
}

async function createAction(cityId, type, priority) {
  await pool.query(
    `
    INSERT INTO growth_actions (city_id, action_type, priority, payload)
    VALUES ($1,$2,$3,$4)
    `,
    [cityId, type, priority, {}]
  );
}
