import { growthQueue } from "../../infrastructure/queue/growth.queue.js";
import { pool } from "../../infrastructure/database/db.js";

export async function evaluateCities() {
  const cities = await pool.query(`
    SELECT city_id, total_ads, conversion_rate
    FROM city_growth_metrics
  `);

  for (const city of cities.rows) {
    if (city.conversion_rate < 0.01 && city.total_ads > 10) {
      await growthQueue.add(
        "IMPROVE_SEO",
        { cityId: city.city_id },
        { priority: 2 }
      );
    }
  }

  console.log("🧠 Growth Brain enfileirou ações");
}
