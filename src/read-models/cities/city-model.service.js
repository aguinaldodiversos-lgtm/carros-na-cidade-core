// src/read-models/cities/city-model.service.js

import { AppError } from "../../shared/middlewares/error.middleware.js";
import { buildCityTerritorialLinks } from "./city-linking.service.js";
import * as adsService from "../../modules/ads/ads.service.js";
import { getFacetsWithFilters } from "../../modules/ads/filters/ads-filter.service.js";
import { brandModelSlug, canonicalBrandSlug, canonicalBrandLabel } from "../../shared/utils/slugify.js";
import { resolveCityModel } from "./territorial-resolve.service.js";
import { buildClusterSeo } from "./territorial-cluster.logic.js";
import { getSitemapMinAds } from "../seo/sitemap-min-ads.js";

/**
 * Página de cluster cidade + marca + modelo.
 *
 * `brand`/`model` chegam como SLUGS da URL. A resolução
 * (`resolveCityModel`) encontra os valores reais, conta estoque ativo da
 * combinação e decide a indexação. Cidade inexistente → 404. Combinação sem
 * estoque ativo → 200 noindex,follow. O filtro exato por slug evita que
 * "gol" puxe "Golf" tanto na contagem quanto na listagem.
 */
export async function getCityModelPage(citySlug, brand, model, query = {}) {
  const resolution = await resolveCityModel(citySlug, brand, model);

  if (!resolution.city) {
    throw new AppError("Página de modelo da cidade não encontrada", 404);
  }

  const { city, brandSlug, brand: brandAgg, modelSlug, model: modelAgg } = resolution;

  let ads = [];
  let adsFilters = {};
  let adsPagination = undefined;
  let relatedModels = [];

  if (modelAgg.hasActiveInventory) {
    const scopedFilters = {
      ...query,
      city_slug: city.slug,
      brand: brandAgg.label,
      model: modelAgg.label,
    };

    const [adsResult, facetsResult] = await Promise.all([
      adsService.search(
        { ...scopedFilters, limit: 24, sort: "relevance" },
        "public_city_brand_model",
        { safeMode: true }
      ),
      getFacetsWithFilters({ city_slug: city.slug, brand: brandAgg.label }, { safeMode: true }),
    ]);

    ads = (adsResult.data || []).filter(
      (ad) =>
        (!ad.brand || canonicalBrandSlug(ad.brand) === brandSlug) &&
        (!ad.model || brandModelSlug(ad.model) === modelSlug)
    );
    adsFilters = adsResult.filters || {};
    adsPagination = adsResult.pagination;

    relatedModels = (facetsResult?.facets?.models || []).filter(
      (item) => canonicalBrandSlug(item.brand) === brandSlug
    );
  }

  const cityLabel = `${city.name}${city.state ? ` - ${city.state}` : ""}`;
  const brandDisplay = canonicalBrandLabel(brandAgg.label);

  return {
    city: {
      id: city.id,
      name: city.name,
      state: city.state,
      slug: city.slug,
      stage: city.stage,
    },
    brand: {
      name: brandDisplay,
      slug: brandSlug,
    },
    model: {
      name: modelAgg.label,
      slug: modelSlug,
    },
    stats: {
      totalAds: modelAgg.stats.total,
      totalHighlightAds: modelAgg.stats.highlight,
      totalBelowFipeAds: modelAgg.stats.belowFipe,
      minPrice: modelAgg.stats.minPrice,
      maxPrice: modelAgg.stats.maxPrice,
      avgPrice: modelAgg.stats.avgPrice,
      minYear: modelAgg.stats.minYear,
      maxYear: modelAgg.stats.maxYear,
    },
    seo: buildClusterSeo({
      canonicalPath: `/cidade/${city.slug}/marca/${brandSlug}/modelo/${modelSlug}`,
      title: `${brandDisplay} ${modelAgg.label} em ${cityLabel} | Carros na Cidade`,
      description: `Encontre anúncios de ${brandDisplay} ${modelAgg.label} em ${city.name}. Veja ofertas locais, preços, destaques e oportunidades.`,
      activeCount: modelAgg.activeCount,
      minInventory: getSitemapMinAds(),
    }),
    filters: adsFilters,
    sections: {
      ads,
      relatedModels,
    },
    pagination: {
      ads: adsPagination,
    },
    internalLinks: buildCityTerritorialLinks({
      citySlug: city.slug,
      brand: brandSlug,
      model: modelSlug,
      relatedBrands: [],
      relatedModels,
    }),
    generatedAt: new Date().toISOString(),
  };
}
