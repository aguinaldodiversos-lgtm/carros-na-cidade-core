import { commercialLayerExpr } from "./ads-ranking.sql.js";

/**
 * Ordenação da listagem (sort=…). Regras:
 *
 * - "relevance" (default): usa a camada comercial alvo Destaque > Pro > Start
 *   > Grátis (ver `commercialLayerExpr` em ads-ranking.sql.js). Sem busca
 *   textual, commercial_layer domina e hybrid_score é tiebreaker. Com busca
 *   textual (q), text_rank vira chave primária e commercial_layer desce para
 *   tiebreaker — preserva intenção do visitante.
 *
 * - "highlight": prioriza destaque ativo na ORDER BY (não confundir com filtro
 *   highlight_only que é WHERE). Mantém comportamento histórico — usuário pediu
 *   essa ordem explicitamente.
 *
 * - sort=price_asc, price_desc, year_asc, year_desc, mileage_asc, mileage_desc,
 *   recent: respeita a intenção explícita do visitante; commercial_layer NÃO é
 *   injetado aqui. Anúncios fora do filtro nunca entram por ser Pro/Destaque
 *   (filtro é WHERE, não score).
 */
export function buildSortClause(sort = "relevance", { useTextRank = false } = {}) {
  switch (sort) {
    case "recent":
      return "a.created_at DESC, a.id DESC";
    case "price_asc":
      return "a.price ASC NULLS LAST, a.created_at DESC";
    case "price_desc":
      return "a.price DESC NULLS LAST, a.created_at DESC";
    case "year_desc":
      return "a.year DESC NULLS LAST, a.created_at DESC";
    case "year_asc":
      return "a.year ASC NULLS LAST, a.created_at DESC";
    case "mileage_asc":
      return "a.mileage ASC NULLS LAST, a.created_at DESC";
    case "mileage_desc":
      return "a.mileage DESC NULLS LAST, a.created_at DESC";
    case "highlight":
      return `
        (CASE WHEN a.highlight_until > NOW() THEN 1 ELSE 0 END) DESC,
        a.priority DESC NULLS LAST,
        a.created_at DESC
      `;
    case "relevance":
    default:
      if (useTextRank) {
        // Busca textual: text_rank é a intenção explícita do visitante e tem
        // que dominar. commercial_layer entra como tiebreaker comercial dentro
        // do mesmo nível textual, e hybrid_score depois.
        return `
          text_rank DESC,
          ${commercialLayerExpr} DESC,
          hybrid_score DESC,
          a.created_at DESC
        `;
      }
      // Catálogo/territorial sem busca textual: política comercial alvo
      // (Destaque > Pro > Start > Grátis) domina, hybrid_score combina sinais
      // territoriais (demand, CTR, recência) como tiebreaker dentro da camada.
      return `
        ${commercialLayerExpr} DESC,
        hybrid_score DESC,
        a.created_at DESC
      `;
  }
}
