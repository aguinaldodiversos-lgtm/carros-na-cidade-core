import { pool } from "../../infrastructure/database/db.js";

export async function getFacets(filters = {}) {
  const where = ["status='active'"];
  const params = [];
  let i = 1;

  if (filters.city_id) {
    where.push(`city_id=$${i++}`);
    params.push(filters.city_id);
  }

  const whereClause = `WHERE ${where.join(" AND ")}`;

  const result = await pool.query(
    `
    SELECT
      body_type,
      fuel_type,
      COUNT(*) as total
    FROM ads
    ${whereClause}
    GROUP BY body_type, fuel_type
    `,
    params
  );

  return result.rows;
}
