import { pool } from "../../../infrastructure/database/db.js";

export async function ensureCityLandingRecord(city) {
  const result = await pool.query(
    `
    INSERT INTO blog_posts (
      title,
      content,
      city,
      slug,
      status,
      created_at,
      updated_at
    )
    VALUES ($1, $2, $3, $4, 'published', NOW(), NOW())
    ON CONFLICT (slug)
    DO UPDATE SET
      title = EXCLUDED.title,
      updated_at = NOW()
    RETURNING *
    `,
    [
      `Carros em ${city.name}`,
      `Página local de veículos em ${city.name}.`,
      city.name,
      `carros-em-${city.slug}`,
    ]
  );

  return result.rows[0];
}

export async function findCityPage(cityName, slug) {
  const result = await pool.query(
    `
    SELECT *
    FROM blog_posts
    WHERE city = $1
      AND slug = $2
    LIMIT 1
    `,
    [cityName, slug]
  );

  return result.rows[0] || null;
}

export async function listTopCityPages(limit = 100) {
  const safeLimit = Math.min(500, Math.max(1, Number(limit) || 100));

  const result = await pool.query(
    `
    SELECT *
    FROM blog_posts
    WHERE status = 'published'
      AND city IS NOT NULL
    ORDER BY updated_at DESC, created_at DESC
    LIMIT $1
    `,
    [safeLimit]
  );

  return result.rows;
}
