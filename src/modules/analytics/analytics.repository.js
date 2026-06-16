import { pool, query } from "../../infrastructure/database/db.js";
import { VIEW_EVENT_TYPES } from "./analytics.constants.js";

/**
 * Acesso a `analytics_events` (Fase 4.4). INSERT do coletor público +
 * agregações read-only para o dashboard admin.
 *
 * As agregações degradam para vazio/zero em erro (try/catch) — analytics
 * nunca deve derrubar o painel. Janela temporal por `make_interval(days=>$n)`.
 */

const VIEW_TYPES = [...VIEW_EVENT_TYPES];

const INSERT_COLS = [
  "event_type",
  "path",
  "canonical_path",
  "entity_type",
  "entity_id",
  "city_slug",
  "city_name",
  "state",
  "region_slug",
  "ad_id",
  "blog_post_id",
  "referrer",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "device_type",
  "user_agent_hash",
  "session_id",
];

/** INSERT de um evento. Best-effort: erros propagam para o controller logar. */
export async function insertEvent(row) {
  const values = INSERT_COLS.map((c) => row[c] ?? null);
  const placeholders = INSERT_COLS.map((_, i) => `$${i + 1}`).join(", ");
  await pool.query(
    `INSERT INTO analytics_events (${INSERT_COLS.join(", ")}) VALUES (${placeholders})`,
    values
  );
}

/**
 * Monta um fragmento WHERE com filtros opcionais (state, city_slug) a partir
 * do índice de parâmetro corrente. Retorna { sql, params }.
 */
function buildFilters({ state, citySlug } = {}, startIndex = 2) {
  const clauses = [];
  const params = [];
  let i = startIndex;
  if (state) {
    clauses.push(`state = $${i++}`);
    params.push(String(state).toUpperCase());
  }
  if (citySlug) {
    clauses.push(`city_slug = $${i++}`);
    params.push(String(citySlug));
  }
  return { sql: clauses.length ? ` AND ${clauses.join(" AND ")}` : "", params, nextIndex: i };
}

/** Cards de topo: visitantes/views (hoje/7d/30d) + cliques comerciais (30d). */
export async function getTotals() {
  try {
    const { rows } = await query(
      `SELECT
         COUNT(DISTINCT session_id) FILTER (WHERE occurred_at >= date_trunc('day', NOW())) AS visitors_today,
         COUNT(*) FILTER (WHERE event_type = ANY($1) AND occurred_at >= date_trunc('day', NOW())) AS views_today,
         COUNT(DISTINCT session_id) FILTER (WHERE occurred_at >= NOW() - INTERVAL '7 days') AS visitors_7d,
         COUNT(*) FILTER (WHERE event_type = ANY($1) AND occurred_at >= NOW() - INTERVAL '7 days') AS views_7d,
         COUNT(DISTINCT session_id) FILTER (WHERE occurred_at >= NOW() - INTERVAL '30 days') AS visitors_30d,
         COUNT(*) FILTER (WHERE event_type = ANY($1) AND occurred_at >= NOW() - INTERVAL '30 days') AS views_30d,
         COUNT(*) FILTER (WHERE event_type = 'whatsapp_click' AND occurred_at >= NOW() - INTERVAL '30 days') AS whatsapp_30d,
         COUNT(*) FILTER (WHERE event_type = 'phone_click' AND occurred_at >= NOW() - INTERVAL '30 days') AS phone_30d,
         COUNT(*) FILTER (WHERE event_type = 'finance_click' AND occurred_at >= NOW() - INTERVAL '30 days') AS finance_30d
       FROM analytics_events
       WHERE occurred_at >= NOW() - INTERVAL '30 days'`,
      [VIEW_TYPES]
    );
    const r = rows[0] || {};
    const num = (v) => Number(v) || 0;
    return {
      visitorsToday: num(r.visitors_today),
      viewsToday: num(r.views_today),
      visitors7d: num(r.visitors_7d),
      views7d: num(r.views_7d),
      visitors30d: num(r.visitors_30d),
      views30d: num(r.views_30d),
      whatsappClicks30d: num(r.whatsapp_30d),
      phoneClicks30d: num(r.phone_30d),
      financeClicks30d: num(r.finance_30d),
    };
  } catch {
    return {
      visitorsToday: 0, viewsToday: 0, visitors7d: 0, views7d: 0,
      visitors30d: 0, views30d: 0, whatsappClicks30d: 0, phoneClicks30d: 0, financeClicks30d: 0,
    };
  }
}

