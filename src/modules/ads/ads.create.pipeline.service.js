import { slugify } from "../../shared/utils/slugify.js";
import { ensurePublishEligibility } from "./ads.publish.eligibility.service.js";
import { executeAdInsert, prepareAdInsertPayload } from "./ads.persistence.service.js";
import { validateCreateAdPayload } from "./ads.validators.js";
import { logAdsPublishFailure, sanitizeAdPayloadForLog } from "./ads.publish-flow.log.js";
import { logger } from "../../shared/logger.js";
import { buildDomainFields } from "../../shared/domainLog.js";
import { AD_STATUS } from "./ads.canonical.constants.js";
import { AppError } from "../../shared/middlewares/error.middleware.js";

/**
 * Invariante: anúncio só nasce `active` se tiver pelo menos 1 imagem válida.
 * O Zod já exige `images.min(1)` (defesa de contrato), mas mantemos esta
 * checagem de domínio para que callers diretos de `createAdNormalized`
 * (sem passar pelo validator do controller) não escapem da regra.
 */
function assertHasValidImages(images, ctx) {
  const list = Array.isArray(images)
    ? images.filter((u) => typeof u === "string" && u.trim().length > 0)
    : [];
  if (list.length === 0) {
    throw new AppError(
      "Anúncio precisa de pelo menos 1 foto válida para ser publicado.",
      400,
      true,
      { code: "ADS_REQUIRE_AT_LEAST_ONE_IMAGE", ...ctx }
    );
  }
  return list;
}

/**
 * Pipeline único de criação de anúncio:
 * valida contrato (Zod) → elegibilidade (documento + plano + advertiser) → normalização → INSERT.
 *
 * @param {object} rawPayload — corpo da requisição (JSON)
 * @param {object} user — tipicamente `req.user` (`id` obrigatório; `plan` opcional do JWT)
 * @param {{ requestId?: string|null }} [ctx]
 */
export async function createAdNormalized(rawPayload, user, ctx = {}) {
  const requestId = ctx.requestId ?? null;
  let stage = "validatePayload";
  let advertiserId = null;
  let validated;

  try {
    validated = validateCreateAdPayload(rawPayload);

    // Invariante de domínio (defesa em profundidade do `min(1)` no Zod):
    // anúncio nasce `active` no banco — não pode ficar público sem foto.
    stage = "assertImages";
    validated.images = assertHasValidImages(validated.images, {
      requestId,
      userId: user?.id ?? null,
    });

    stage = "ensurePublishEligibility";

    const { advertiser, account } = await ensurePublishEligibility(user, {
      cityId: validated.city_id,
      requestId,
    });
    advertiserId = advertiser.id;

    stage = "buildInsertRow";
    const slug = slugify(`${validated.brand}-${validated.model}-${validated.year}-${Date.now()}`);
    const plan = user?.plan || account.raw_plan || "free";

    const row = prepareAdInsertPayload({
      ...validated,
      advertiser_id: advertiser.id,
      plan,
      slug,
      status: AD_STATUS.ACTIVE,
    });

    stage = "executeInsert";
    const inserted = await executeAdInsert(row, { requestId });

    logger.info(
      {
        ...buildDomainFields({
          action: "ads.create",
          result: "success",
          requestId,
          userId: user?.id ?? null,
        }),
        advertiserId,
        adId: inserted?.id ?? null,
        cityId: validated.city_id,
      },
      "[ads] anúncio criado"
    );

    return inserted;
  } catch (err) {
    const cityId =
      validated?.city_id ??
      (rawPayload && typeof rawPayload === "object" ? rawPayload.city_id : null);

    logAdsPublishFailure(err, {
      stage: `ads.createNormalized.${stage}`,
      requestId,
      userId: user?.id ?? null,
      advertiserId,
      cityId,
      payload: sanitizeAdPayloadForLog({
        ...(validated ?? rawPayload ?? {}),
        advertiser_id: advertiserId,
      }),
    });
    throw err;
  }
}
