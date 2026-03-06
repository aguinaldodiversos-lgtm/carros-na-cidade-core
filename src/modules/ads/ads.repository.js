import { pool } from "../../infrastructure/database/db.js";

export async function searchAds(filters = {}) {
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

  const where = [`a.status = 'active'`];
  const params = [];
  let i = 1;
  let useTextRank = false;
  let queryParamIndex = null;

  if (q && String(q).trim().length >= 2) {
    useTextRank = true;
    queryParamIndex = i;
    where.push(`a.search_vector @@ plainto_tsquery('portuguese', $${i++})`);
    params.push(String(q).trim());
  }

  if (city_id) {
    where.push(`a.city_id = $${i++}`);
    params.push(Number(city_id));
  }

  if (brand) {
    where.push(`a.brand ILIKE $${i++}`);
    params.push(`%${brand}%`);
  }

  if (model) {
    where.push(`a.model ILIKE $${i++}`);
    params.push(`%${model}%`);
  }

  if (min_price) {
    where.push(`a.price >= $${i++}`);
    params.push(Number(min_price));
  }

  if (max_price) {
    where.push(`a.price <= $${i++}`);
    params.push(Number(max_price));
  }

  if (below_fipe !== undefined) {
    where.push(`a.below_fipe = $${i++}`);
    params.push(Boolean(below_fipe));
  }

  if (body_type) {
    where.push(`a.body_type = $${i++}`);
    params.push(body_type);
  }

  if (fuel_type) {
    where.push(`a.fuel_type = $${i++}`);
    params.push(fuel_type);
  }

  if (year_min) {
    where.push(`a.year >= $${i++}`);
    params.push(Number(year_min));
  }

  if (year_max) {
    where.push(`a.year <= $${i++}`);
    params.push(Number(year_max));
  }

  const whereClause = `WHERE ${where.join(" AND ")}`;

  const textRankExpr =
    useTextRank && queryParamIndex
      ? `ts_rank(a.search_vector, plainto_tsquery('portuguese', $${queryParamIndex}))`
      : "0";

  const query = `
    SELECT
      a.*,
      COALESCE(m.views, 0)  AS views,
      COALESCE(m.clicks, 0) AS clicks,
      COALESCE(m.leads, 0)  AS leads,
      COALESCE(m.ctr, 0)    AS ctr,
      ${textRankExpr} AS text_rank,
      (
        (CASE WHEN a.highlight_until > NOW() THEN 100 ELSE 0 END)
        + (COALESCE(a.priority, 1) * 10)
        + (COALESCE(m.ctr, 0) * 60)
        + (COALESCE(m.leads, 0) * 2)
        + (30.0 / (1.0 + (EXTRACT(EPOCH FROM (NOW() - a.created_at)) / 86400.0)))
        + (${useTextRank ? `${textRankExpr} * 50` : "0"})
      ) AS hybrid_score
    FROM ads a
    LEFT JOIN ad_metrics m ON m.ad_id = a.id
    ${whereClause}
    ORDER BY hybrid_score DESC, a.created_at DESC
    LIMIT $${i++}
    OFFSET $${i++}
  `;

  const dataParams = [...params, safeLimit, offset];

  const [dataResult, countResult] = await Promise.all([
    pool.query(query, dataParams),
    pool.query(`SELECT COUNT(*) FROM ads a ${whereClause}`, params),
  ]);

  return {
    data: dataResult.rows,
    total: Number(countResult.rows[0]?.count || 0),
    page: safePage,
    limit: safeLimit,
  };
}

export async function findAdByIdentifier(identifier) {
  const isNumber = !Number.isNaN(Number(identifier));

  const result = await pool.query(
    isNumber
      ? `SELECT * FROM ads WHERE id = $1 AND status = 'active'`
      : `SELECT * FROM ads WHERE slug = $1 AND status = 'active'`,
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
