import "dotenv/config";
import pg from "pg";

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 1,
  connectionTimeoutMillis: 15000,
  idleTimeoutMillis: 10000,
  keepAlive: true,
});

try {
  const result = await pool.query("SELECT NOW() AS now");
  console.log("DB OK:", result.rows[0]);
} catch (error) {
  console.error("DB FAIL:", error);
} finally {
  await pool.end();
}
