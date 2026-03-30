// src/read-models/cities/city-brand.service.js

import { AppError } from "../../shared/middlewares/error.middleware.js";
import * as cityBrandRepository from "./city-brand.repository.js";
import { buildCityTerritorialLinks } from "./city-linking.service.js";
import * as adsService from "../../modules/ads/ads.service.js";
import { getFacetsWithFilters } from "../../modules/ads/filters/ads-filter.service.js";

function normalizeBrandSlug(brand) {
  return String(brand || "")
    .trim()
    .toLowerCase();
}

export async function getCityBrandPage(citySlug, brand, query = {}) {
  const snapshot = await cityBrandRepository.getCityBrandSnapshot(citySlug, brand);

  if (!snapshot || !snapshot.city_id) {
    throw new AppError("Página de marca da cidade não encontrada", 404);
  }

  const scopedFilters = {
    ...query,
    city_slug: citySlug,
    brand,
  };

  const [adsResult, facetsResult] = await Promise.all([
    adsService.search(
      {
        ...scopedFilters,
        limit: 24,
        sort: "relevance",
      },
      "public_city_brand",
      { safeMode: true }
    ),
    getFacetsWithFilters(scopedFilters, { safeMode: true }),
  ]);

  const models = (facetsResult?.facets?.models || []).filter(
    (item) => String(item.brand || "").toLowerCase() === String(brand).toLowerCase()
  );

  const relatedBrands = facetsResult?.facets?.brands || [];

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
      slug: normalizeBrandSlug(snapshot.brand),
    },
    stats: {
      totalAds: Number(snapshot.total_ads || 0),
      totalHighlightAds: Number(snapshot.total_highlight_ads || 0),
      totalBelowFipeAds: Number(snapshot.total_below_fipe_ads || 0),
      minPrice: snapshot.min_price ? Number(snapshot.min_price) : null,
      maxPrice: snapshot.max_price ? Number(snapshot.max_price) : null,
      avgPrice: snapshot.avg_price ? Number(snapshot.avg_price) : null,
    },
    seo: {
      title: `${snapshot.brand} em ${snapshot.city_name}${snapshot.city_state ? ` - ${snapshot.city_state}` : ""} | Carros na Cidade`,
      description: `Veja ofertas de ${snapshot.brand} em ${snapshot.city_name}. Compare anúncios, modelos disponíveis, destaques e oportunidades locais.`,
      canonicalPath: `/cidade/${snapshot.city_slug}/marca/${normalizeBrandSlug(snapshot.brand)}`,
      robots: "index,follow",
    },
    filters: adsResult.filters || {},
    sections: {
      ads: adsResult.data || [],
      models,
      relatedBrands,
    },
    pagination: {
      ads: adsResult.pagination,
    },
    internalLinks: buildCityTerritorialLinks({
      citySlug: snapshot.city_slug,
      brand: normalizeBrandSlug(snapshot.brand),
      model: null,
      relatedBrands,
      relatedModels: models,
    }),
    generatedAt: new Date().toISOString(),
  };
}
