/**
 * adRiskService.calculateForAd — fonte única de cálculo de risco antifraude.
 *
 * Recebe o payload normalizado do anúncio (já validado pelo Zod) e o contexto
 * (advertiser/account, idade da conta, FIPE, etc.) e devolve:
 *
 *   {
 *     riskScore: number,                         // 0..100
 *     riskLevel: "low"|"medium"|"high"|"critical",
 *     shouldSendToReview: boolean,
 *     shouldRejectImmediately: boolean,
 *     reasons: [
 *       { code, message, severity, scoreDelta, metadata }
 *     ],
 *     fipeDiffPercent: number|null,
 *     fipeReferenceValue: number|null
 *   }
 *
 * Não acessa banco — o pipeline (`createAdNormalized`) é quem persiste os
 * sinais e o snapshot no `ads`. Um único repositório opcional é consultado
 * para o sinal `PHONE_REUSED_ACROSS_ACCOUNTS` (DB lookup), passado via
 * `dependencies` para manter a função pura/testável.
 */

import {
  FIPE_DIFF_THRESHOLDS,
  LOW_IMAGE_COUNT_THRESHOLD,
  NEW_ACCOUNT_DAYS_THRESHOLD,
  PRICE_MIN_VALID_BRL,
  RISK_SCORE_REVIEW_THRESHOLD,
  RISK_SIGNAL_CODE,
  scoreToLevel,
} from "./ad-risk.thresholds.js";

const PHONE_REGEX =
  /(\(?\s*\d{2}\s*\)?\s*9?\d{4}[\s.-]?\d{4})|(\b\d{10,11}\b)|(\+\s*55\s*\d{2}\s*9?\d{4}[\s.-]?\d{4})/i;
const URL_REGEX =
  /\b(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(?:com|net|org|br|info|biz|io|co)(?:\.[a-z]{2})?\b/i;

function buildSignal({ code, message, severity, scoreDelta, metadata = {} }) {
  return Object.freeze({
    code,
    message,
    severity,
    scoreDelta: Number.isFinite(scoreDelta) ? scoreDelta : 0,
    metadata,
  });
}

function calcFipeDiffPercent(price, fipeValue) {
  if (!Number.isFinite(price) || price <= 0) return null;
  if (!Number.isFinite(fipeValue) || fipeValue <= 0) return null;
  return ((price - fipeValue) / fipeValue) * 100;
}

function dayDiff(fromDateLike) {
  if (!fromDateLike) return null;
  const t = new Date(fromDateLike).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / (24 * 60 * 60 * 1000)));
}

/**
 * @param {object} input
 * @param {object} input.ad — payload já validado pelo Zod
 *                            (price, brand, model, year, description, images, ...)
 * @param {object} input.advertiser
 * @param {object} input.account
 * @param {number|null} [input.fipeValue]
 * @param {object} [input.context]   — extra (ex: edição, structural_change=true)
 * @param {object} [dependencies]
 * @param {(opts:{phone:string,userId:string|number})=>Promise<number>}
 *        [dependencies.countDistinctOwnersForPhone]
 *        — quando informado, habilita o sinal PHONE_REUSED_ACROSS_ACCOUNTS.
 */
