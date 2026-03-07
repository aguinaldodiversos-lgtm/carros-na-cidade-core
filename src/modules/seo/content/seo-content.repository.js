import { pool } from "../../../infrastructure/database/db.js";

export async function blogPostExists({ city, brand, model }) {
  const result = await pool.query(
    `
    SELECT id
    FROM blog_posts
    WHERE city = $1
      AND brand = $2
      AND model = $3
    LIMIT 1
    `,
    [city, brand, model]
  );

  return result.rows.length > 0;
}

export async function createBlogPost({ title, content, city, brand, model, slug }) {
  const result = await pool.query(
    `
    INSERT INTO blog_posts
      (title, content, city, brand, model, slug, status, created_at, updated_at)
    VALUES
      ($1, $2, $3, $4, $5, $6, 'published', NOW(), NOW())
    RETURNING *
    `,
    [title, content, city, brand, model, slug]
  );

  return result.rows[0];
}

export async function listTopDemandModelsByCity(cityId, limit = 2) {
  const safeLimit = Math.min(20, Math.max(1, Number(limit) || 2));

  const result = await pool.query(
    `
    SELECT brand, model, COUNT(*) as total
    FROM alerts
    WHERE city_id = $1
      AND brand IS NOT NULL
      AND model IS NOT NULL
    GROUP BY brand, model
    ORDER BY total DESC
    LIMIT $2
    `,
    [cityId, safeLimit]
  );

  return result.rows;
}
