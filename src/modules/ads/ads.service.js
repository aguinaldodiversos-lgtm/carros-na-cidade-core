import { pool } from "../../infrastructure/database/db.js";
import { AppError } from "../../shared/middlewares/error.middleware.js";

/* =========================================
   CALCULO DE RANKING PROFISSIONAL
========================================= */

function calculateRanking(ad) {
  let score = 1;

  // prioridade manual
  score += ad.priority || 1;

  // plano
  if (ad.plan === "pro") score += 5;
  if (ad.plan === "start") score += 3;

  // destaque ativo
  if (ad.highlight_until && new Date(ad.highlight_until) > new Date()) {
    score += 8;
  }

  // abaixo da FIPE
  if (ad.below_fipe) score += 4;

  return score;
}

/* =========================================
   LISTAR ANÚNCIOS
========================================= */

export async function list(filters = {}) {
  const { city_id, brand, min_price, max_price } = filters;

  let query = `
    SELECT *
    FROM ads
    WHERE status = 'active'
  `;

  const params = [];
  let index = 1;

  if (city_id) {
    query += ` AND city_id = $${index++}`;
    params.push(city_id);
  }

  if (brand) {
    query += ` AND brand ILIKE $${index++}`;
    params.push(`%${brand}%`);
  }

  if (min_price) {
    query += ` AND price >= $${index++}`;
    params.push(min_price);
  }

  if (max_price) {
    query += ` AND price <= $${index++}`;
    params.push(max_price);
  }

  query += `
    ORDER BY
      (CASE
        WHEN highlight_until > NOW() THEN 1
        ELSE 0
      END) DESC,
      priority DESC,
      created_at DESC
    LIMIT 50
  `;

  const result = await pool.query(query, params);
  return result.rows;
}

/* =========================================
   DETALHE DO ANÚNCIO
========================================= */

export async function show(id) {
  const result = await pool.query(
    `SELECT * FROM ads WHERE id = $1 AND status = 'active'`,
    [id]
  );

  if (!result.rows.length) {
    throw new AppError("Anúncio não encontrado", 404);
  }

  return result.rows[0];
}

/* =========================================
   CRIAR ANÚNCIO
========================================= */

export async function create(data, user) {
  const advertiserResult = await pool.query(
    `SELECT id FROM advertisers WHERE user_id = $1`,
    [user.id]
  );

  if (!advertiserResult.rows.length) {
    throw new AppError("Advertiser não encontrado", 400);
  }

  const advertiser_id = advertiserResult.rows[0].id;

  const result = await pool.query(
    `
    INSERT INTO ads
    (advertiser_id, title, price, city_id, brand, model, year, mileage, plan)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    RETURNING *
    `,
    [
      advertiser_id,
      data.title,
      data.price,
      data.city_id,
      data.brand,
      data.model,
      data.year,
      data.mileage,
      user.plan
    ]
  );

  return result.rows[0];
}
