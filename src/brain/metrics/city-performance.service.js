import * as repository from "./city-performance.repository.js";

function computePerformanceScore(input) {
  const activeAds = Number(input.active_ads || 0);
  const leads = Number(input.leads || 0);
  const views = Number(input.views || 0);
  const clicks = Number(input.clicks || 0);
  const ctr = Number(input.ctr || 0);
  const seoPages = Number(input.seo_pages || 0);
  const indexablePages = Number(input.indexable_pages || 0);
  const organicSessions = Number(input.organic_sessions || 0);
  const conversions = Number(input.conversions || 0);

  return Number(
    (
      leads * 4 +
      clicks * 0.8 +
      views * 0.03 +
      ctr * 1200 +
      seoPages * 1.4 +
      indexablePages * 1.8 +
      organicSessions * 0.15 +
      conversions * 3 +
      activeAds * 0.5
    ).toFixed(4)
  );
}

export async function refreshCityPerformanceDaily() {
  const date = new Date().toISOString().slice(0, 10);
  const rows = await repository.listCityPerformanceInputs(6000);

  for (const row of rows) {
    const score = computePerformanceScore(row);

    await repository.upsertCityPerformanceDaily({
      cityId: row.city_id,
      date,
      activeAds: Number(row.active_ads || 0),
      leads: Number(row.leads || 0),
      views: Number(row.views || 0),
      clicks: Number(row.clicks || 0),
      ctr: Number(row.ctr || 0),
      seoPages: Number(row.seo_pages || 0),
      indexablePages: Number(row.indexable_pages || 0),
      organicSessions: Number(row.organic_sessions || 0),
      conversions: Number(row.conversions || 0),
      score,
    });

    await repository.updateCityScoreSnapshot({
      cityId: row.city_id,
      performanceScore: score,
      organicSessions7d: Number(row.organic_sessions || 0),
      leads7d: Number(row.leads || 0),
      indexedPages7d: Number(row.indexable_pages || 0),
      stage: row.stage || "discovery",
    });
  }

  return { total: rows.length };
}
