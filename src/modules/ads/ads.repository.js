// src/modules/ads/ads.repository.js

import db from "../../infrastructure/database/db.js";

/**
 * Cria novo anúncio
 */
export async function createAd(data) {
  const query = `
    INSERT INTO ads (
      title,
      description,
      price,
      city_id,
      advertiser_id,
      category,
      brand,
      model,
      year,
      mileage,
      status,
      highlight,
      created_at,
      updated_at
    )
    VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW(),NOW()
    )
    RETURNING *;
  `;

  const values = [
    data.title,
    data.description,
    data.price,
    data.city_id,
    data.advertiser_id,
    data.category,
    data.brand,
    data.model,
    data.year,
    data.mileage,
    data.status || "active",
    data.highlight || false,
  ];

  const { rows } = await db.query(query, values);
  return rows[0];
}

/**
 * Buscar anúncio por ID
 */
export async function findById(id) {
  const { rows } = await db.query(
    `SELECT * FROM ads WHERE id = $1 AND status != 'deleted'`,
    [id]
  );

  return rows[0] || null;
}

/**
 * Listagem paginada com filtros
 */
export async function listAds({
  page = 1,
  limit = 20,
  city_id,
  category,
  min_price,
  max_price,
  brand,
  model,
  highlight,
  orderBy = "created_at",
  orderDirection = "DESC"
}) {
  const offset = (page - 1) * limit;

  let whereClauses = ["status = 'active'"];
  let values = [];
  let index = 1;

  if (city_id) {
    whereClauses.push(`city_id = $${index++}`);
    values.push(city_id);
  }

  if (category) {
    whereClauses.push(`category = $${index++}`);
    values.push(category);
  }

  if (brand) {
    whereClauses.push(`brand ILIKE $${index++}`);
    values.push(`%${brand}%`);
  }

  if (model) {
    whereClauses.push(`model ILIKE $${index++}`);
    values.push(`%${model}%`);
  }

  if (min_price) {
    whereClauses.push(`price >= $${index++}`);
    values.push(min_price);
  }

  if (max_price) {
    whereClauses.push(`price <= $${index++}`);
    values.push(max_price);
  }

  if (highlight !== undefined) {
    whereClauses.push(`highlight = $${index++}`);
    values.push(highlight);
  }

  const where = whereClauses.length
    ? `WHERE ${whereClauses.join(" AND ")}`
    : "";

  const query = `
    SELECT *
    FROM ads
    ${where}
    ORDER BY ${orderBy} ${orderDirection}
    LIMIT $${index++}
    OFFSET $${index};
  `;

  values.push(limit);
  values.push(offset);

  const { rows } = await db.query(query, values);
  return rows;
}

/**
 * Contagem total para paginação
 */
export async function countAds(filters = {}) {
  let whereClauses = ["status = 'active'"];
  let values = [];
  let index = 1;

  if (filters.city_id) {
    whereClauses.push(`city_id = $${index++}`);
    values.push(filters.city_id);
  }

  if (filters.category) {
    whereClauses.push(`category = $${index++}`);
    values.push(filters.category);
  }

  const where = `WHERE ${whereClauses.join(" AND ")}`;

  const { rows } = await db.query(
    `SELECT COUNT(*) FROM ads ${where}`,
    values
  );

  return parseInt(rows[0].count, 10);
}

/**
 * Atualizar anúncio
 */
export async function updateAd(id, data) {
  const fields = [];
  const values = [];
  let index = 1;

  for (const key in data) {
    fields.push(`${key} = $${index++}`);
    values.push(data[key]);
  }

  if (!fields.length) return null;

  const query = `
    UPDATE ads
    SET ${fields.join(", ")},
        updated_at = NOW()
    WHERE id = $${index}
    RETURNING *;
  `;

  values.push(id);

  const { rows } = await db.query(query, values);
  return rows[0] || null;
}

/**
 * Soft delete
 */
export async function softDeleteAd(id) {
  const { rows } = await db.query(
    `
    UPDATE ads
    SET status = 'deleted',
        updated_at = NOW()
    WHERE id = $1
    RETURNING *;
    `,
    [id]
  );

  return rows[0] || null;
}

/**
 * Incrementar visualização (ranking futuro)
 */
export async function incrementViews(id) {
  await db.query(
    `
    UPDATE ads
    SET views = COALESCE(views, 0) + 1
    WHERE id = $1
    `,
    [id]
  );
}

/**
 * Buscar anúncios por advertiser
 */
export async function findByAdvertiser(advertiser_id) {
  const { rows } = await db.query(
    `
    SELECT *
    FROM ads
    WHERE advertiser_id = $1
    AND status != 'deleted'
    ORDER BY created_at DESC
    `,
    [advertiser_id]
  );

  return rows;
}
