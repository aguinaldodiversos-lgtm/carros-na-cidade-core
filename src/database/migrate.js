// src/database/migrate.js
import { pool } from "../infrastructure/database/db.js";
import { logger } from "../shared/logger.js";

async function runMigrations() {
  const client = await pool.connect();

  try {
    logger.info("🔧 Executando migrations AI Core...");

    await client.query("BEGIN");

    /* =====================================================
       1️⃣ EVENTOS BASE DA IA
    ===================================================== */
    await client.query(`
      CREATE TABLE IF NOT EXISTS ad_events (
        id SERIAL PRIMARY KEY,
        ad_id INTEGER NOT NULL REFERENCES ads(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        event_type VARCHAR(30) NOT NULL,
        ip_address TEXT,
        user_agent TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_ad_events_ad_id ON ad_events(ad_id);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_ad_events_type ON ad_events(event_type);
    `);

    /* =====================================================
       2️⃣ MATERIALIZED VIEW MÉTRICAS
    ===================================================== */

    await client.query(`
      CREATE MATERIALIZED VIEW IF NOT EXISTS ad_metrics AS
      SELECT
        ad_id,
        COUNT(*) FILTER (WHERE event_type='view') AS views,
        COUNT(*) FILTER (WHERE event_type='click') AS clicks,
        COUNT(*) FILTER (WHERE event_type='lead') AS leads,
        CASE
          WHEN COUNT(*) FILTER (WHERE event_type='view') > 0
          THEN (
            COUNT(*) FILTER (WHERE event_type='click')::float
            /
            COUNT(*) FILTER (WHERE event_type='view')
          )
          ELSE 0
        END AS ctr
      FROM ad_events
      GROUP BY ad_id;
    `);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS ad_metrics_ad_id_uq
      ON ad_metrics(ad_id);
    `);

    /* =====================================================
       3️⃣ CITY DOMINANCE
    ===================================================== */

    await client.query(`
      CREATE TABLE IF NOT EXISTS city_dominance (
        city_id INTEGER PRIMARY KEY REFERENCES cities(id),
        dominance_score NUMERIC DEFAULT 0,
        leads INTEGER DEFAULT 0,
        avg_ctr NUMERIC DEFAULT 0,
        total_ads INTEGER DEFAULT 0,
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    /* =====================================================
       4️⃣ LEARNING MODEL
    ===================================================== */

    await client.query(`
      CREATE TABLE IF NOT EXISTS learning_model (
        city_id INTEGER REFERENCES cities(id),
        model TEXT NOT NULL,
        avg_ctr NUMERIC DEFAULT 0,
        leads INTEGER DEFAULT 0,
        updated_at TIMESTAMP DEFAULT NOW(),
        PRIMARY KEY (city_id, model)
      );
    `);

    /* =====================================================
       5️⃣ GROWTH JOBS
    ===================================================== */

    await client.query(`
      CREATE TABLE IF NOT EXISTS growth_jobs (
        id SERIAL PRIMARY KEY,
        job_type TEXT NOT NULL,
        payload JSONB NOT NULL DEFAULT '{}'::jsonb,
        priority INTEGER DEFAULT 3,
        status TEXT DEFAULT 'pending',
        attempts INTEGER DEFAULT 0,
        last_error TEXT,
        locked_at TIMESTAMP,
        locked_by TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    /* =====================================================
       6️⃣ NOTIFICATION QUEUE (UPGRADE CONSENTIMENTO)
    ===================================================== */

    await client.query(`
      CREATE TABLE IF NOT EXISTS notification_queue (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        payload JSONB DEFAULT '{}'::jsonb,
        status TEXT DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT NOW(),
        sent_at TIMESTAMP
      );
    `);

    await client.query("COMMIT");

    logger.info("✅ AI Core migrations executadas com sucesso.");
  } catch (err) {
    await client.query("ROLLBACK");
    logger.error({
      message: "❌ Erro nas migrations AI Core",
      error: err.message,
    });
  } finally {
    client.release();
  }
}

export default runMigrations;
