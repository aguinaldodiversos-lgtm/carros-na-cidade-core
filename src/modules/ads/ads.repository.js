import db from "../../infrastructure/database/db.js";
import { normalizeAdVehicleFieldsForPersistence } from "./ads.storage-normalize.js";

const UPDATE_FIELDS = [
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
  "transmission",
  "below_fipe",
  "highlight_until",
  "plan",
  "status",
];

export async function createAd(data) {
  const row = normalizeAdVehicleFieldsForPersistence(data, { partial: false });

  const query = `
    INSERT INTO ads (
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
      transmission,
      below_fipe,
      status,
      plan,
      slug,
      created_at,
      updated_at
    )
    VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,NOW(),NOW()
    )
    RETURNING *;
  `;

  const values = [
    row.advertiser_id || null,
    row.title,
    row.description || null,
    row.price,
    row.city_id,
    row.city,
    row.state,
    row.category || null,
    row.brand,
    row.model,
    row.year,
    row.mileage ?? 0,
    row.body_type || null,
    row.fuel_type || null,
    row.transmission || null,
    Boolean(row.below_fipe),
    row.status || "active",
    row.plan || "free",
    row.slug,
  ];

  const { rows } = await db.query(query, values);
  return rows[0];
}

export async function findById(id) {
  const { rows } = await db.query(`SELECT * FROM ads WHERE id = $1 AND status != 'deleted'`, [id]);

  return rows[0] || null;
}

export async function findAdByIdentifier(identifier) {
  const isNumeric = /^\d+$/.test(String(identifier));

  const { rows } = await db.query(
    isNumeric
      ? `SELECT * FROM ads WHERE id = $1 AND status = 'active' LIMIT 1`
      : `SELECT * FROM ads WHERE slug = $1 AND status = 'active' LIMIT 1`,
    [identifier]
  );

  return rows[0] || null;
}

export async function findOwnerContextById(id) {
  const { rows } = await db.query(
    `
    SELECT
      a.id,
      a.advertiser_id,
      a.city_id,
      a.status,
      adv.user_id AS advertiser_user_id
    FROM ads a
    LEFT JOIN advertisers adv ON adv.id = a.advertiser_id
    WHERE a.id = $1
    LIMIT 1
    `,
    [id]
  );

  return rows[0] || null;
}

export async function updateAd(id, data) {
  const normalized = normalizeAdVehicleFieldsForPersistence(data, {
    partial: true,
  });

  const fields = [];
  const values = [];
  let index = 1;

  for (const field of UPDATE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(normalized, field)) {
      fields.push(`${field} = $${index++}`);
      values.push(normalized[field]);
    }
  }

  if (!fields.length) {
    return findById(id);
  }

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
