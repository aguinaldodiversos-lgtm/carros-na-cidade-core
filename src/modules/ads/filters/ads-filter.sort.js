/**
 * Ordenação da listagem (sort=…). O valor "highlight" prioriza destaque na ORDER BY;
 * não é o filtro highlight_only (WHERE highlight_until).
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
      return `
        hybrid_score DESC,
        ${useTextRank ? "text_rank DESC," : ""}
        a.created_at DESC
      `;
  }
}
