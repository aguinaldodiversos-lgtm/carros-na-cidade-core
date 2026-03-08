import { AppError } from "../../shared/middlewares/error.middleware.js";
import * as adsRepository from "./ads.repository.js";
import { searchAdsWithFilters } from "./filters/ads-filter.service.js";

export async function searchAds(filters = {}, scope = "public_global", options = {}) {
  return searchAdsWithFilters(filters, scope, options);
}

export async function showAd(identifier) {
  const ad = await adsRepository.findAdByIdentifier(identifier);

  if (!ad) {
    throw new AppError("Anúncio não encontrado", 404);
  }

  return ad;
}
