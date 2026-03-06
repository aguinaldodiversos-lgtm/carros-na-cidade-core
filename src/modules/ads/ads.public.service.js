import * as adsRepository from "./ads.repository.js";
import { AppError } from "../../shared/middlewares/error.middleware.js";

export async function searchAds(filters = {}) {
  const result = await adsRepository.searchAds(filters);

  return {
    data: result.data,
    pagination: {
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: Math.max(1, Math.ceil(result.total / result.limit)),
    },
  };
}

export async function showAd(identifier) {
  const ad = await adsRepository.findAdByIdentifier(identifier);

  if (!ad) {
    throw new AppError("Anúncio não encontrado", 404);
  }

  return ad;
}
