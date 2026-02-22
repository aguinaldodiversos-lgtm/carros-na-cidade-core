// src/workers/cityGrowth.worker.js

import { pool } from "../infrastructure/database/db.js";

async function calculateCityMetrics() {
  const cities = await pool.query(`SELECT id FROM cities`);

  for (const city of cities.rows) {
    const cityId = city.id;

    const ads = await pool.query(
      `SELECT * FROM ads WHERE city_id = $1 AND status = 'active'`,
      [cityId]
    );

    const totalAds = ads.rows.length;

    const staleAds = ads.rows.filter(ad => {
      const created = new Date(ad.created_at);
      const diff = (Date.now() - created.getTime()) / (1000 * 60 * 60 * 24);
      return diff > 30;
    }).length;

    const analytics = await pool.query(
      `SELECT SUM(views) as views, SUM(leads) as leads
       FROM analytics WHERE city_id = $1`,
      [cityId]
    );

    const totalViews = parseInt(analytics.rows[0]?.views || 0);
    const totalLeads = parseInt(analytics.rows[0]?.leads || 0);

    const conversionRate =
      totalViews > 0 ? totalLeads / totalViews : 0;

    await pool.query(
      `
      INSERT INTO city_growth_metrics (
        city_id,
        total_ads,
        active_ads,
        stale_ads,
        total_views,
        total_leads,
        avg_views_per_ad,
        avg_leads_per_ad,
        conversion_rate,
        total_revenue,
        last_calculated
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
      ON CONFLICT (city_id)
      DO UPDATE SET
        total_ads = EXCLUDED.total_ads,
        active_ads = EXCLUDED.active_ads,
        stale_ads = EXCLUDED.stale_ads,
        total_views = EXCLUDED.total_views,
        total_leads = EXCLUDED.total_leads,
        avg_views_per_ad = EXCLUDED.avg_views_per_ad,
        avg_leads_per_ad = EXCLUDED.avg_leads_per_ad,
        conversion_rate = EXCLUDED.conversion_rate,
        total_revenue = EXCLUDED.total_revenue,
        last_calculated = NOW()
      `,
      [
        cityId,
        totalAds,
        totalAds,
        staleAds,
        totalViews,
        totalLeads,
        totalAds ? totalViews / totalAds : 0,
        totalAds ? totalLeads / totalAds : 0,
        conversionRate,
        0
      ]
    );
  }

  console.log("📊 City growth metrics atualizados");
}

export function startCityGrowthWorker() {
  setInterval(calculateCityMetrics, 10 * 60 * 1000);
}
