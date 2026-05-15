import { AppError } from "../../shared/middlewares/error.middleware.js";
import * as adsRepository from "./ads.repository.js";
import { normalizePublicAdRow, normalizePublicAdRows } from "./ads.public-images.js";
import { serializeAdsForListing } from "./ads.public-listing.js";
import { searchAdsWithFilters } from "./filters/ads-filter.service.js";

export async function searchAds(filters = {}, scope = "public_global", options = {}) {
  const result = await searchAdsWithFilters(filters, scope, options);

  if (!result?.ok || !Array.isArray(result.data) || result.data.length === 0) {
    return result;
  }

  const normalized = await normalizePublicAdRows(result.data);
  // Listagem publica usa contrato slim — corta description, whatsapp_number,
  // arrays grandes de imagens, search_vector, scoring interno. Detalhe
  // (`showAd`) preserva o payload completo.
  const slim = serializeAdsForListing(normalized);

  return {
    ...result,
    data: slim,
  };
}

export async function showAd(identifier) {
  const ad = await adsRepository.findAdByIdentifier(identifier);

  if (!ad) {
    throw new AppError("Anúncio não encontrado", 404);
  }

  return normalizePublicAdRow(ad);
}
