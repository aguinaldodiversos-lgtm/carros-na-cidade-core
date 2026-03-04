// src/database/migrate.js
import { pool } from "../infrastructure/database/db.js";
import { logger } from "../shared/logger.js";

async function runMigrations() {
  let client;

  try {
    client = await pool.connect();
    logger.info("🔧 Executando migrations AI Core...");

    await client.query("BEGIN");

    /* =====================================================
       0️⃣ BASE TABLES (garantia para FK / dependências)
    ===================================================== */

    // USERS (mínimo necessário)
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

    // ADS (mínimo necessário)
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

    // CITIES (necessário para city_dominance / learning_model)
    await client.query(`
      CREATE TABLE IF NOT EXISTS cities (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        state CHAR(2),
        slug TEXT UNIQUE,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_cities_slug ON cities(slug);
    `);

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

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_ad_events_created_at ON ad_events(created_at);
    `);

    /* =====================================================
       2️⃣ MATERIALIZED VIEW MÉTRICAS (idempotente)
       - CREATE MATERIALIZED VIEW IF NOT EXISTS pode falhar dependendo da versão
       - então usamos DO $$ ... $$ para garantir compatibilidade
    ===================================================== */

    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_matviews WHERE matviewname = 'ad_metrics'
        ) THEN
          CREATE MATERIALIZED VIEW ad_metrics AS
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
        END IF;
      END $$;
    `);

    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_indexes
          WHERE schemaname = 'public'
            AND indexname = 'ad_metrics_ad_id_uq'
        ) THEN
          CREATE UNIQUE INDEX ad_metrics_ad_id_uq
          ON ad_metrics(ad_id);
        END IF;
      END $$;
    `);

    /* =====================================================
       3️⃣ CITY DOMINANCE
    ===================================================== */
    await client.query(`
      CREATE TABLE IF NOT EXISTS city_dominance (
        city_id INTEGER PRIMARY KEY REFERENCES cities(id) ON DELETE CASCADE,
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
        city_id INTEGER REFERENCES cities(id) ON DELETE CASCADE,
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

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_growth_jobs_status_priority
      ON growth_jobs(status, priority);
    `);

    /* =====================================================
       6️⃣ NOTIFICATION QUEUE (CONSENTIMENTO / ALERTAS)
       - user_id pode ser opcional em leads anônimos no futuro, mas mantive seu desenho.
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

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_notification_queue_status
      ON notification_queue(status);
    `);

    await client.query("COMMIT");
    logger.info("✅ AI Core migrations executadas com sucesso.");
  } catch (err) {
    try {
      if (client) await client.query("ROLLBACK");
    } catch {}

    logger.error({
      message: "❌ Erro nas migrations AI Core",
      error: err?.message || String(err),
    });

    // IMPORTANT: falha o boot para não subir API com banco inconsistente
    throw err;
  } finally {
    if (client) client.release();
  }
}

export default runMigrations;
