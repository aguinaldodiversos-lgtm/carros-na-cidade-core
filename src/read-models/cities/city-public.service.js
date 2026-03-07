import { AppError } from "../../shared/middlewares/error.middleware.js";
import * as cityPublicRepository from "./city-public.repository.js";

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
    city: snapshot,
    highlightAds,
    opportunityAds,
    recentAds,
    facets: {
      brands: brandFacets,
      models: modelFacets,
    },
  };
}