/** Série diária (views + visitantes) na janela. */
export async function getTimeseries({ days, state, citySlug }) {
  try {
    const f = buildFilters({ state, citySlug }, 3);
    const { rows } = await query(
      `SELECT date_trunc('day', occurred_at)::date AS day,
         COUNT(*) FILTER (WHERE event_type = ANY($2)) AS views,
         COUNT(DISTINCT session_id) AS visitors
       FROM analytics_events
       WHERE occurred_at >= NOW() - make_interval(days => $1::int)${f.sql}
       GROUP BY day ORDER BY day ASC`,
      [days, VIEW_TYPES, ...f.params]
    );
    return rows.map((r) => ({
      day: r.day instanceof Date ? r.day.toISOString().slice(0, 10) : String(r.day),
      views: Number(r.views) || 0,
      visitors: Number(r.visitors) || 0,
    }));
  } catch {
    return [];
  }
}

async function topBy({ column, days, state, citySlug, limit, notNull = true }) {
  const f = buildFilters({ state, citySlug }, 4);
  const whereNotNull = notNull ? ` AND ${column} IS NOT NULL` : "";
  const { rows } = await query(
    `SELECT ${column} AS key,
       COUNT(*) FILTER (WHERE event_type = ANY($2)) AS views,
       COUNT(DISTINCT session_id) AS unique_sessions,
       COUNT(*) FILTER (WHERE event_type = 'whatsapp_click') AS whatsapp_clicks,
       COUNT(*) FILTER (WHERE event_type = 'phone_click') AS phone_clicks,
       COUNT(*) FILTER (WHERE event_type = 'finance_click') AS finance_clicks
     FROM analytics_events
     WHERE occurred_at >= NOW() - make_interval(days => $1::int)${whereNotNull}${f.sql}
     GROUP BY ${column}
     ORDER BY views DESC, unique_sessions DESC
     LIMIT $3`,
    [days, VIEW_TYPES, limit, ...f.params]
  );
  return rows;
}

export async function getTopCities({ days, state, citySlug, limit = 15 }) {
  try {
    const f = buildFilters({ state, citySlug }, 4);
    const { rows } = await query(
      `SELECT city_slug,
         MAX(city_name) AS city_name,
         MAX(state) AS state,
         COUNT(*) FILTER (WHERE event_type = ANY($2)) AS views,
         COUNT(DISTINCT session_id) AS unique_sessions,
         COUNT(*) FILTER (WHERE event_type = 'whatsapp_click') AS whatsapp_clicks,
         COUNT(*) FILTER (WHERE event_type = 'phone_click') AS phone_clicks,
         COUNT(*) FILTER (WHERE event_type = 'finance_click') AS finance_clicks
       FROM analytics_events
       WHERE city_slug IS NOT NULL AND occurred_at >= NOW() - make_interval(days => $1::int)${f.sql}
       GROUP BY city_slug ORDER BY views DESC LIMIT $3`,
      [days, VIEW_TYPES, limit, ...f.params]
    );
    return rows.map((r) => ({
      city_slug: r.city_slug,
      city_name: r.city_name,
      state: r.state,
      views: Number(r.views) || 0,
      unique_sessions: Number(r.unique_sessions) || 0,
      whatsapp_clicks: Number(r.whatsapp_clicks) || 0,
      phone_clicks: Number(r.phone_clicks) || 0,
      finance_clicks: Number(r.finance_clicks) || 0,
    }));
  } catch {
    return [];
  }
}

export async function getTopRegions({ days, state, limit = 15 }) {
  try {
    const rows = await topBy({ column: "region_slug", days, state, limit });
    return rows.map((r) => ({
      region_slug: r.key,
      views: Number(r.views) || 0,
      unique_sessions: Number(r.unique_sessions) || 0,
    }));
  } catch {
    return [];
  }
}

export async function getTopPages({ days, state, citySlug, limit = 15 }) {
  try {
    const rows = await topBy({ column: "path", days, state, citySlug, limit });
    return rows.map((r) => ({
      path: r.key,
      views: Number(r.views) || 0,
      unique_sessions: Number(r.unique_sessions) || 0,
    }));
  } catch {
    return [];
  }
}

