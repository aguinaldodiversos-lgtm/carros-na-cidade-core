// src/read-models/cities/city-opportunity.service.js

import { AppError } from "../../shared/middlewares/error.middleware.js";
import * as cityOpportunityRepository from "./city-opportunity.repository.js";
import { buildCityTerritorialLinks } from "./city-linking.service.js";
import * as adsService from "../../modules/ads/ads.service.js";

export async function getCityOpportunityPage(citySlug, query = {}) {
  const snapshot = await cityOpportunityRepository.getCityOpportunitySnapshot(citySlug);

  if (!snapshot || !snapshot.city_id) {
    throw new AppError("Página de oportunidades da cidade não encontrada", 404);
  }

  const adsResult = await adsService.search(
    {
      ...query,
      city_slug: citySlug,
      below_fipe: true,
      limit: 24,
      sort: "recent",
    },
    "public_city_opportunities",
    { safeMode: true }
  );

  return {
    city: {
      id: snapshot.city_id,
      name: snapshot.city_name,
      state: snapshot.city_state,
      slug: snapshot.city_slug,
      stage: snapshot.city_stage,
    },
    stats: {
      opportunityScore: Number(snapshot.opportunity_score || 0),
      priorityLevel: snapshot.priority_level || "low",
      demandIndex: Number(snapshot.demand_index || 0),
      supplyIndex: Number(snapshot.supply_index || 0),
      dominanceScore: Number(snapshot.dominance_score || 0),
      totalAds: Number(snapshot.total_ads || 0),
      totalLeads: Number(snapshot.total_leads || 0),
      totalOpportunityAds: adsResult.data?.length || 0,
    },
    seo: {
      title: `Oportunidades de carros em ${snapshot.city_name}${snapshot.city_state ? ` - ${snapshot.city_state}` : ""} | Carros na Cidade`,
      description: `Veja oportunidades de veículos em ${snapshot.city_name}, com foco em anúncios atrativos e ofertas abaixo da FIPE na sua cidade.`,
      canonicalPath: `/cidade/${snapshot.city_slug}/oportunidades`,
      robots: "index,follow",
    },
    filters: adsResult.filters || {},
    sections: {
      opportunityAds: adsResult.data || [],
    },
    pagination: {
      opportunityAds: adsResult.pagination,
    },
    internalLinks: buildCityTerritorialLinks({
      citySlug: snapshot.city_slug,
      brand: null,
      model: null,
      relatedBrands: [],
      relatedModels: [],
    }),
    generatedAt: new Date().toISOString(),
  };
}

export async function getCityBelowFipePage(citySlug, query = {}) {
  const snapshot = await cityOpportunityRepository.getCityOpportunitySnapshot(citySlug);

  if (!snapshot || !snapshot.city_id) {
    throw new AppError("Página abaixo da FIPE da cidade não encontrada", 404);
  }

  const adsResult = await adsService.search(
    {
      ...query,
      city_slug: citySlug,
      below_fipe: true,
      limit: 24,
      sort: "recent",
    },
    "public_city_below_fipe",
    { safeMode: true }
  );

  return {
    city: {
      id: snapshot.city_id,
      name: snapshot.city_name,
      state: snapshot.city_state,
      slug: snapshot.city_slug,
      stage: snapshot.city_stage,
    },
    stats: {
      totalBelowFipeAds: adsResult.data?.length || 0,
      opportunityScore: Number(snapshot.opportunity_score || 0),
      priorityLevel: snapshot.priority_level || "low",
    },
    seo: {
      title: `Carros abaixo da FIPE em ${snapshot.city_name}${snapshot.city_state ? ` - ${snapshot.city_state}` : ""} | Carros na Cidade`,
      description: `Descubra carros abaixo da FIPE em ${snapshot.city_name}. Encontre ofertas locais com potencial de oportunidade e economia.`,
      canonicalPath: `/cidade/${snapshot.city_slug}/abaixo-da-fipe`,
      robots: "index,follow",
    },
    filters: adsResult.filters || {},
    sections: {
      belowFipeAds: adsResult.data || [],
    },
    pagination: {
      belowFipeAds: adsResult.pagination,
    },
    internalLinks: buildCityTerritorialLinks({
      citySlug: snapshot.city_slug,
      brand: null,
      model: null,
      relatedBrands: [],
      relatedModels: [],
    }),
    generatedAt: new Date().toISOString(),
  };
}
