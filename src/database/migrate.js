const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function runMigrations() {
  const client = await pool.connect();

  try {
    console.log("🔧 Rodando migrations...");

    // USERS
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name TEXT,
        email TEXT UNIQUE NOT NULL,
        password TEXT,
        google_id TEXT,
        reset_token TEXT,
        reset_token_expires TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // ADS
    await client.query(`
      CREATE TABLE IF NOT EXISTS ads (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        title TEXT,
        brand TEXT,
        model TEXT,
        year INTEGER,
        price NUMERIC,
        city TEXT,
        description TEXT,
        status TEXT DEFAULT 'active',
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // ALERTS
    await client.query(`
      CREATE TABLE IF NOT EXISTS alerts (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        city TEXT NOT NULL,
        brand TEXT,
        model TEXT,
        price_max NUMERIC,
        year_min INTEGER,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // PAYMENTS (opcional)
    await client.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        ad_id INTEGER REFERENCES ads(id) ON DELETE CASCADE,
        amount NUMERIC,
        status TEXT,
        mp_payment_id TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    console.log("✅ Migrations concluídas com sucesso.");
  } catch (err) {
    console.error("❌ Erro nas migrations:", err);
  } finally {
    client.release();
  }
}

module.exports = runMigrations;
