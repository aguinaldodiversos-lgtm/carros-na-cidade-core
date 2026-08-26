/**
 * Espelho do catálogo de motivos de bloqueio administrativo.
 *
 * Fonte da verdade: `src/shared/moderation/ad-block-reasons.js`. Este arquivo
 * existe porque o modal do admin precisa dos rótulos em tempo de render e o
 * frontend não importa do backend. A sincronia é travada por
 * `tests/admin/ad-block-reasons-sync.test.js` — mexer num lado sem mexer no
 * outro quebra o teste.
 *
 * O `ownerLabel` está aqui só para o teste de sincronia poder compará-lo. A UI
 * do anunciante NÃO traduz nada: o texto que o dono lê vem pronto do backend
 * (`moderation.blocked_message`), justamente para que um descuido no cliente
 * não exiba o rótulo interno a quem não deve vê-lo.
 */

export type AdBlockReasonCode =
  | "incorrect_information"
  | "suspected_fraud"
  | "vehicle_unavailable"
  | "misleading_price_or_condition"
  | "invalid_photos"
  | "duplicate_ad"
  | "terms_violation"
  | "other";

export type AdBlockReason = {
  code: AdBlockReasonCode;
  adminLabel: string;
  ownerLabel: string;
};

export const AD_BLOCK_REASONS: readonly AdBlockReason[] = [
  {
    code: "incorrect_information",
    adminLabel: "Informação incorreta",
    ownerLabel: "Informações do anúncio precisam ser verificadas.",
  },
  {
    code: "suspected_fraud",
    adminLabel: "Possível fraude",
    ownerLabel: "Informações do anúncio precisam ser verificadas.",
  },
  {
    code: "vehicle_unavailable",
    adminLabel: "Veículo possivelmente indisponível",
    ownerLabel: "A disponibilidade do veículo precisa ser confirmada.",
  },
  {
    code: "misleading_price_or_condition",
    adminLabel: "Preço ou condição enganosa",
    ownerLabel: "O preço ou as condições informadas precisam ser revisados.",
  },
  {
    code: "invalid_photos",
    adminLabel: "Fotos inadequadas ou incompatíveis",
    ownerLabel: "As fotos do anúncio precisam ser revisadas.",
  },
  {
    code: "duplicate_ad",
    adminLabel: "Anúncio duplicado",
    ownerLabel: "Este anúncio parece estar duplicado no portal.",
  },
  {
    code: "terms_violation",
    adminLabel: "Violação dos termos de uso",
    ownerLabel: "O anúncio não está de acordo com os termos de uso.",
  },
  {
    code: "other",
    adminLabel: "Outro motivo",
    ownerLabel: "Este anúncio está em revisão pela administração.",
  },
] as const;

export const AD_BLOCK_REASON_CODES: readonly string[] = AD_BLOCK_REASONS.map((r) => r.code);

/** Motivos que exigem descrição administrativa obrigatória. */
export const AD_BLOCK_REASON_REQUIRES_NOTE: readonly string[] = ["other"];

export const AD_BLOCK_NOTE_MAX_LENGTH = 500;
export const AD_BLOCK_NOTE_MIN_LENGTH = 3;

export function requiresNote(code: string): boolean {
  return AD_BLOCK_REASON_REQUIRES_NOTE.includes(code);
}

export function adminLabelForReasonCode(code: string | null | undefined): string {
  const found = AD_BLOCK_REASONS.find((r) => r.code === code);
  return found ? found.adminLabel : "Outro motivo";
}
