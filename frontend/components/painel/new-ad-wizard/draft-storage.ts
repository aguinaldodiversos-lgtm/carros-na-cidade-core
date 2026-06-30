/**
 * Persistência do rascunho do wizard de anúncio em localStorage, com POSSE
 * por usuário (defesa em profundidade contra vazamento de PII entre contas no
 * mesmo navegador).
 *
 * O rascunho carrega campos de contato sensíveis (whatsapp, phone, plateFinal,
 * draftPhotoUrls). Duas camadas garantem que o rascunho de um usuário NUNCA
 * seja reidratado para outro:
 *   1. Limpeza no auth (login/logout/registro) — ver lib/auth/client-session-reset.ts,
 *      que remove exatamente WIZARD_STORAGE_KEY.
 *   2. Posse por usuário (este módulo): o rascunho guarda o `ownerId` e só é
 *      reidratado quando `ownerId` bate com o usuário logado confirmado. Se a
 *      camada 1 falhar, a camada 2 ainda barra o vazamento.
 */

import { WIZARD_STORAGE_KEY, type WizardFormState } from "./types";

export type StoredWizardDraft = {
  /** Id do usuário dono do rascunho (string da sessão). Null = desconhecido. */
  ownerId: string | null;
  form: Partial<WizardFormState>;
};

/**
 * Lê o rascunho persistido. Aceita o formato novo (`{ ownerId, form }`) e o
 * legado (o `form` gravado direto, sem wrapper) — neste caso `ownerId` é null
 * (desconhecido), o que faz `draftBelongsTo` retornar false e o rascunho NÃO
 * ser reidratado (seguro).
 */
export function readWizardDraft(): StoredWizardDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(WIZARD_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;

    if ("form" in (parsed as Record<string, unknown>)) {
      const wrapper = parsed as { ownerId?: unknown; form?: unknown };
      const form =
        wrapper.form && typeof wrapper.form === "object"
          ? (wrapper.form as Partial<WizardFormState>)
          : {};
      return {
        ownerId: typeof wrapper.ownerId === "string" ? wrapper.ownerId : null,
        form,
      };
    }

    // Formato legado: o objeto persistido É o form (sem dono conhecido).
    return { ownerId: null, form: parsed as Partial<WizardFormState> };
  } catch {
    return null;
  }
}

/** Grava o rascunho carimbando o dono atual (null quando ainda não confirmado). */
export function writeWizardDraft(ownerId: string | null, form: WizardFormState): void {
  if (typeof window === "undefined") return;
  try {
    const payload: StoredWizardDraft = { ownerId, form };
    window.localStorage.setItem(WIZARD_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore — quota/modo privado não devem quebrar o fluxo
  }
}

/** Remove o rascunho persistido (mesma chave usada por todo o fluxo). */
export function clearWizardDraft(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(WIZARD_STORAGE_KEY);
  } catch {
    // ignore
  }
}

/**
 * Só pode reidratar quando o dono do rascunho é EXATAMENTE o usuário logado
 * confirmado. Dono nulo (legado/desconhecido), usuário não confirmado, ou
 * ids diferentes → false (não reidrata; o caller descarta o rascunho).
 */
export function draftBelongsTo(
  draft: StoredWizardDraft | null,
  currentUserId: string | null
): boolean {
  return Boolean(
    draft && draft.ownerId != null && currentUserId != null && draft.ownerId === currentUserId
  );
}
