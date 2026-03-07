import { pool } from "../../infrastructure/database/db.js";

export async function listTopDealersByCitySlug(citySlug, limit = 20) {
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));

  const result = await pool.query(
    `
    SELECT
      adv.id,
      adv.user_id,
      adv.city_id,
      adv.name,
      adv.company_name,
      adv.phone,
      adv.whatsapp,
      adv.verified,
      c.slug AS city_slug,
      c.name AS city_name,
      COUNT(a.id)::int AS total_ads,
      COUNT(a.id) FILTER (
        WHERE a.status = 'active'
      )::int AS active_ads,
      COUNT(a.id) FILTER (
        WHERE a.status = 'active'
          AND a.highlight_until IS NOT NULL
          AND a.highlight_until > NOW()
      )::int AS highlight_ads
    FROM advertisers adv
    JOIN cities c ON c.id = adv.city_id
    LEFT JOIN ads a ON a.advertiser_id = adv.id
    WHERE c.slug = $1
    GROUP BY
      adv.id,
      adv.user_id,
      adv.city_id,
      adv.name,
      adv.company_name,
      adv.phone,
      adv.whatsapp,
      adv.verified,
      c.slug,
      c.name
    ORDER BY
      COUNT(a.id) FILTER (WHERE a.status = 'active') DESC,
      adv.verified DESC,
      adv.id ASC
    LIMIT $2
    `,
    [citySlug, safeLimit]
  );

  return result.rows;
}

export async function getDealerById(id) {
  const result = await pool.query(
    `
    SELECT
      adv.*,
      c.slug AS city_slug,
      c.name AS city_name,
      c.state AS city_state
    FROM advertisers adv
    LEFT JOIN cities c ON c.id = adv.city_id
    WHERE adv.id = $1
    LIMIT 1
    `,
    [id]
  );

  return result.rows[0] || null;
}

export async function listDealerAds(dealerId, limit = 24) {
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 24));

  const result = await pool.query(
    `
    SELECT
      a.id,
      a.title,
      a.price,
      a.city,
      a.state,
      a.brand,
      a.model,
      a.year,
      a.mileage,
      a.slug,
      a.plan,
      a.below_fipe,
      a.highlight_until,
      a.status,
      a.created_at
    FROM ads a
    WHERE a.advertiser_id = $1
      AND a.status = 'active'
    ORDER BY
      (CASE WHEN a.highlight_until > NOW() THEN 1 ELSE 0 END) DESC,
      a.priority DESC NULLS LAST,
      a.created_at DESC
    LIMIT $2
    `,
    [dealerId, safeLimit]
  );

  return result.rows;
}

export async function listDealersForAcquisition(cityId, limit = 50) {
  const safeLimit = Math.min(200, Math.max(1, Number(limit) || 50));

  const result = await pool.query(
    `
    SELECT
      adv.id,
      adv.user_id,
      adv.city_id,
      adv.name,
      adv.company_name,
      adv.phone,
      adv.whatsapp,
      adv.verified,
      COUNT(a.id)::int AS total_ads,
      COUNT(a.id) FILTER (
        WHERE a.status = 'active'
      )::int AS active_ads
    FROM advertisers adv
    LEFT JOIN ads a ON a.advertiser_id = adv.id
    WHERE adv.city_id = $1
    GROUP BY
      adv.id,
      adv.user_id,
      adv.city_id,
      adv.name,
      adv.company_name,
      adv.phone,
      adv.whatsapp,
      adv.verified
    ORDER BY
      COUNT(a.id) FILTER (WHERE a.status = 'active') ASC,
      adv.verified DESC,
      adv.id ASC
    LIMIT $2
    `,
    [cityId, safeLimit]
  );

  return result.rows;
}
