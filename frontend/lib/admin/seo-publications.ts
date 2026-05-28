import type { SeoPublicationRow } from "./api";

/**
 * Helpers puros do fluxo de mutação de publicações SEO no painel admin.
 *
 * Extraídos do componente para serem testáveis sem render e para blindar o
 * bug encontrado na Fase 3.1: a tabela ordenava pelo retorno do backend
 * (updated_at DESC), então marcar uma linha como noindex movia-a para o topo
 * no reload — induzindo o operador a clicar na linha errada na ação seguinte
 * (atingiu #2/#4 ao tentar reverter #3).
 */

/**
 * Ordenação estável por id (ascendente). A linha NUNCA muda de posição após
 * uma mutação, independente do `updated_at` retornado pelo backend. Isso é o
 * que garante o critério "re-render/reordenação da tabela não pode trocar o
 * target".
 */
export function sortPublicationsById(rows: SeoPublicationRow[]): SeoPublicationRow[] {
  return [...rows].sort((a, b) => Number(a.id) - Number(b.id));
}

/**
 * Valor-alvo do toggle de indexação para a linha clicada.
 * - Linha INDEX  (is_indexable=true)  → botão "Noindex"  → alvo false
 * - Linha NOINDEX(is_indexable=false) → botão "Indexar"  → alvo true
 *
 * Explícito e puro: o componente não deve recomputar `!row.is_indexable`
 * inline em pontos diferentes (risco de divergência entre o rótulo do botão e
 * o payload enviado).
 */
export function nextIndexableValue(row: Pick<SeoPublicationRow, "is_indexable">): boolean {
  return !row.is_indexable;
}

/**
 * Update otimista local: troca `is_indexable` apenas da linha alvo (por id),
 * preservando a ordem e a posição de todas as outras linhas. Usado no lugar de
 * um reload completo — evita o "pulo" da linha e o flash de loading, e mantém
 * o targeting estável para a próxima ação do operador.
 */
export function applyIndexableUpdate(
  rows: SeoPublicationRow[],
  id: SeoPublicationRow["id"],
  isIndexable: boolean
): SeoPublicationRow[] {
  return rows.map((r) => (r.id === id ? { ...r, is_indexable: isIndexable } : r));
}
