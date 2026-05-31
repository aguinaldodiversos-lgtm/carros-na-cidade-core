/**
 * Helpers puros de exibição de anúncios no painel admin.
 *
 * Fase 3.3: o ranking comercial (commercialLayerExpr em
 * src/modules/ads/filters/ads-ranking.sql.js) decide a ordem pública via
 * `highlight_until > NOW()` (camada 4) + plano (Pro 3 / Start 2 / Free 1),
 * usando `priority` apenas como tiebreaker dentro da camada.
 *
 * O label "Prioridade" exibido na lista de anúncios admin estava sendo
 * confundido com peso comercial — alguns operadores acreditavam que valores
 * altos representavam destaque. O campo é, na prática, uma prioridade interna
 * manual ajustada via PATCH /ads/:id/priority. Para reduzir confusão:
 *  - rotular como "Prioridade interna";
 *  - destacar visualmente anúncios com `highlight_until > now()` por badge
 *    independente (não dependente do número de priority).
 */

export const ADMIN_PRIORITY_COLUMN_LABEL = "Prioridade interna";

export const ADMIN_PRIORITY_COLUMN_HINT =
  "Eixo manual interno (PATCH /admin/ads/:id/priority). Não define peso comercial — o destaque ativo é exibido em coluna própria e tem peso 4 no ranking.";

/**
 * Anúncio está atualmente em destaque comercial? Verifica `highlight_until`
 * contra um `now` injetável (default `Date.now()`). Aceita strings ISO ou null.
 *
 * Como o ranking público usa `highlight_until > NOW()` (comparação SQL com
 * o relógio do banco), este helper aceita uma referência de tempo configurável
 * para testes reproduzíveis e para o caso em que o frontend queira sincronizar
 * com o servidor (não usamos isso ainda — Date.now() local é suficiente para
 * a UX da lista admin).
 */
export function isHighlightActive(
  highlightUntil: string | null | undefined,
  nowMs: number = Date.now()
): boolean {
  if (!highlightUntil) return false;
  const ts = Date.parse(highlightUntil);
  if (!Number.isFinite(ts)) return false;
  return ts > nowMs;
}
