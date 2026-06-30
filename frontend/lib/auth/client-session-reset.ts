// Importa a MESMA constante usada pelo wizard — fonte única, sem string
// literal duplicada (o bug anterior era ":v1" hardcoded aqui enquanto o wizard
// gravava em ":v3", de modo que o rascunho NUNCA era limpo no login/logout).
import { WIZARD_STORAGE_KEY } from "@/components/painel/new-ad-wizard/types";

/**
 * Limpa artefactos no browser que não são o cookie httpOnly (limpo só via `/api/auth/logout`).
 * Chamar após logout bem-sucedido ou antes de um novo login para evitar estado velho.
 */
export function clearClientAuthArtifacts() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(WIZARD_STORAGE_KEY);
  } catch {
    // ignore
  }
  try {
    window.sessionStorage.clear();
  } catch {
    // ignore
  }
}
