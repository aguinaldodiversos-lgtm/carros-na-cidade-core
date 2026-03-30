import { pool } from "../infrastructure/database/db.js";

async function generateSeoLocal() {
  const cities = await pool.query(`
    SELECT city_id FROM city_dominance
    WHERE dominance_score > 50
  `);

  for (const row of cities.rows) {
    await pool.query(
      `
      INSERT INTO seo_pages (city_id, type, created_at)
      VALUES ($1,'city',NOW())
      ON CONFLICT DO NOTHING
    `,
      [row.city_id]
    );
  }
}

export function startSeoLocalWorker() {
  generateSeoLocal();
  setInterval(generateSeoLocal, 6 * 60 * 60 * 1000);
}
