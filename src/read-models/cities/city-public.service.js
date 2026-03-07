// src/read-models/cities/city-public.service.js

import { AppError } from "../../shared/middlewares/error.middleware.js";
import * as cityPublicRepository from "./city-public.repository.js";
import * as adsService from "../../modules/ads/ads.service.js";
import { getFacetsWithFilters } from "../../modules/ads/filters/ads-filter.service.js";

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

function normalizeCityFilters(citySlug, query = {}) {
  return {
    ...query,
    city_slug: citySlug,
  };
}

/* =====================================================
   READ MODEL
===================================================== */

export async function getCityPublicPage(slug, query = {}) {
  const snapshot = await cityPublicRepository.getCityPublicSnapshot(slug);

  if (!snapshot) {
    throw new AppError("Cidade não encontrada", 404);
  }

  const cityFilters = normalizeCityFilters(slug, query);

  const [highlightAds, opportunityAds, recentAds, facetsResult] =
    await Promise.all([
      adsService.search(
        {
          ...cityFilters,
          highlight_only: true,
          sort: "highlight",
          limit: 12,
        },
        "public_city",
        { safeMode: true }
      ),
      adsService.search(
        {
          ...cityFilters,
          below_fipe: true,
          sort: "recent",
          limit: 12,
        },
        "public_city_below_fipe",
        { safeMode: true }
      ),
      adsService.search(
        {
          ...cityFilters,
          sort: "recent",
          limit: 12,
        },
        "public_city",
        { safeMode: true }
      ),
      getFacetsWithFilters(cityFilters, { safeMode: true }),
    ]);

  const brands = facetsResult?.facets?.brands || [];
  const models = facetsResult?.facets?.models || [];

  return {
    city: buildCityIdentity(snapshot),
    stats: buildCityStats(snapshot),
    signals: buildCitySignals(snapshot),
    seo: buildCitySeoMeta(snapshot),
    filters: highlightAds.filters || recentAds.filters || {},
    sections: {
      highlightAds: highlightAds.data || [],
      opportunityAds: opportunityAds.data || [],
      recentAds: recentAds.data || [],
    },
    pagination: {
      highlightAds: highlightAds.pagination,
      opportunityAds: opportunityAds.pagination,
      recentAds: recentAds.pagination,
    },
    facets: {
      brands,
      models,
      fuelTypes: facetsResult?.facets?.fuelTypes || [],
      bodyTypes: facetsResult?.facets?.bodyTypes || [],
    },
    internalLinks: buildInternalLinks(snapshot, brands, models),
    generatedAt: new Date().toISOString(),
  };
}
