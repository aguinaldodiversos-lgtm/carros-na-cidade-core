import { AppError } from "../../shared/middlewares/error.middleware.js";
import { slugify } from "../../shared/utils/slugify.js";
import { ensureAdvertiserForPublishing } from "../advertisers/advertiser.ensure.service.js";
import * as adsRepository from "./ads.repository.js";

function assertOwner(ownerContext, userId) {
  if (!ownerContext) {
    throw new AppError("Anúncio não encontrado", 404);
  }

  const advertiserUserId = ownerContext.advertiser_user_id;
  if (advertiserUserId == null) {
    throw new AppError("Anúncio não encontrado", 404);
  }

  if (String(advertiserUserId) !== String(userId)) {
    throw new AppError("Sem permissão para alterar este anúncio", 403);
  }
}

export async function createAd(data, user) {
  const advertiser = await ensureAdvertiserForPublishing(user.id, {
    cityId: data.city_id,
  });

  const slug = slugify(
    `${data.brand}-${data.model}-${data.year}-${Date.now()}`
  );

  return adsRepository.createAd({
    ...data,
    advertiser_id: advertiser.id,
    plan: user.plan || "free",
    slug,
    status: "active",
  });
}

export async function updateAd(id, data, user) {
  const ownerContext = await adsRepository.findOwnerContextById(id);
  assertOwner(ownerContext, user.id);

  const updated = await adsRepository.updateAd(id, data);

  if (!updated) {
    throw new AppError("Falha ao atualizar anúncio", 500);
  }

  return updated;
}

export async function removeAd(id, user) {
  const ownerContext = await adsRepository.findOwnerContextById(id);
  assertOwner(ownerContext, user.id);

  const removed = await adsRepository.softDeleteAd(id);

  if (!removed) {
    throw new AppError("Falha ao remover anúncio", 500);
  }

  return removed;
}
