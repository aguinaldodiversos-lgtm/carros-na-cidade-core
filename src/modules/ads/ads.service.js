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
    model,
    min_price,
    max_price,
    below_fipe,
    body_type,
    fuel_type,
    year_min,
    year_max,
    page = 1,
    limit = 20,
  } = filters;

  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(50, Math.max(1, Number(limit) || 20));
  const offset = (safePage - 1) * safeLimit;

  const where = ["a.status = 'active'"];
  const params = [];
  let i = 1;

  // Full-text (quando q existe)
  let useTextRank = false;
  if (q && String(q).trim().length >= 2) {
    useTextRank = true;
    where.push(`a.search_vector @@ plainto_tsquery('portuguese', $${i++})`);
    params.push(String(q).trim());
  }

  if (city_id) { where.push(`a.city_id = $${i++}`); params.push(Number(city_id)); }
  if (brand)   { where.push(`a.brand ILIKE $${i++}`); params.push(`%${brand}%`); }
  if (model)   { where.push(`a.model ILIKE $${i++}`); params.push(`%${model}%`); }

  if (min_price) { where.push(`a.price >= $${i++}`); params.push(Number(min_price)); }
  if (max_price) { where.push(`a.price <= $${i++}`); params.push(Number(max_price)); }

  if (below_fipe !== undefined) {
    const bf = below_fipe === true || below_fipe === "true";
    where.push(`a.below_fipe = $${i++}`);
    params.push(bf);
  }

  if (body_type) { where.push(`a.body_type = $${i++}`); params.push(body_type); }
  if (fuel_type) { where.push(`a.fuel_type = $${i++}`); params.push(fuel_type); }

  if (year_min) { where.push(`a.year >= $${i++}`); params.push(Number(year_min)); }
  if (year_max) { where.push(`a.year <= $${i++}`); params.push(Number(year_max)); }

  const whereClause = `WHERE ${where.join(" AND ")}`;

  // SCORE híbrido:
  // - destaque ativo: +100
  // - prioridade: +priority*10
  // - ctr: +ctr*60
  // - leads: +leads*2
  // - recência (decay por dias): + 30 / (1 + ageDays)
  // - relevância textual (quando q): + ts_rank*50
  const query = `
    SELECT
      a.*,
      COALESCE(m.views, 0)  AS views,
      COALESCE(m.clicks, 0) AS clicks,
      COALESCE(m.leads, 0)  AS leads,
      COALESCE(m.ctr, 0)    AS ctr,
      ${
        useTextRank
          ? "ts_rank(a.search_vector, plainto_tsquery('portuguese', $1))"
          : "0"
      } AS text_rank,
      (
        (CASE WHEN a.highlight_until > NOW() THEN 100 ELSE 0 END)
        + (COALESCE(a.priority, 1) * 10)
        + (COALESCE(m.ctr, 0) * 60)
        + (COALESCE(m.leads, 0) * 2)
        + (30.0 / (1.0 + (EXTRACT(EPOCH FROM (NOW() - a.created_at)) / 86400.0)))
        + (${useTextRank ? "ts_rank(a.search_vector, plainto_tsquery('portuguese', $1)) * 50" : "0"})
      ) AS hybrid_score
    FROM ads a
    LEFT JOIN ad_metrics m ON m.ad_id = a.id
    ${whereClause}
    ORDER BY
      hybrid_score DESC,
      a.created_at DESC
    LIMIT $${i++}
    OFFSET $${i++}
  `;

  const dataParams = [...params, safeLimit, offset];

  const [dataResult, countResult] = await Promise.all([
    pool.query(query, dataParams),
    pool.query(`SELECT COUNT(*) FROM ads a ${whereClause}`, params),
  ]);

  const total = Number(countResult.rows[0].count || 0);

  return {
    data: dataResult.rows,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.max(1, Math.ceil(total / safeLimit)),
    },
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
