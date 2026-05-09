import { slugify } from "../../shared/utils/slugify.js";
import { ensurePublishEligibility } from "./ads.publish.eligibility.service.js";
import { executeAdInsert, prepareAdInsertPayload } from "./ads.persistence.service.js";
import { validateCreateAdPayload } from "./ads.validators.js";
import { logAdsPublishFailure, sanitizeAdPayloadForLog } from "./ads.publish-flow.log.js";
import { logger } from "../../shared/logger.js";
import { buildDomainFields } from "../../shared/domainLog.js";
import { AD_STATUS } from "./ads.canonical.constants.js";
import { AppError } from "../../shared/middlewares/error.middleware.js";
import { calculateForAd } from "./risk/ad-risk.service.js";
import {
  countDistinctOwnersForPhone,
  persistAdRiskSignals,
  persistAdRiskSnapshot,
  recordModerationEvent,
} from "./risk/ad-risk.repository.js";
import { MODERATION_EVENT } from "./risk/ad-risk.thresholds.js";
import {
  resolveFipeReference,
  fipeValueForRiskScoring,
} from "../fipe/fipe.service.js";

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

    // ──────────────────────────────────────────────────────────────────
    // FIPE — snapshot SERVER-SIDE.
    //
    // Anti-spoof: o `validated.fipe_value` enviado pelo cliente é tratado
    // apenas como hint informativo de baixa confiança (confidence='low').
    // A regra de PENDING_REVIEW por preço×FIPE só dispara com snapshot
    // server-side (confidence='high'). Manipular o payload NÃO faz o ad
    // escapar de review.
    // ──────────────────────────────────────────────────────────────────
    stage = "resolveFipe";
    const fipeSnapshot = await resolveFipeReference({
      brand: validated.brand,
      model: validated.model,
      year: validated.year,
      fipe_brand_code: validated.fipe_brand_code ?? null,
      fipe_model_code: validated.fipe_model_code ?? null,
      fipe_year_code: validated.fipe_year_code ?? null,
      fipe_code: validated.fipe_code ?? null,
      vehicle_type: validated.vehicle_type ?? null,
      client_hint_value: validated.fipe_value ?? null,
    });

    // ──────────────────────────────────────────────────────────────────
    // Risk score ANTES do INSERT — assim:
    //   • PRICE_INVALID derruba a publicação sem deixar resíduo no banco
    //   • status inicial já é o final (ACTIVE ou PENDING_REVIEW), sem
    //     janela em que o ad poderia aparecer publicamente
    // ──────────────────────────────────────────────────────────────────
    stage = "calculateRisk";
    const riskResult = await calculateForAd(
      {
        ad: validated,
        advertiser,
        account,
        // Apenas o valor server-side de alta confiança alimenta o score.
        // Hint do cliente (mesmo plausível) é descartado aqui — fica
        // registrado em `ad_moderation_events` para auditoria.
        fipeValue: fipeValueForRiskScoring(fipeSnapshot),
      },
      { countDistinctOwnersForPhone }
    );

    if (riskResult.shouldRejectImmediately) {
      throw new AppError(
        "Anúncio rejeitado por dados inválidos. Revise o preço e tente novamente.",
        400,
        true,
        {
          code: "ADS_REJECTED_INVALID_DATA",
          reasons: riskResult.reasons,
          riskScore: riskResult.riskScore,
          riskLevel: riskResult.riskLevel,
        }
      );
    }

    const initialStatus = riskResult.shouldSendToReview
      ? AD_STATUS.PENDING_REVIEW
      : AD_STATUS.ACTIVE;

    stage = "buildInsertRow";
    const slug = slugify(`${validated.brand}-${validated.model}-${validated.year}-${Date.now()}`);
    const plan = user?.plan || account.raw_plan || "free";

    const row = prepareAdInsertPayload({
      ...validated,
      advertiser_id: advertiser.id,
      plan,
      slug,
      status: initialStatus,
    });

    stage = "executeInsert";
    const inserted = await executeAdInsert(row, { requestId });

    // Persistência do risco (snapshot em ads + sinais detalhados + eventos).
    // Falhas aqui NÃO podem reverter o INSERT (decisão de status já foi
    // tomada e o ad existe). Apenas logamos para auditoria.
    if (inserted?.id) {
      try {
        stage = "persistRisk";
        await persistAdRiskSnapshot(inserted.id, riskResult);
        await persistAdRiskSignals(inserted.id, riskResult.reasons);

        // Auditoria do FIPE server-side: gravamos o snapshot inteiro
        // (incluindo se o hint do cliente foi ignorado). Útil para
        // detectar futuramente padrões de spoof.
        await recordModerationEvent({
          adId: inserted.id,
          eventType: "fipe_resolved",
          actorRole: "system",
          fromStatus: null,
          toStatus: initialStatus,
          reason: fipeSnapshot.failure_reason || null,
          metadata: {
            ok: Boolean(fipeSnapshot.ok),
            value: fipeSnapshot.value,
            confidence: fipeSnapshot.confidence,
            source: fipeSnapshot.fipe_source,
            fipe_code: fipeSnapshot.fipe_code,
            used_client_hint: Boolean(fipeSnapshot.used_client_hint),
            client_hint_value:
              fipeSnapshot.client_hint_value ?? validated.fipe_value ?? null,
            reference_month: fipeSnapshot.reference_month ?? null,
          },
        });

        await recordModerationEvent({
          adId: inserted.id,
          eventType: MODERATION_EVENT.RISK_SCORE_CALCULATED,
          actorRole: "system",
          fromStatus: null,
          toStatus: initialStatus,
          reason: null,
          metadata: {
            riskScore: riskResult.riskScore,
            riskLevel: riskResult.riskLevel,
            reasonCount: riskResult.reasons.length,
            fipe_confidence: fipeSnapshot.confidence,
          },
        });
        if (initialStatus === AD_STATUS.PENDING_REVIEW) {
          await recordModerationEvent({
            adId: inserted.id,
            eventType: MODERATION_EVENT.SENT_TO_REVIEW,
            actorRole: "system",
            fromStatus: null,
            toStatus: AD_STATUS.PENDING_REVIEW,
            reason: "Risk pipeline routed to manual review.",
            metadata: {
              codes: riskResult.reasons.map((r) => r.code),
            },
          });
        }
      } catch (riskErr) {
        logger.error(
          {
            ...buildDomainFields({
              action: "ads.create.persistRisk",
              result: "error",
              requestId,
              userId: user?.id ?? null,
            }),
            adId: inserted.id,
            err: riskErr?.message || String(riskErr),
          },
          "[ads] falha ao persistir risco — anúncio criado mas auditoria incompleta"
        );
      }
    }

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
        riskScore: riskResult.riskScore,
        riskLevel: riskResult.riskLevel,
        finalStatus: initialStatus,
      },
      "[ads] anúncio criado"
    );

    // Anexa metadados de risco/decisão à row retornada para o BFF
    // sinalizar PENDING_REVIEW vs ACTIVE no fluxo de submit.
    return {
      ...inserted,
      risk_score: riskResult.riskScore,
      risk_level: riskResult.riskLevel,
      risk_reasons: riskResult.reasons,
      moderation_status:
        initialStatus === AD_STATUS.PENDING_REVIEW ? "pending_review" : "approved",
    };
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
