import { query } from "../../../infrastructure/database/db.js";

export async function getOverview() {
  const [ads, advertisers, users, cities] = await Promise.all([
    query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'active')::int AS active,
        COUNT(*) FILTER (WHERE status = 'paused')::int AS paused,
        COUNT(*) FILTER (WHERE status = 'deleted')::int AS deleted,
        COUNT(*) FILTER (WHERE status = 'blocked')::int AS blocked,
        COUNT(*) FILTER (WHERE highlight_until IS NOT NULL AND highlight_until > NOW() AND status = 'active')::int AS highlighted
      FROM ads
    `),
    query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'active')::int AS active,
        COUNT(*) FILTER (WHERE status = 'suspended')::int AS suspended,
        COUNT(*) FILTER (WHERE status = 'blocked')::int AS blocked
      FROM advertisers
    `),
    query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE role = 'admin')::int AS admins,
        COUNT(*) FILTER (WHERE role = 'user' OR role IS NULL)::int AS regular
      FROM users
    `),
    query(`SELECT COUNT(*)::int AS total FROM cities`),
  ]);

  return {
    ads: ads.rows[0],
    advertisers: advertisers.rows[0],
    users: users.rows[0],
    cities: { total: cities.rows[0]?.total || 0 },
  };
}

export async function getKpis({ periodDays = 30 } = {}) {
  const interval = `${periodDays} days`;

  const [newAds, newUsers, revenueData, topCities] = await Promise.all([
    query(
      `SELECT COUNT(*)::int AS count
       FROM ads
       WHERE created_at >= NOW() - $1::interval`,
      [interval]
    ),
    query(
      `SELECT COUNT(*)::int AS count
       FROM users
       WHERE created_at >= NOW() - $1::interval`,
      [interval]
    ),
    safePaymentQuery(interval),
    query(
      `SELECT c.name, c.state, COUNT(a.id)::int AS ads_count
       FROM cities c
       JOIN ads a ON a.city_id = c.id AND a.status = 'active'
       GROUP BY c.id
       ORDER BY ads_count DESC
       LIMIT 10`
    ),
  ]);

  return {
    period_days: periodDays,
    new_ads: newAds.rows[0]?.count || 0,
    new_users: newUsers.rows[0]?.count || 0,
    revenue: revenueData,
    top_cities: topCities.rows,
  };
}

async function safePaymentQuery(interval) {
  try {
    const result = await query(
      `SELECT
         COALESCE(SUM(amount) FILTER (WHERE status = 'approved'), 0)::numeric(12,2) AS total_approved,
         COUNT(*) FILTER (WHERE status = 'approved')::int AS approved_count,
         COALESCE(SUM(amount) FILTER (WHERE context = 'plan' AND status = 'approved'), 0)::numeric(12,2) AS plan_revenue,
         COALESCE(SUM(amount) FILTER (WHERE context = 'boost' AND status = 'approved'), 0)::numeric(12,2) AS boost_revenue
       FROM payment_intents
       WHERE created_at >= NOW() - $1::interval`,
      [interval]
    );
    return result.rows[0];
  } catch {
    return {
      total_approved: 0,
      approved_count: 0,
      plan_revenue: 0,
      boost_revenue: 0,
      _warning: "payment_intents not available",
    };
  }
}
