// src/read-models/cities/city-brand.service.js

import { AppError } from "../../shared/middlewares/error.middleware.js";
import { buildCityTerritorialLinks } from "./city-linking.service.js";
import * as adsService from "../../modules/ads/ads.service.js";
import { getFacetsWithFilters } from "../../modules/ads/filters/ads-filter.service.js";
import { brandModelSlug } from "../../shared/utils/slugify.js";
import { resolveCityBrand } from "./territorial-resolve.service.js";
import { buildClusterSeo } from "./territorial-cluster.logic.js";

/**
 * Página de cluster cidade + marca.
 *
 * `brand` chega como SLUG da URL (ex.: "fiat", "land-rover"), não como o
 * texto real do anúncio. A resolução (`resolveCityBrand`) encontra os valores
 * reais de `ads.brand` cujo slug canônico bate exatamente, conta o estoque
 * ativo e decide a indexação. Cidade inexistente → 404 real (lançado aqui;
 * o middleware do frontend também faz o gate estrutural). Cidade válida sem
 * estoque da marca → HTTP 200 noindex,follow com estado vazio útil.
 */
export async function getCityBrandPage(citySlug, brand, query = {}) {
  const resolution = await resolveCityBrand(citySlug, brand);

  if (!resolution.city) {
    throw new AppError("Página de marca da cidade não encontrada", 404);
  }

  const { city, brandSlug, brand: brandAgg } = resolution;

  let ads = [];
  let adsFilters = {};
  let adsPagination = undefined;
  let models = [];
  let relatedBrands = [];

  if (brandAgg.hasActiveInventory) {
    const scopedFilters = {
      ...query,
      city_slug: city.slug,
      // usa o valor REAL resolvido (não o slug) para o filtro do backend
      brand: brandAgg.label,
    };

    const [adsResult, facetsResult] = await Promise.all([
      adsService.search({ ...scopedFilters, limit: 24, sort: "relevance" }, "public_city_brand", {
        safeMode: true,
      }),
      getFacetsWithFilters(scopedFilters, { safeMode: true }),
    ]);

    // Defesa anti-divergência: a busca usa ILIKE substring, então pode trazer
    // marcas que apenas CONTÊM o termo. Filtramos pelo slug canônico exato
    // para nunca exibir ("gol" não traz "Golf"). Anúncios sem brand não são
    // descartados (não há como reclassificar).
    ads = (adsResult.data || []).filter(
      (ad) => !ad.brand || brandModelSlug(ad.brand) === brandSlug
    );
    adsFilters = adsResult.filters || {};
    adsPagination = adsResult.pagination;

    models = (facetsResult?.facets?.models || []).filter(
      (item) => brandModelSlug(item.brand) === brandSlug
    );
    relatedBrands = facetsResult?.facets?.brands || [];
  }

  const cityLabel = `${city.name}${city.state ? ` - ${city.state}` : ""}`;

  return {
    city: {
      id: city.id,
      name: city.name,
      state: city.state,
      slug: city.slug,
      stage: city.stage,
    },
    brand: {
      name: brandAgg.label,
      slug: brandSlug,
    },
    stats: {
      totalAds: brandAgg.stats.total,
      totalHighlightAds: brandAgg.stats.highlight,
      totalBelowFipeAds: brandAgg.stats.belowFipe,
      minPrice: brandAgg.stats.minPrice,
      maxPrice: brandAgg.stats.maxPrice,
      avgPrice: brandAgg.stats.avgPrice,
    },
    seo: buildClusterSeo({
      canonicalPath: `/cidade/${city.slug}/marca/${brandSlug}`,
      title: `${brandAgg.label} em ${cityLabel} | Carros na Cidade`,
      description: `Veja ofertas de ${brandAgg.label} em ${city.name}. Compare anúncios, modelos disponíveis, destaques e oportunidades locais.`,
      activeCount: brandAgg.activeCount,
    }),
    filters: adsFilters,
    sections: {
      ads,
      models,
      relatedBrands,
    },
    pagination: {
      ads: adsPagination,
    },
    internalLinks: buildCityTerritorialLinks({
      citySlug: city.slug,
      brand: brandSlug,
      model: null,
      relatedBrands,
      relatedModels: models,
    }),
    generatedAt: new Date().toISOString(),
  };
}
