import * as sitemapRepository from "./sitemap.repository.js";

function resolveChangeFreq(stage, moneyPage) {
  if (moneyPage && stage === "dominance") return "daily";
  if (moneyPage) return "weekly";
  if (stage === "dominance") return "daily";
  if (stage === "expansion") return "weekly";
  if (stage === "seed") return "weekly";
  return "monthly";
}

function resolvePriority(score, moneyPage) {
  if (moneyPage && score >= 90) return "1.0";
  if (score >= 90) return "0.9";
  if (score >= 70) return "0.8";
  if (score >= 50) return "0.7";
  return "0.6";
}

export async function buildTerritorialSitemap(limit = 50000) {
  const entries = await sitemapRepository.listSitemapEntries(limit);

  return entries.map((entry) => ({
    loc: entry.path,
    lastmod: entry.updated_at,
    changefreq: resolveChangeFreq(entry.stage, entry.money_page),
    priority: resolvePriority(Number(entry.priority || 0), entry.money_page),
    clusterType: entry.cluster_type,
  }));
}
