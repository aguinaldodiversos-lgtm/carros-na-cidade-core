/**
 * Constantes da concessão MANUAL de plano (admin → anunciante).
 *
 * Centraliza limites, vocabulário de motivo e rótulos de origem usados
 * pelo serviço (advertiser-plan-grant.service.js) e espelhados no modal
 * do frontend. NÃO depende de banco nem de Mercado Pago.
 */

/** Proveniência gravada em user_subscriptions.source para concessões manuais. */
export const GRANT_SOURCE = "admin_grant";

/**
 * Tetos de duração (Fase atual). 4 meses = 120 dias; personalizado limitado
 * a 120 dias. Bloqueia concessão "infinita" por acidente.
 */
export const MAX_GRANT_MONTHS = 4;
export const MAX_GRANT_DAYS = 120;
/** Quantos dias 1 "mês" de concessão representa (alinhado a validity_days=30). */
export const DAYS_PER_MONTH = 30;

/** Motivos aceitos (grant_reason_type). Validação fechada — sem valor arbitrário. */
export const GRANT_REASON_TYPES = Object.freeze([
  "trial",
  "courtesy",
  "gift",
  "retention",
  "correction",
  "negotiation",
  "other",
]);

/** Rótulo longo (modal / auditoria). */
export const GRANT_REASON_LABELS = Object.freeze({
  trial: "Teste grátis",
  courtesy: "Cortesia comercial",
  gift: "Brinde",
  retention: "Retenção de cliente",
  correction: "Correção administrativa",
  negotiation: "Negociação manual",
  other: "Outro",
});

/**
 * Rótulo curto de ORIGEM exibido no resumo do anunciante
 * ("Origem do plano"). Mapeia o motivo → uma palavra de exibição.
 */
export const GRANT_ORIGIN_LABELS = Object.freeze({
  trial: "Teste grátis",
  courtesy: "Cortesia",
  gift: "Brinde",
  retention: "Retenção",
  correction: "Correção",
  negotiation: "Negociação",
  other: "Manual",
});

export function reasonLabel(reasonType) {
  return GRANT_REASON_LABELS[reasonType] || "Manual";
}

export function originLabel(reasonType) {
  return GRANT_ORIGIN_LABELS[reasonType] || "Manual";
}
