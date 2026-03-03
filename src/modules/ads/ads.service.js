import { pool } from "../../infrastructure/database/db.js";
import { AppError } from "../../shared/middlewares/error.middleware.js";
import { slugify } from "../../shared/utils/slugify.js";

/* =====================================================
   LISTAGEM PADRÃO
===================================================== */

export async function list(filters = {}) {
  return search(filters);
}

/* =====================================================
   BUSCA ROBUSTA COM FULL TEXT + PAGINAÇÃO
===================================================== */

export async function search(filters = {}) {
  const {
    q,
    city_id,
    brand,
    min_price,
    max_price,
    page = 1,
    limit = 20
  } = filters;

  const offset = (page - 1) * limit;
  let where = ["status = 'active'"];
  let params = [];
  let index = 1;

  if (q) {
    where.push(`search_vector @@ plainto_tsquery('portuguese', $${index++})`);
    params.push(q);
  }

  if (city_id) {
    where.push(`city_id = $${index++}`);
    params.push(city_id);
  }

  if (brand) {
    where.push(`brand ILIKE $${index++}`);
    params.push(`%${brand}%`);
  }

  if (min_price) {
    where.push(`price >= $${index++}`);
    params.push(min_price);
  }

  if (max_price) {
    where.push(`price <= $${index++}`);
    params.push(max_price);
  }

  const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const query = `
    SELECT *,
      ts_rank(search_vector, plainto_tsquery('portuguese', $1)) AS rank
    FROM ads
    ${whereClause}
    ORDER BY
      (highlight_until > NOW()) DESC,
      rank DESC,
      created_at DESC
    LIMIT $${index++}
    OFFSET $${index}
  `;

  params.push(limit);
  params.push(offset);

  const result = await pool.query(query, params);

  const countResult = await pool.query(
    `SELECT COUNT(*) FROM ads ${whereClause}`,
    params.slice(0, index - 2)
  );

  return {
    data: result.rows,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total: Number(countResult.rows[0].count),
      totalPages: Math.ceil(countResult.rows[0].count / limit)
    }
  };
}

/* =====================================================
   DETALHE POR ID OU SLUG
===================================================== */

export async function show(identifier) {
  const isNumber = !isNaN(identifier);

  const result = await pool.query(
    isNumber
      ? `SELECT * FROM ads WHERE id = $1 AND status='active'`
      : `SELECT * FROM ads WHERE slug = $1 AND status='active'`,
    [identifier]
  );

  if (!result.rows.length) {
    throw new AppError("Anúncio não encontrado", 404);
  }

  return result.rows[0];
}

/* =====================================================
   CRIAR ANÚNCIO COM SLUG
===================================================== */

export async function create(data, user) {
  const advertiserResult = await pool.query(
    `SELECT id FROM advertisers WHERE user_id = $1`,
    [user.id]
  );

  if (!advertiserResult.rows.length) {
    throw new AppError("Advertiser não encontrado", 400);
  }

  const advertiser_id = advertiserResult.rows[0].id;

  const baseSlug = slugify(
    `${data.brand}-${data.model}-${data.year}-${Date.now()}`
  );

  const result = await pool.query(
    `
    INSERT INTO ads
    (
      advertiser_id,
      title,
      price,
      city_id,
      city,
      state,
      brand,
      model,
      year,
      mileage,
      plan,
      slug
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    RETURNING *
    `,
    [
      advertiser_id,
      data.title,
      data.price,
      data.city_id,
      data.city,
      data.state,
      data.brand,
      data.model,
      data.year,
      data.mileage,
      user.plan,
      baseSlug
    ]
  );

  return result.rows[0];
}
