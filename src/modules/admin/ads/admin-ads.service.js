import { AppError } from "../../../shared/middlewares/error.middleware.js";
import { AD_STATUS, isValidAdStatus } from "../../../shared/constants/status.js";
import { recordAdminAction } from "../admin.audit.js";
import * as repo from "./admin-ads.repository.js";

export async function listAds(filters) {
  return repo.listAds(filters);
}

export async function getAdById(id) {
  const ad = await repo.findById(id);
  if (!ad) throw new AppError("Anúncio não encontrado", 404);
  return ad;
}

export async function changeAdStatus(adminUserId, adId, newStatus, reason = null) {
  if (!isValidAdStatus(newStatus)) {
    throw new AppError(`Status inválido: ${newStatus}`, 400);
  }

  const ad = await repo.findById(adId);
  if (!ad) throw new AppError("Anúncio não encontrado", 404);

  const oldStatus = ad.status;

  if (oldStatus === AD_STATUS.DELETED && newStatus !== AD_STATUS.DELETED) {
    throw new AppError("Anúncios deletados não podem ser restaurados por esta via", 400);
  }

  if (newStatus === AD_STATUS.BLOCKED && reason) {
    await repo.updateBlockedReason(adId, reason);
  }

  const updated = await repo.updateStatus(adId, newStatus);

  await recordAdminAction({
    adminUserId,
    action: "change_ad_status",
    targetType: "ad",
    targetId: adId,
    oldValue: { status: oldStatus },
    newValue: { status: newStatus, reason },
    reason,
  });

  return updated;
}

export async function setAdHighlight(adminUserId, adId, highlightUntil) {
  const ad = await repo.findById(adId);
  if (!ad) throw new AppError("Anúncio não encontrado", 404);

  if (ad.status !== AD_STATUS.ACTIVE) {
    throw new AppError("Apenas anúncios ativos podem ser destacados", 400);
  }

  const oldHighlight = ad.highlight_until;
  const updated = await repo.updateHighlight(adId, highlightUntil);

  await recordAdminAction({
    adminUserId,
    action: "set_ad_highlight",
    targetType: "ad",
    targetId: adId,
    oldValue: { highlight_until: oldHighlight },
    newValue: { highlight_until: highlightUntil },
  });

  return updated;
}

export async function setAdPriority(adminUserId, adId, priority) {
  const numPriority = Number(priority);
  if (!Number.isFinite(numPriority) || numPriority < 0 || numPriority > 100) {
    throw new AppError("Priority deve ser entre 0 e 100", 400);
  }

  const ad = await repo.findById(adId);
  if (!ad) throw new AppError("Anúncio não encontrado", 404);

  const oldPriority = ad.priority;
  const updated = await repo.updatePriority(adId, numPriority);

  await recordAdminAction({
    adminUserId,
    action: "set_ad_priority",
    targetType: "ad",
    targetId: adId,
    oldValue: { priority: oldPriority },
    newValue: { priority: numPriority },
  });

  return updated;
}

export async function grantManualBoost(adminUserId, adId, days, reason = null) {
  const numDays = Number(days);
  if (!Number.isFinite(numDays) || numDays < 1 || numDays > 365) {
    throw new AppError("Dias de boost deve ser entre 1 e 365", 400);
  }

  const ad = await repo.findById(adId);
  if (!ad) throw new AppError("Anúncio não encontrado", 404);

  if (ad.status === AD_STATUS.DELETED || ad.status === AD_STATUS.BLOCKED) {
    throw new AppError("Não é possível impulsionar anúncio deletado ou bloqueado", 400);
  }

  const currentHighlight = ad.highlight_until;
  const baseDate =
    currentHighlight && new Date(currentHighlight) > new Date()
      ? new Date(currentHighlight)
      : new Date();
  const newHighlight = new Date(baseDate.getTime() + numDays * 24 * 60 * 60 * 1000);

  const updated = await repo.updateHighlight(adId, newHighlight.toISOString());

  const newPriority = Math.min(99, (ad.priority || 0) + 8);
  await repo.updatePriority(adId, newPriority);

  await recordAdminAction({
    adminUserId,
    action: "grant_manual_boost",
    targetType: "ad",
    targetId: adId,
    oldValue: { highlight_until: currentHighlight, priority: ad.priority },
    newValue: { highlight_until: newHighlight.toISOString(), priority: newPriority, days: numDays },
    reason,
  });

  return { ...updated, priority: newPriority, highlight_until: newHighlight.toISOString() };
}

export async function getAdMetrics(adId) {
  const ad = await repo.findById(adId);
  if (!ad) throw new AppError("Anúncio não encontrado", 404);
  return repo.getAdMetrics(adId);
}

export async function getAdEvents(adId, options) {
  const ad = await repo.findById(adId);
  if (!ad) throw new AppError("Anúncio não encontrado", 404);
  return repo.getAdEvents(adId, options);
}
