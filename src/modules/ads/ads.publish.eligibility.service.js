import { AppError } from "../../shared/middlewares/error.middleware.js";
import { getAccountUser, resolvePublishEligibility } from "../account/account.service.js";
import { ensureAdvertiserForPublishing } from "../advertisers/advertiser.ensure.service.js";

/**
 * Único fluxo de publicação: delega regras PF/PJ + plano a `resolvePublishEligibility`
 * (mesma função que POST /account/plans/eligibility e `publish_eligibility` no dashboard).
 * Em seguida garante linha em `advertisers` para a cidade do anúncio.
 *
 * @param {object} user — tipicamente `req.user` (deve ter `id`)
 * @param {{ cityId: number, requestId?: string|null }} context
 * @returns {Promise<{ advertiserId: string|number, advertiser: object, account: object }>}
 */
export async function ensurePublishEligibility(user, context = {}) {
  const userId = String(user?.id ?? "").trim();
  if (!userId) {
    throw new AppError("Sessão inválida", 401);
  }

  const cityId = context.cityId;
  if (cityId == null || Number.isNaN(Number(cityId))) {
    throw new AppError("Cidade do anúncio inválida.", 400);
  }

  const account = await getAccountUser(userId);
  const planCheck = await resolvePublishEligibility(userId, account);

  if (!planCheck.allowed) {
    throw new AppError(planCheck.reason || "Não é possível publicar neste momento.", 400);
  }

  const advertiser = await ensureAdvertiserForPublishing(userId, {
    cityId: Number(cityId),
    requestId: context.requestId ?? null,
  });

  return {
    advertiserId: advertiser.id,
    advertiser,
    account,
  };
}
