import { slugify } from "../../shared/utils/slugify.js";
import { AppError } from "../../shared/middlewares/error.middleware.js";
import * as adsRepository from "./ads.repository.js";

function buildAdSlug(data) {
  return slugify(`${data.brand}-${data.model}-${data.year}-${Date.now()}`);
}

export async function createAd(data, user) {
  const advertiser = await adsRepository.findAdvertiserByUserId(user.id);

  if (!advertiser) {
    throw new AppError("Advertiser não encontrado", 400);
  }

  return adsRepository.insertAd({
    ...data,
    advertiser_id: advertiser.id,
    plan: user.plan,
    slug: buildAdSlug(data),
  });
}

export async function updateAd(id, data, user) {
  const ownedAd = await adsRepository.findOwnedAdById(id, user.id);

  if (!ownedAd) {
    throw new AppError("Anúncio não encontrado ou sem permissão", 404);
  }

  const updated = await adsRepository.updateAdById(id, data);

  if (!updated) {
    throw new AppError("Falha ao atualizar anúncio", 500);
  }

  return updated;
}

export async function removeAd(id, user) {
  const ownedAd = await adsRepository.findOwnedAdById(id, user.id);

  if (!ownedAd) {
    throw new AppError("Anúncio não encontrado ou sem permissão", 404);
  }

  const removed = await adsRepository.softDeleteAdById(id);

  if (!removed) {
    throw new AppError("Falha ao remover anúncio", 500);
  }

  return removed;
}
