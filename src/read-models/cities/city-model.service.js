import { AppError } from "../../shared/middlewares/error.middleware.js";
import * as cityModelRepository from "./city-model.repository.js";
import { buildCityTerritorialLinks } from "./city-linking.service.js";

function normalizeSlugPart(value) {
  return String(value || "").trim().toLowerCase();
}

export async function getCityModelPage(citySlug, brand, model) {
  const snapshot = await cityModelRepository.getCityModelSnapshot(
    citySlug,
    brand,
    model
  );

  if (!snapshot || !snapshot.city_id) {
    throw new AppError("Página de modelo da cidade não encontrada", 404);
  }

  const [ads, relatedModels] = await Promise.all([
    cityModelRepository.listModelAds(citySlug, brand, model, 24),
    cityModelRepository.listRelatedModelsByBrand(citySlug, brand, 12),
  ]);

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
    sections: {
      ads,
      relatedModels,
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
