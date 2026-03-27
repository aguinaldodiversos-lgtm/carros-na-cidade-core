import "dotenv/config";
import pg from "pg";

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

try {
  const result = await pool.query("SELECT COUNT(*)::int AS total FROM cities");
  console.log("TOTAL CITIES:", result.rows[0].total);
} catch (error) {
  console.error("COUNT FAIL:", error);
} finally {
  await pool.end();
}