export async function calculateForAd(input, dependencies = {}) {
  const ad = input?.ad ?? {};
  const account = input?.account ?? {};
  const advertiser = input?.advertiser ?? {};
  const ctx = input?.context ?? {};
  const fipeValue = Number.isFinite(input?.fipeValue) ? input.fipeValue : null;

  const reasons = [];

  const price = Number(ad.price);
  const description = String(ad.description || "");
  const imagesCount = Array.isArray(ad.images) ? ad.images.length : 0;

  // ─────────────────────────────────────────────────────────────────────
  // 1. PRICE_INVALID — preço zero/irreal (sentinela; rejeição imediata)
  // ─────────────────────────────────────────────────────────────────────
  let priceInvalid = false;
  if (!Number.isFinite(price) || price <= 0) {
    priceInvalid = true;
    reasons.push(
      buildSignal({
        code: RISK_SIGNAL_CODE.PRICE_INVALID,
        severity: "critical",
        scoreDelta: 100,
        message: "Preço informado é inválido (zero, negativo ou ausente).",
        metadata: { price },
      })
    );
  } else if (price < PRICE_MIN_VALID_BRL) {
    priceInvalid = true;
    reasons.push(
      buildSignal({
        code: RISK_SIGNAL_CODE.PRICE_INVALID,
        severity: "critical",
        scoreDelta: 100,
        message: `Preço informado abaixo do mínimo aceitável (R$ ${PRICE_MIN_VALID_BRL}).`,
        metadata: { price, minPrice: PRICE_MIN_VALID_BRL },
      })
    );
  }

  // ─────────────────────────────────────────────────────────────────────
  // 2. Comparação preço × FIPE (regra prioritária)
  // ─────────────────────────────────────────────────────────────────────
  const fipeDiffPercent = calcFipeDiffPercent(price, fipeValue);
  let fipeForcesReview = false;
  let fipeForcesCritical = false;

  if (fipeValue == null) {
    reasons.push(
      buildSignal({
        code: RISK_SIGNAL_CODE.FIPE_UNAVAILABLE,
        severity: "low",
        scoreDelta: 5,
        message:
          "Valor FIPE indisponível no momento da publicação — análise sem comparação automática.",
        metadata: {},
      })
    );
  } else if (fipeDiffPercent != null) {
    if (fipeDiffPercent <= FIPE_DIFF_THRESHOLDS.CRITICAL_PCT) {
      fipeForcesReview = true;
      fipeForcesCritical = true;
      reasons.push(
        buildSignal({
          code: RISK_SIGNAL_CODE.PRICE_FAR_BELOW_FIPE_CRITICAL,
          severity: "critical",
          scoreDelta: 80,
          message: `Preço ${Math.abs(fipeDiffPercent).toFixed(1)}% abaixo da FIPE — análise obrigatória.`,
          metadata: { price, fipeValue, diffPercent: fipeDiffPercent },
        })
      );
    } else if (fipeDiffPercent <= FIPE_DIFF_THRESHOLDS.REVIEW_PCT) {
      fipeForcesReview = true;
      reasons.push(
        buildSignal({
          code: RISK_SIGNAL_CODE.PRICE_BELOW_FIPE_REVIEW,
          severity: "high",
          scoreDelta: 50,
          message: `Preço ${Math.abs(fipeDiffPercent).toFixed(1)}% abaixo da FIPE — revisão manual.`,
          metadata: { price, fipeValue, diffPercent: fipeDiffPercent },
        })
      );
    } else if (fipeDiffPercent <= FIPE_DIFF_THRESHOLDS.WARNING_PCT) {
      reasons.push(
        buildSignal({
          code: RISK_SIGNAL_CODE.PRICE_BELOW_FIPE_WARNING,
          severity: "medium",
          scoreDelta: 20,
          message: `Preço ${Math.abs(fipeDiffPercent).toFixed(1)}% abaixo da FIPE — atenção.`,
          metadata: { price, fipeValue, diffPercent: fipeDiffPercent },
        })
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // 3. Poucas fotos
  // ─────────────────────────────────────────────────────────────────────
  if (imagesCount > 0 && imagesCount < LOW_IMAGE_COUNT_THRESHOLD) {
    reasons.push(
      buildSignal({
        code: RISK_SIGNAL_CODE.LOW_IMAGE_COUNT,
        severity: "low",
        scoreDelta: 8,
        message: `Anúncio com poucas fotos (${imagesCount}).`,
        metadata: { imagesCount, threshold: LOW_IMAGE_COUNT_THRESHOLD },
      })
    );
  }

  // ─────────────────────────────────────────────────────────────────────
  // 4. Telefone na descrição
  // ─────────────────────────────────────────────────────────────────────
  if (description && PHONE_REGEX.test(description)) {
    reasons.push(
      buildSignal({
        code: RISK_SIGNAL_CODE.PHONE_IN_DESCRIPTION,
        severity: "medium",
        scoreDelta: 25,
        message: "Descrição contém número de telefone — risco de fraude/spam.",
        metadata: {},
      })
    );
  }

  // ─────────────────────────────────────────────────────────────────────
  // 5. Link externo na descrição
  // ─────────────────────────────────────────────────────────────────────
  if (description && URL_REGEX.test(description)) {
    reasons.push(
      buildSignal({
        code: RISK_SIGNAL_CODE.EXTERNAL_LINK_IN_DESCRIPTION,
        severity: "medium",
        scoreDelta: 20,
        message: "Descrição contém link externo — pode ser tentativa de redirect.",
        metadata: {},
      })
    );
  }

  // ─────────────────────────────────────────────────────────────────────
  // 6. Conta recém-criada
  // ─────────────────────────────────────────────────────────────────────
  const accountAgeDays = dayDiff(account?.created_at);
  if (
    accountAgeDays != null &&
    accountAgeDays < NEW_ACCOUNT_DAYS_THRESHOLD
  ) {
    reasons.push(
      buildSignal({
        code: RISK_SIGNAL_CODE.NEW_ACCOUNT,
        severity: "low",
        scoreDelta: 10,
        message: `Conta criada há ${accountAgeDays} dia(s).`,
        metadata: { accountAgeDays, threshold: NEW_ACCOUNT_DAYS_THRESHOLD },
      })
    );
  }

  // ─────────────────────────────────────────────────────────────────────
  // 7. WhatsApp/telefone reutilizado em múltiplas contas
  // ─────────────────────────────────────────────────────────────────────
  const phoneToCheck =
    String(account?.whatsapp || account?.phone || advertiser?.whatsapp || advertiser?.phone || "")
      .replace(/\D/g, "")
      .slice(-11);

  if (
    phoneToCheck &&
    phoneToCheck.length >= 10 &&
    typeof dependencies.countDistinctOwnersForPhone === "function"
  ) {
    try {
      const ownersCount = await dependencies.countDistinctOwnersForPhone({
        phone: phoneToCheck,
        userId: account?.id ?? null,
      });
      if (Number(ownersCount) >= 2) {
        reasons.push(
          buildSignal({
            code: RISK_SIGNAL_CODE.PHONE_REUSED_ACROSS_ACCOUNTS,
            severity: "high",
            scoreDelta: 45,
            message: `Telefone informado já vinculado a ${ownersCount} contas distintas.`,
            metadata: { ownersCount, phoneSuffix: phoneToCheck.slice(-4) },
          })
        );
      }
    } catch {
      // Lookup falhou: NÃO reprovar por isso. O sinal é defensivo.
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // 8. Alteração de campo estrutural (apenas se contexto sinaliza edição)
  // ─────────────────────────────────────────────────────────────────────
  if (ctx.structuralFieldChanges && Object.keys(ctx.structuralFieldChanges).length > 0) {
    reasons.push(
      buildSignal({
        code: RISK_SIGNAL_CODE.STRUCTURAL_FIELD_CHANGE,
        severity: "high",
        scoreDelta: 40,
        message: "Alteração em campos estruturais detectada — revisão obrigatória.",
        metadata: { fields: Object.keys(ctx.structuralFieldChanges) },
      })
    );
  }

  // ─────────────────────────────────────────────────────────────────────
  // Agregação
  // ─────────────────────────────────────────────────────────────────────
  const rawScore = reasons.reduce((acc, r) => acc + (r.scoreDelta || 0), 0);
  const riskScore = Math.max(0, Math.min(100, Math.round(rawScore)));
  const riskLevel = scoreToLevel(riskScore);

  const hasHighOrCritical = reasons.some(
    (r) => r.severity === "high" || r.severity === "critical"
  );

  const shouldRejectImmediately = priceInvalid;
  const shouldSendToReview =
    !shouldRejectImmediately &&
    (fipeForcesReview ||
      fipeForcesCritical ||
      hasHighOrCritical ||
      riskScore >= RISK_SCORE_REVIEW_THRESHOLD);

  return {
    riskScore,
    riskLevel,
    shouldSendToReview,
    shouldRejectImmediately,
    reasons,
    fipeDiffPercent,
    fipeReferenceValue: fipeValue,
  };
}