export async function getTopAds({ days, state, citySlug, limit = 15 }) {
  try {
    const rows = await topBy({ column: "ad_id", days, state, citySlug, limit });
    return rows.map((r) => ({
      ad_id: Number(r.key),
      views: Number(r.views) || 0,
      unique_sessions: Number(r.unique_sessions) || 0,
      whatsapp_clicks: Number(r.whatsapp_clicks) || 0,
      phone_clicks: Number(r.phone_clicks) || 0,
    }));
  } catch {
    return [];
  }
}

export async function getTopBlogPosts({ days, limit = 15 }) {
  try {
    const rows = await topBy({ column: "blog_post_id", days, limit });
    return rows.map((r) => ({
      blog_post_id: Number(r.key),
      views: Number(r.views) || 0,
      unique_sessions: Number(r.unique_sessions) || 0,
    }));
  } catch {
    return [];
  }
}

/** Top origens de tráfego (referrer) e campanhas (utm_source/campaign). */
export async function getTrafficSources({ days, state, limit = 12 }) {
  try {
    // referrers usa $1=days, $2=VIEW_TYPES → filtros a partir de $3.
    const fRef = buildFilters({ state }, 3);
    const referrers = await query(
      `SELECT COALESCE(NULLIF(referrer, ''), 'direto') AS source, COUNT(*) AS total
       FROM analytics_events
       WHERE event_type = ANY($2) AND occurred_at >= NOW() - make_interval(days => $1::int)${fRef.sql}
       GROUP BY source ORDER BY total DESC LIMIT ${Number(limit)}`,
      [days, VIEW_TYPES, ...fRef.params]
    );
    // campaigns usa $1=days → filtros a partir de $2.
    const fCamp = buildFilters({ state }, 2);
    const campaigns = await query(
      `SELECT utm_source, utm_medium, utm_campaign, COUNT(*) AS total
       FROM analytics_events
       WHERE utm_source IS NOT NULL AND occurred_at >= NOW() - make_interval(days => $1::int)${fCamp.sql}
       GROUP BY utm_source, utm_medium, utm_campaign ORDER BY total DESC LIMIT ${Number(limit)}`,
      [days, ...fCamp.params]
    );
    return {
      referrers: referrers.rows.map((r) => ({ source: r.source, total: Number(r.total) || 0 })),
      campaigns: campaigns.rows.map((r) => ({
        utm_source: r.utm_source,
        utm_medium: r.utm_medium,
        utm_campaign: r.utm_campaign,
        total: Number(r.total) || 0,
      })),
    };
  } catch {
    return { referrers: [], campaigns: [] };
  }
}

/** Soma de eventos comerciais na janela. */
export async function getCommercialEvents({ days, state, citySlug }) {
  try {
    const f = buildFilters({ state, citySlug }, 2);
    const { rows } = await query(
      `SELECT event_type, COUNT(*) AS total
       FROM analytics_events
       WHERE event_type IN ('whatsapp_click','phone_click','finance_click','search_performed')
         AND occurred_at >= NOW() - make_interval(days => $1::int)${f.sql}
       GROUP BY event_type`,
      [days, ...f.params]
    );
    const out = { whatsapp_click: 0, phone_click: 0, finance_click: 0, search_performed: 0 };
    for (const r of rows) out[r.event_type] = Number(r.total) || 0;
    return out;
  } catch {
    return { whatsapp_click: 0, phone_click: 0, finance_click: 0, search_performed: 0 };
  }
}

/** Anúncios com muitas visualizações e poucos contatos (interesse sem conversão). */
export async function getLowContactAds({ days, minViews = 10, limit = 15 }) {
  try {
    const { rows } = await query(
      `SELECT ad_id,
         COUNT(*) FILTER (WHERE event_type = 'ad_view') AS views,
         COUNT(*) FILTER (WHERE event_type IN ('whatsapp_click','phone_click','finance_click')) AS contacts
       FROM analytics_events
       WHERE ad_id IS NOT NULL AND occurred_at >= NOW() - make_interval(days => $1::int)
       GROUP BY ad_id
       HAVING COUNT(*) FILTER (WHERE event_type = 'ad_view') >= $2
       ORDER BY (COUNT(*) FILTER (WHERE event_type IN ('whatsapp_click','phone_click','finance_click')))::float
                / NULLIF(COUNT(*) FILTER (WHERE event_type = 'ad_view'), 0) ASC,
                views DESC
       LIMIT $3`,
      [days, minViews, limit]
    );
    return rows.map((r) => ({
      ad_id: Number(r.ad_id),
      views: Number(r.views) || 0,
      contacts: Number(r.contacts) || 0,
    }));
  } catch {
    return [];
  }
}

