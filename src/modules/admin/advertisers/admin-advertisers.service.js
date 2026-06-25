import { AppError } from "../../../shared/middlewares/error.middleware.js";
import { ADVERTISER_STATUS, isValidAdvertiserStatus } from "../../../shared/constants/status.js";
import { recordAdminAction } from "../admin.audit.js";
import * as repo from "./admin-advertisers.repository.js";
import {
  grantAdvertiserPlan,
  revokeAdvertiserPlan,
  expireDueGrantsForUser,
  buildAdvertiserPlanInfo,
} from "./advertiser-plan-grant.service.js";

// Reexporta a concessão manual de plano para que admin.routes continue
// consumindo o módulo de anunciantes como fachada única.
export { grantAdvertiserPlan, revokeAdvertiserPlan };

export async function listAdvertisers(filters) {
  return repo.listAdvertisers(filters);
}

export async function getAdvertiserById(id) {
  const advertiser = await repo.findById(id);
  if (!advertiser) throw new AppError("Anunciante não encontrado", 404);

  // Sem usuário vinculado não há plano efetivo a resolver (anunciante legado).
  if (!advertiser.user_id) return advertiser;

  // Auto-cura: expira concessões vencidas (revertendo users.plan_id) antes de
  // exibir, para que o admin sempre veja o estado correto mesmo sem cron.
  await expireDueGrantsForUser(advertiser.user_id);

  const planInfo = await buildAdvertiserPlanInfo(advertiser.user_id);
  return { ...advertiser, ...planInfo };
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
