/** Manter alinhado a `WIZARD_STORAGE_KEY` em `new-ad-wizard/types.ts`. */
const WIZARD_DRAFT_STORAGE_KEY = "carros-na-cidade:new-ad-wizard:v1";

/**
 * Limpa artefactos no browser que não são o cookie httpOnly (limpo só via `/api/auth/logout`).
 * Chamar após logout bem-sucedido ou antes de um novo login para evitar estado velho.
 */
export function clearClientAuthArtifacts() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(WIZARD_DRAFT_STORAGE_KEY);
  } catch {
    // ignore
  }
  try {
    window.sessionStorage.clear();
  } catch {
    // ignore
  }
}
