import { AppError } from "../../shared/middlewares/error.middleware.js";
import { executeAdUpdate, prepareAdUpdatePayload } from "./ads.persistence.service.js";
import * as adsRepository from "./ads.repository.js";
import { logAdsPublishFailure, sanitizeAdPayloadForLog } from "./ads.publish-flow.log.js";

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

export async function updateAd(id, data, user, ctx = {}) {
  const requestId = ctx.requestId ?? null;
  let stage = "loadOwnerContext";
  let advertiserId = null;
  let cityId = null;

  try {
    const ownerContext = await adsRepository.findOwnerContextById(id);
    if (ownerContext) {
      advertiserId = ownerContext.advertiser_id ?? null;
      cityId = ownerContext.city_id ?? null;
    }
    assertOwner(ownerContext, user.id);

    stage = "prepareUpdatePayload";
    const payload = prepareAdUpdatePayload({ ...data });

    stage = "executeUpdate";
    const updated = await executeAdUpdate(id, payload, { requestId });

    if (!updated) {
      throw new AppError("Falha ao atualizar anúncio", 500);
    }

    return updated;
  } catch (err) {
    logAdsPublishFailure(err, {
      stage: `ads.updateAd.${stage}`,
      requestId,
      userId: user.id,
      advertiserId,
      cityId,
      adId: id,
      payload: sanitizeAdPayloadForLog({ ...data, ad_id: id }),
    });
    throw err;
  }
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
