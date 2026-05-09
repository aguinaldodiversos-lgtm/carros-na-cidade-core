import db from "../../infrastructure/database/db.js";
import { normalizeAdVehicleFieldsForPersistence } from "./ads.storage-normalize.js";
import { AD_STATUS } from "./ads.canonical.constants.js";

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
  "images",
  "highlight_until",
  "plan",
  "status",
];

export async function createAd(data) {
  const row = normalizeAdVehicleFieldsForPersistence(data, { partial: false });

  const images =
    Array.isArray(row.images) && row.images.length > 0
      ? row.images.filter((u) => typeof u === "string" && u.trim())
      : [];

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
      images,
      status,
      plan,
      slug,
      search_vector,
      created_at,
      updated_at
    )
    VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb,$18,$19,$20,
      to_tsvector('portuguese',
        COALESCE($9,'') || ' ' || COALESCE($10,'') || ' ' || COALESCE($2,'') || ' ' || COALESCE($3,'')
      ),
      NOW(),NOW()
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
    JSON.stringify(images),
    row.status || AD_STATUS.ACTIVE,
    row.plan || "free",
    row.slug,
  ];

  const { rows } = await db.query(query, values);
  return rows[0];
}

export async function findById(id) {
  const { rows } = await db.query(
    `SELECT * FROM ads WHERE id = $1 AND status != $2`,
    [id, AD_STATUS.DELETED]
  );

  return rows[0] || null;
}

export async function findAdByIdentifier(identifier) {
  const isNumeric = /^\d+$/.test(String(identifier));

  // SELECT inclui:
  //   - dealership_id      → fonte canônica de "isto é loja" (advertiser
  //                          com company_name preenchido OU CNPJ
  //                          associado). Frontend NÃO infere mais por
  //                          nome do anunciante.
  //   - account_type       → users.document_type ('CPF'|'CNPJ') do
  //                          owner; usado pelo seller-type mapper único.
  //   - risk_reasons,
  //     reviewed_at,
  //     reviewed_by        → já em a.* (migration 025); permite o
  //                          frontend computar o selo "Anúncio
  //                          analisado" para below-fipe aprovado.
  const baseQuery = `
    SELECT
      a.*,
      c.slug AS city_slug,
      adv.id           AS dealership_id,
      adv.name         AS seller_name,
      adv.company_name AS dealership_name,
      adv.phone        AS seller_phone,
      u.document_type  AS account_type,
      COALESCE(adv.whatsapp, adv.mobile_phone, adv.phone) AS whatsapp_number
    FROM ads a
    LEFT JOIN cities c        ON c.id = a.city_id
    LEFT JOIN advertisers adv ON adv.id = a.advertiser_id
    LEFT JOIN users u         ON u.id = adv.user_id
    WHERE ${isNumeric ? "a.id = $1" : "a.slug = $1"}
      AND a.status = $2
    LIMIT 1
  `;

  const { rows } = await db.query(baseQuery, [identifier, AD_STATUS.ACTIVE]);
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
    SET status = $2,
        updated_at = NOW()
    WHERE id = $1
    RETURNING *;
    `,
    [id, AD_STATUS.DELETED]
  );

  return rows[0] || null;
}
