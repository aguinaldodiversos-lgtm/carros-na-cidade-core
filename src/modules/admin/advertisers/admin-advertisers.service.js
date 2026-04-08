import { AppError } from "../../../shared/middlewares/error.middleware.js";
import { ADVERTISER_STATUS, isValidAdvertiserStatus } from "../../../shared/constants/status.js";
import { recordAdminAction } from "../admin.audit.js";
import * as repo from "./admin-advertisers.repository.js";

export async function listAdvertisers(filters) {
  return repo.listAdvertisers(filters);
}

export async function getAdvertiserById(id) {
  const advertiser = await repo.findById(id);
  if (!advertiser) throw new AppError("Anunciante não encontrado", 404);
  return advertiser;
}

export async function changeAdvertiserStatus(adminUserId, advertiserId, newStatus, reason = null) {
  if (!isValidAdvertiserStatus(newStatus)) {
    throw new AppError(`Status inválido: ${newStatus}`, 400);
  }

  const advertiser = await repo.findById(advertiserId);
  if (!advertiser) throw new AppError("Anunciante não encontrado", 404);

  const oldStatus = advertiser.status;
  const updated = await repo.updateStatus(advertiserId, newStatus, reason);

  await recordAdminAction({
    adminUserId,
    action: "change_advertiser_status",
    targetType: "advertiser",
    targetId: advertiserId,
    oldValue: { status: oldStatus },
    newValue: { status: newStatus, reason },
    reason,
  });

  return updated;
}

export async function getAdvertiserAds(advertiserId, options) {
  const advertiser = await repo.findById(advertiserId);
  if (!advertiser) throw new AppError("Anunciante não encontrado", 404);
  return repo.getAdvertiserAds(advertiserId, options);
}
