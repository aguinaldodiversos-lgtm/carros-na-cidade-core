import { STEP_COUNT } from "./types";

/**
 * Resolve o passo inicial do wizard de anúncio (índice 0..STEP_COUNT-1).
 *
 * Regra (corrige o bug de "anúncio começando no passo Preço"):
 *  - Se a URL traz `?step=` explícito e válido (1..STEP_COUNT), ele MANDA.
 *    Cobre o refresh no meio do fluxo (a navegação grava `?step=` na URL) e o
 *    retorno do /login quando o `next` preserva o `?step=`.
 *  - Caso contrário, SEMPRE começa em Veículo (0). O rascunho persistido em
 *    localStorage continua pré-preenchendo os campos, mas NÃO controla mais o
 *    passo — antes o `parsed.step` era usado como fallback, fazendo um "novo
 *    anúncio" reabrir no meio (ex.: Preço) de um rascunho abandonado.
 *
 * @param urlStepParam valor cru de `?step=` (1-indexado) ou null.
 */
export function resolveInitialStep(urlStepParam: string | null | undefined): number {
  const n = urlStepParam != null && urlStepParam !== "" ? Number.parseInt(urlStepParam, 10) : NaN;
  if (Number.isFinite(n) && n >= 1 && n <= STEP_COUNT) {
    return n - 1;
  }
  return 0;
}
