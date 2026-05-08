/**
 * Thresholds de antifraude/moderação.
 *
 * Cada constante daqui é a fonte única para o adRiskService. Override via
 * env permitido para os limiares que mais variam em produção (preço↔FIPE,
 * score limite). Demais constantes são fixadas no código — alterar exige
 * PR explícito por implicarem mudança de política.
 */

function parseFloatOrFallback(value, fallback) {
  const parsed = Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseIntOrFallback(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Faixas de diferença percentual preço × FIPE (negativo = abaixo da FIPE).
 *
 * Regra oficial:
 *   diff > -20%  → sem sinal de risco de preço
 *   -29% .. -20% → WARNING (aumenta score, NÃO força review sozinho)
 *   -44% .. -30% → REVIEW (força PENDING_REVIEW)
 *   <= -45%     → CRITICAL (força PENDING_REVIEW + severidade crítica)
 *
 * Override via env: FIPE_WARNING_PCT, FIPE_REVIEW_PCT, FIPE_CRITICAL_PCT.
 * Valores são percentuais negativos (ex: -20 significa 20% abaixo da FIPE).
 */
export const FIPE_DIFF_THRESHOLDS = Object.freeze({
  WARNING_PCT: parseFloatOrFallback(process.env.FIPE_WARNING_PCT, -20),
  REVIEW_PCT: parseFloatOrFallback(process.env.FIPE_REVIEW_PCT, -30),
  CRITICAL_PCT: parseFloatOrFallback(process.env.FIPE_CRITICAL_PCT, -45),
});

/**
 * Score acima do qual o anúncio vai automaticamente para PENDING_REVIEW
 * mesmo sem nenhum sinal de severity ≥ high. Default 50.
 */
export const RISK_SCORE_REVIEW_THRESHOLD = parseIntOrFallback(
  process.env.RISK_SCORE_REVIEW_THRESHOLD,
  50
);

/**
 * Score acima do qual a severidade agregada é considerada CRITICAL.
 * Não força rejeição automática (apenas PRICE_INVALID rejeita); apenas
 * eleva o nível na UI/admin.
 */
export const RISK_SCORE_CRITICAL_THRESHOLD = parseIntOrFallback(
  process.env.RISK_SCORE_CRITICAL_THRESHOLD,
  80
);

/**
 * Limites de quantidade de imagens (acima do mínimo técnico de 1, que é
 * imposto no validator/contrato Zod). Abaixo destes thresholds, o sinal
 * `LOW_IMAGE_COUNT` é emitido.
 */
export const LOW_IMAGE_COUNT_THRESHOLD = parseIntOrFallback(
  process.env.LOW_IMAGE_COUNT_THRESHOLD,
  3
);

/**
 * Idade mínima de conta para não emitir o sinal `NEW_ACCOUNT`. Default 7
 * dias — alinhado a "anúncio postado nos primeiros 7 dias merece olhar
 * extra do admin".
 */
export const NEW_ACCOUNT_DAYS_THRESHOLD = parseIntOrFallback(
  process.env.NEW_ACCOUNT_DAYS_THRESHOLD,
  7
);

/**
 * Preço mínimo aceitável (R$). Abaixo disso é tratado como `PRICE_INVALID`
 * e gera rejeição imediata. NÃO é o piso comercial — é só uma sentinela
 * contra valores claramente impossíveis (R$ 1, R$ 100, R$ 999).
 */
export const PRICE_MIN_VALID_BRL = parseIntOrFallback(
  process.env.PRICE_MIN_VALID_BRL,
  1000
);

/**
 * Conversor uniforme de score numérico em risk_level textual.
 * Cubra os 4 níveis sem sobreposição.
 */
export function scoreToLevel(score) {
  const n = Number(score) || 0;
  if (n >= RISK_SCORE_CRITICAL_THRESHOLD) return "critical";
  if (n >= RISK_SCORE_REVIEW_THRESHOLD) return "high";
  if (n >= 25) return "medium";
  return "low";
}

/**
 * Códigos canônicos de sinal — qualquer caller que persistir signals deve
 * consumir esta constante. Strings em UPPER_SNAKE para audit/grep.
 */
export const RISK_SIGNAL_CODE = Object.freeze({
  PRICE_INVALID: "PRICE_INVALID",
  PRICE_BELOW_FIPE_WARNING: "PRICE_BELOW_FIPE_WARNING",
  PRICE_BELOW_FIPE_REVIEW: "PRICE_BELOW_FIPE_REVIEW",
  PRICE_FAR_BELOW_FIPE_CRITICAL: "PRICE_FAR_BELOW_FIPE_CRITICAL",
  FIPE_UNAVAILABLE: "FIPE_UNAVAILABLE",
  LOW_IMAGE_COUNT: "LOW_IMAGE_COUNT",
  PHONE_IN_DESCRIPTION: "PHONE_IN_DESCRIPTION",
  EXTERNAL_LINK_IN_DESCRIPTION: "EXTERNAL_LINK_IN_DESCRIPTION",
  NEW_ACCOUNT: "NEW_ACCOUNT",
  PHONE_REUSED_ACROSS_ACCOUNTS: "PHONE_REUSED_ACROSS_ACCOUNTS",
  STRUCTURAL_FIELD_CHANGE: "STRUCTURAL_FIELD_CHANGE",
});

/**
 * Códigos canônicos de evento de moderação (gravados em ad_moderation_events).
 */
export const MODERATION_EVENT = Object.freeze({
  RISK_SCORE_CALCULATED: "risk_score_calculated",
  SENT_TO_REVIEW: "sent_to_review",
  MODERATION_APPROVED: "moderation_approved",
  MODERATION_REJECTED: "moderation_rejected",
  CORRECTION_REQUESTED: "correction_requested",
  BOOST_BLOCKED_DUE_TO_STATUS: "boost_blocked_due_to_status",
  STRUCTURAL_FIELD_CHANGE_DETECTED: "structural_field_change_detected",
});
