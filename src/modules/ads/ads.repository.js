import { pool } from "../../infrastructure/database/db.js";
import { buildAdsSearchQuery } from "./filters/ads-filter.builder.js";

export async function searchAds(filters = {}) {
  const query = buildAdsSearchQuery(filters);

  const [dataResult, countResult] = await Promise.all([
    pool.query(query.dataQuery, query.params),
    pool.query(query.countQuery, query.countParams),
  ]);

  return {
    data: dataResult.rows,
    total: Number(countResult.rows[0]?.total || 0),
    page: query.pagination.page,
    limit: query.pagination.limit,
  };
}

export async function findAdByIdentifier(identifier) {
  const isNumber = !Number.isNaN(Number(identifier));

  const result = await pool.query(
    isNumber
      ? `SELECT a.*, c.slug AS city_slug
         FROM ads a
         LEFT JOIN cities c ON c.id = a.city_id
         WHERE a.id = $1 AND a.status = 'active'`
      : `SELECT a.*, c.slug AS city_slug
         FROM ads a
         LEFT JOIN cities c ON c.id = a.city_id
         WHERE a.slug = $1 AND a.status = 'active'`,
    [identifier]
  );

  return result.rows[0] || null;
}

export async function findAdvertiserByUserId(userId) {
  const result = await pool.query(
    `SELECT id, user_id, city_id FROM advertisers WHERE user_id = $1 LIMIT 1`,
    [userId]
  );

  return result.rows[0] || null;
}

export async function insertAd(payload) {
  const result = await pool.query(
    `
    INSERT INTO ads
    (
      advertiser_id,
      title,
      description,
      price,
      city_id,
      city,
      state,
      category,
      brand,
      model,
      year,
      mileage,
      body_type,
      fuel_type,
      plan,
      slug,
      status,
      created_at,
      updated_at
    )
    VALUES
    ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'active',NOW(),NOW())
    RETURNING *
    `,
    [
      payload.advertiser_id,
      payload.title,
      payload.description || null,
      payload.price,
      payload.city_id,
      payload.city,
      payload.state,
      payload.category || null,
      payload.brand,
      payload.model,
      payload.year,
      payload.mileage,
      payload.body_type || null,
      payload.fuel_type || null,
      payload.plan || null,
      payload.slug,
    ]
  );

  return result.rows[0];
}

export async function updateAdById(id, payload) {
  const allowedFields = [
    "title",
    "description",
    "price",
    "city_id",
    "city",
    "state",
    "category",
    "brand",
    "model",
    "year",
    "mileage",
    "body_type",
    "fuel_type",
    "below_fipe",
    "priority",
    "highlight_until",
    "status",
  ];

  const entries = Object.entries(payload).filter(
    ([key, value]) => allowedFields.includes(key) && value !== undefined
  );

  if (!entries.length) {
    const current = await pool.query(`SELECT * FROM ads WHERE id = $1 LIMIT 1`, [id]);
    return current.rows[0] || null;
  }

  const sets = [];
  const values = [];
  let i = 1;

  for (const [key, value] of entries) {
    sets.push(`${key} = $${i++}`);
    values.push(value);
  }

  values.push(id);

  const result = await pool.query(
    `
    UPDATE ads
    SET ${sets.join(", ")}, updated_at = NOW()
    WHERE id = $${i}
    RETURNING *
    `,
    values
  );

  return result.rows[0] || null;
}

export async function softDeleteAdById(id) {
  const result = await pool.query(
    `
    UPDATE ads
    SET status = 'deleted', updated_at = NOW()
    WHERE id = $1
    RETURNING *
    `,
    [id]
  );

  return result.rows[0] || null;
}

export async function findOwnedAdById(id, userId) {
  const result = await pool.query(
    `
    SELECT a.*
    FROM ads a
    JOIN advertisers adv ON adv.id = a.advertiser_id
    WHERE a.id = $1
      AND adv.user_id = $2
    LIMIT 1
    `,
    [id, userId]
  );

  return result.rows[0] || null;
}
