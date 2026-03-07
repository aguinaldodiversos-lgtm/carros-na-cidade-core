import { pool } from "../../../infrastructure/database/db.js";

export async function upsertSearchConsoleMetric({
  date,
  city,
  impressions,
  clicks,
  ctr,
  avg_position,
  source = "google",
}) {
  await pool.query(
    `
    INSERT INTO seo_city_metrics
      (date, city, impressions, clicks, ctr, avg_position, source, created_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
    ON CONFLICT (date, city)
    DO UPDATE SET
      impressions = EXCLUDED.impressions,
      clicks = EXCLUDED.clicks,
      ctr = EXCLUDED.ctr,
      avg_position = EXCLUDED.avg_position,
      source = EXCLUDED.source
    `,
    [date, city, impressions, clicks, ctr, avg_position, source]
  );
}

export async function upsertGa4Metric({
  date,
  city,
  sessions,
  users_count,
  conversions,
  source = "google",
}) {
  await pool.query(
    `
    INSERT INTO seo_city_metrics
      (date, city, sessions, users_count, conversions, source, created_at)
    VALUES ($1,$2,$3,$4,$5,$6,NOW())
    ON CONFLICT (date, city)
    DO UPDATE SET
      sessions = EXCLUDED.sessions,
      users_count = EXCLUDED.users_count,
      conversions = EXCLUDED.conversions,
      source = EXCLUDED.source
    `,
    [date, city, sessions, users_count, conversions, source]
  );
}
