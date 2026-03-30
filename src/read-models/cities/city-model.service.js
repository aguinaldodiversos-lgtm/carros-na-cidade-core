// src/read-models/cities/city-model.service.js

import { AppError } from "../../shared/middlewares/error.middleware.js";
import * as cityModelRepository from "./city-model.repository.js";
import { buildCityTerritorialLinks } from "./city-linking.service.js";
import * as adsService from "../../modules/ads/ads.service.js";
import { getFacetsWithFilters } from "../../modules/ads/filters/ads-filter.service.js";

function normalizeSlugPart(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

export async function getCityModelPage(citySlug, brand, model, query = {}) {
  const snapshot = await cityModelRepository.getCityModelSnapshot(citySlug, brand, model);

  if (!snapshot || !snapshot.city_id) {
    throw new AppError("Página de modelo da cidade não encontrada", 404);
  }

  const scopedFilters = {
    ...query,
    city_slug: citySlug,
    brand,
    model,
  };

  const [adsResult, facetsResult] = await Promise.all([
    adsService.search(
      {
        ...scopedFilters,
        limit: 24,
        sort: "relevance",
      },
      "public_city_brand_model",
      { safeMode: true }
    ),
    getFacetsWithFilters(
      {
        city_slug: citySlug,
        brand,
      },
      { safeMode: true }
    ),
  ]);

  const relatedModels = (facetsResult?.facets?.models || []).filter(
    (item) => String(item.brand || "").toLowerCase() === String(brand).toLowerCase()
  );

  return {
    city: {
      id: snapshot.city_id,
      name: snapshot.city_name,
      state: snapshot.city_state,
      slug: snapshot.city_slug,
      stage: snapshot.city_stage,
    },
    brand: {
      name: snapshot.brand,
      slug: normalizeSlugPart(snapshot.brand),
    },
    model: {
      name: snapshot.model,
      slug: normalizeSlugPart(snapshot.model),
    },
    stats: {
      totalAds: Number(snapshot.total_ads || 0),
      totalHighlightAds: Number(snapshot.total_highlight_ads || 0),
      totalBelowFipeAds: Number(snapshot.total_below_fipe_ads || 0),
      minPrice: snapshot.min_price ? Number(snapshot.min_price) : null,
      maxPrice: snapshot.max_price ? Number(snapshot.max_price) : null,
      avgPrice: snapshot.avg_price ? Number(snapshot.avg_price) : null,
      minYear: snapshot.min_year ? Number(snapshot.min_year) : null,
      maxYear: snapshot.max_year ? Number(snapshot.max_year) : null,
    },
    seo: {
      title: `${snapshot.brand} ${snapshot.model} em ${snapshot.city_name}${snapshot.city_state ? ` - ${snapshot.city_state}` : ""} | Carros na Cidade`,
      description: `Encontre anúncios de ${snapshot.brand} ${snapshot.model} em ${snapshot.city_name}. Veja ofertas locais, preços, destaques e oportunidades.`,
      canonicalPath: `/cidade/${snapshot.city_slug}/marca/${normalizeSlugPart(snapshot.brand)}/modelo/${normalizeSlugPart(snapshot.model)}`,
      robots: "index,follow",
    },
    filters: adsResult.filters || {},
    sections: {
      ads: adsResult.data || [],
      relatedModels,
    },
    pagination: {
      ads: adsResult.pagination,
    },
    internalLinks: buildCityTerritorialLinks({
      citySlug: snapshot.city_slug,
      brand: normalizeSlugPart(snapshot.brand),
      model: normalizeSlugPart(snapshot.model),
      relatedBrands: [],
      relatedModels,
    }),
    generatedAt: new Date().toISOString(),
  };
}
