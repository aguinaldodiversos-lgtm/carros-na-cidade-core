import { AppError } from "../../shared/middlewares/error.middleware.js";
import * as cityPublicRepository from "./city-public.repository.js";

/* =====================================================
   HELPERS
===================================================== */

function buildCitySeoMeta(snapshot) {
  return {
    title: `Carros em ${snapshot.name}${snapshot.state ? ` - ${snapshot.state}` : ""} | Carros na Cidade`,
    description: `Veja ofertas de veículos em ${snapshot.name}${snapshot.state ? `, ${snapshot.state}` : ""}. Encontre carros, oportunidades abaixo da FIPE, anúncios em destaque e novidades da sua cidade.`,
    canonicalPath: `/cidade/${snapshot.slug}`,
    robots: "index,follow",
  };
}

function buildCityStats(snapshot) {
  return {
    demandScore: Number(snapshot.demand_score || 0),
    dominanceScore: Number(snapshot.dominance_score || 0),
    opportunityScore: Number(snapshot.opportunity_score || 0),
    predictionScore: Number(snapshot.prediction_score || 0),

    totalAds:
      Number(snapshot.live_ads_count || 0) ||
      Number(snapshot.dominance_total_ads || 0) ||
      Number(snapshot.total_ads_metric || 0),

    totalHighlightedAds: Number(snapshot.highlighted_ads_count || 0),
    totalBelowFipeAds: Number(snapshot.below_fipe_ads_count || 0),

    totalLeads:
      Number(snapshot.dominance_total_leads || 0) ||
      Number(snapshot.total_leads_metric || 0),

    totalDealers:
      Number(snapshot.advertisers_count || 0) ||
      Number(snapshot.total_dealers_metric || 0),

    avgCtr: Number(snapshot.avg_ctr || 0),
    publishedCityPages: Number(snapshot.published_city_pages_count || 0),
  };
}

function buildCitySignals(snapshot) {
  return {
    priorityLevel: snapshot.priority_level || "low",
    predictionLabel: snapshot.prediction_label || "cold",
    stage: snapshot.stage || "discovery",
    demandIndex: Number(snapshot.demand_index || 0),
    supplyIndex: Number(snapshot.supply_index || 0),
  };
}

function buildCityIdentity(snapshot) {
  return {
    id: snapshot.id,
    name: snapshot.name,
    state: snapshot.state || null,
    slug: snapshot.slug,
    region: snapshot.region || null,
    population: Number(snapshot.population || 0),
    stage: snapshot.stage || "discovery",
  };
}

function buildInternalLinks(snapshot, brandFacets = [], modelFacets = []) {
  const cityBase = `/cidade/${snapshot.slug}`;

  return {
    city: cityBase,
    highlights: `${cityBase}/destaques`,
    opportunities: `${cityBase}/oportunidades`,
    belowFipe: `${cityBase}/abaixo-da-fipe`,
    recent: `${cityBase}/recentes`,
    brands: brandFacets.slice(0, 10).map((item) => ({
      brand: item.brand,
      total: Number(item.total || 0),
      path: `${cityBase}/marca/${encodeURIComponent(String(item.brand).toLowerCase())}`,
    })),
    models: modelFacets.slice(0, 10).map((item) => ({
      brand: item.brand,
      model: item.model,
      total: Number(item.total || 0),
      path: `${cityBase}/marca/${encodeURIComponent(String(item.brand).toLowerCase())}/modelo/${encodeURIComponent(String(item.model).toLowerCase())}`,
    })),
  };
}

/* =====================================================
   READ MODEL PRINCIPAL DA PÁGINA PÚBLICA DA CIDADE
===================================================== */

export async function getCityPublicPage(slug) {
  const snapshot = await cityPublicRepository.getCityPublicSnapshot(slug);

  if (!snapshot) {
    throw new AppError("Cidade não encontrada", 404);
  }

  const [
    highlightAds,
    opportunityAds,
    recentAds,
    brandFacets,
    modelFacets,
  ] = await Promise.all([
    cityPublicRepository.listCityHighlightAds(slug, 12),
    cityPublicRepository.listCityOpportunityAds(slug, 12),
    cityPublicRepository.listRecentCityAds(slug, 12),
    cityPublicRepository.listCityBrandFacets(slug, 20),
    cityPublicRepository.listCityModelFacets(slug, 20),
  ]);

  return {
    city: buildCityIdentity(snapshot),
    stats: buildCityStats(snapshot),
    signals: buildCitySignals(snapshot),
    seo: buildCitySeoMeta(snapshot),
    sections: {
      highlightAds,
      opportunityAds,
      recentAds,
    },
    facets: {
      brands: brandFacets,
      models: modelFacets,
    },
    internalLinks: buildInternalLinks(snapshot, brandFacets, modelFacets),
    generatedAt: new Date().toISOString(),
  };
}