/** Métricas de um anúncio (7d/30d + cliques) para o detalhe admin. */
export async function getAdMetrics(adId) {
  try {
    const { rows } = await query(
      `SELECT
         COUNT(*) FILTER (WHERE event_type = 'ad_view' AND occurred_at >= NOW() - INTERVAL '7 days') AS views_7d,
         COUNT(*) FILTER (WHERE event_type = 'ad_view' AND occurred_at >= NOW() - INTERVAL '30 days') AS views_30d,
         COUNT(*) FILTER (WHERE event_type = 'whatsapp_click' AND occurred_at >= NOW() - INTERVAL '30 days') AS whatsapp_30d,
         COUNT(*) FILTER (WHERE event_type = 'phone_click' AND occurred_at >= NOW() - INTERVAL '30 days') AS phone_30d,
         COUNT(*) FILTER (WHERE event_type = 'finance_click' AND occurred_at >= NOW() - INTERVAL '30 days') AS finance_30d
       FROM analytics_events
       WHERE ad_id = $1 AND occurred_at >= NOW() - INTERVAL '30 days'`,
      [adId]
    );
    const r = rows[0] || {};
    const num = (v) => Number(v) || 0;
    const views30d = num(r.views_30d);
    const contacts30d = num(r.whatsapp_30d) + num(r.phone_30d) + num(r.finance_30d);
    return {
      ad_id: adId,
      views_7d: num(r.views_7d),
      views_30d: views30d,
      whatsapp_clicks_30d: num(r.whatsapp_30d),
      phone_clicks_30d: num(r.phone_30d),
      finance_clicks_30d: num(r.finance_30d),
      contact_rate_30d: views30d > 0 ? Number((contacts30d / views30d).toFixed(4)) : 0,
    };
  } catch {
    return {
      ad_id: adId, views_7d: 0, views_30d: 0, whatsapp_clicks_30d: 0,
      phone_clicks_30d: 0, finance_clicks_30d: 0, contact_rate_30d: 0,
    };
  }
}

/** Métricas de um post do blog (views + origens) para o detalhe admin. */
export async function getPostMetrics(postId) {
  try {
    const totals = await query(
      `SELECT
         COUNT(*) FILTER (WHERE event_type = 'blog_view' AND occurred_at >= NOW() - INTERVAL '7 days') AS views_7d,
         COUNT(*) FILTER (WHERE event_type = 'blog_view' AND occurred_at >= NOW() - INTERVAL '30 days') AS views_30d,
         COUNT(DISTINCT session_id) FILTER (WHERE occurred_at >= NOW() - INTERVAL '30 days') AS unique_sessions_30d
       FROM analytics_events
       WHERE blog_post_id = $1 AND occurred_at >= NOW() - INTERVAL '30 days'`,
      [postId]
    );
    const sources = await query(
      `SELECT COALESCE(NULLIF(referrer, ''), 'direto') AS source, COUNT(*) AS total
       FROM analytics_events
       WHERE blog_post_id = $1 AND event_type = 'blog_view'
         AND occurred_at >= NOW() - INTERVAL '30 days'
       GROUP BY source ORDER BY total DESC LIMIT 8`,
      [postId]
    );
    const r = totals.rows[0] || {};
    const num = (v) => Number(v) || 0;
    return {
      blog_post_id: postId,
      views_7d: num(r.views_7d),
      views_30d: num(r.views_30d),
      unique_sessions_30d: num(r.unique_sessions_30d),
      traffic_sources: sources.rows.map((s) => ({ source: s.source, total: Number(s.total) || 0 })),
    };
  } catch {
    return { blog_post_id: postId, views_7d: 0, views_30d: 0, unique_sessions_30d: 0, traffic_sources: [] };
  }
}
