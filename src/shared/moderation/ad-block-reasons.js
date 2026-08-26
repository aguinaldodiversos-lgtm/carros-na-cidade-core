/**
 * Catálogo canônico dos motivos de bloqueio administrativo de anúncio
 * (Fase 4.10A).
 *
 * O CÓDIGO é a chave de domínio persistida em `ads.blocked_reason_code`.
 * Os rótulos pt-BR existem só para a interface — nunca persista tradução
 * como chave (mesma regra do catálogo de opcionais do veículo).
 *
 * Dois rótulos por motivo, de propósito:
 *
 *   adminLabel — o que o administrador escolhe no painel. Direto, inclusive
 *                quando a hipótese é grave ("Possível fraude").
 *   ownerLabel — o que o ANUNCIANTE lê no painel dele. Neutro e verificável.
 *                Uma acusação de fraude exibida ao dono como tal seria uma
 *                imputação que a plataforma ainda não apurou; o dono precisa
 *                saber o que revisar, não receber um veredito.
 *
 * O espelho para o frontend vive em `frontend/lib/moderation/ad-block-reasons.ts`
 * e é travado por teste de sincronia — alterar aqui exige alterar lá.
 */

export const AD_BLOCK_REASON = Object.freeze({
  INCORRECT_INFORMATION: "incorrect_information",
  SUSPECTED_FRAUD: "suspected_fraud",
  VEHICLE_UNAVAILABLE: "vehicle_unavailable",
  MISLEADING_PRICE_OR_CONDITION: "misleading_price_or_condition",
  INVALID_PHOTOS: "invalid_photos",
  DUPLICATE_AD: "duplicate_ad",
  TERMS_VIOLATION: "terms_violation",
  OTHER: "other",
});

/**
 * Ordem estável — a UI renderiza nesta sequência. `other` fica por último
 * porque é o único que exige descrição livre obrigatória.
 */
export const AD_BLOCK_REASONS = Object.freeze([
  Object.freeze({
    code: AD_BLOCK_REASON.INCORRECT_INFORMATION,
    adminLabel: "Informação incorreta",
    ownerLabel: "Informações do anúncio precisam ser verificadas.",
  }),
  Object.freeze({
    code: AD_BLOCK_REASON.SUSPECTED_FRAUD,
    adminLabel: "Possível fraude",
    ownerLabel: "Informações do anúncio precisam ser verificadas.",
  }),
  Object.freeze({
    code: AD_BLOCK_REASON.VEHICLE_UNAVAILABLE,
    adminLabel: "Veículo possivelmente indisponível",
    ownerLabel: "A disponibilidade do veículo precisa ser confirmada.",
  }),
  Object.freeze({
    code: AD_BLOCK_REASON.MISLEADING_PRICE_OR_CONDITION,
    adminLabel: "Preço ou condição enganosa",
    ownerLabel: "O preço ou as condições informadas precisam ser revisados.",
  }),
  Object.freeze({
    code: AD_BLOCK_REASON.INVALID_PHOTOS,
    adminLabel: "Fotos inadequadas ou incompatíveis",
    ownerLabel: "As fotos do anúncio precisam ser revisadas.",
  }),
  Object.freeze({
    code: AD_BLOCK_REASON.DUPLICATE_AD,
    adminLabel: "Anúncio duplicado",
    ownerLabel: "Este anúncio parece estar duplicado no portal.",
  }),
  Object.freeze({
    code: AD_BLOCK_REASON.TERMS_VIOLATION,
    adminLabel: "Violação dos termos de uso",
    ownerLabel: "O anúncio não está de acordo com os termos de uso.",
  }),
  Object.freeze({
    code: AD_BLOCK_REASON.OTHER,
    adminLabel: "Outro motivo",
    ownerLabel: "Este anúncio está em revisão pela administração.",
  }),
]);

export const AD_BLOCK_REASON_CODES = Object.freeze(AD_BLOCK_REASONS.map((r) => r.code));

/** Motivos que exigem descrição administrativa livre obrigatória (§ "Outro motivo"). */
export const AD_BLOCK_REASON_REQUIRES_NOTE = Object.freeze([AD_BLOCK_REASON.OTHER]);

/** Limite da observação administrativa — alinhado ao REASON_MAX_LENGTH do admin. */
export const AD_BLOCK_NOTE_MAX_LENGTH = 500;
export const AD_BLOCK_NOTE_MIN_LENGTH = 3;

export function isValidAdBlockReasonCode(code) {
  return AD_BLOCK_REASON_CODES.includes(code);
}

export function requiresNote(code) {
  return AD_BLOCK_REASON_REQUIRES_NOTE.includes(code);
}

/**
 * Rótulo destinado ao ANUNCIANTE. Código desconhecido (legado ou dado
 * corrompido) cai no texto genérico — nunca devolve o código cru nem
 * vaza a nota interna.
 */
export function ownerLabelForReasonCode(code) {
  const found = AD_BLOCK_REASONS.find((r) => r.code === code);
  return found ? found.ownerLabel : "Este anúncio está em revisão pela administração.";
}

/** Rótulo destinado ao ADMIN. Mesmo fallback defensivo. */
export function adminLabelForReasonCode(code) {
  const found = AD_BLOCK_REASONS.find((r) => r.code === code);
  return found ? found.adminLabel : "Outro motivo";
}
