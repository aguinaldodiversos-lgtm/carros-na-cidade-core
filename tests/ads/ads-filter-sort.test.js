import { describe, expect, it } from "vitest";
import { buildSortClause } from "../../src/modules/ads/filters/ads-filter.sort.js";
import {
  cityDemandBoostExpr,
  commercialLayerExpr,
  planRankExpr,
} from "../../src/modules/ads/filters/ads-ranking.sql.js";

function normalize(sql) {
  return String(sql || "").replace(/\s+/g, " ").trim();
}

describe("commercialLayerExpr", () => {
  const sql = normalize(commercialLayerExpr);

  it("é uma expressão CASE com 4 ramos discretos", () => {
    expect(sql).toMatch(/^\(CASE/);
    expect(sql).toMatch(/END\)$/);
    expect((sql.match(/WHEN /g) || []).length).toBe(3);
  });

  it("camada 4 = highlight ativo (highlight_until > NOW)", () => {
    expect(sql).toContain("WHEN a.highlight_until > NOW() THEN 4");
  });

  it("camada 3 = Pro com priority_level >= 80", () => {
    expect(sql).toContain("WHEN COALESCE(sp.priority_level, 0) >= 80 THEN 3");
  });

  it("camada 2 = Start com priority_level >= 50", () => {
    expect(sql).toContain("WHEN COALESCE(sp.priority_level, 0) >= 50 THEN 2");
  });

  it("ELSE 1 cobre Grátis, plano nulo e plano legado", () => {
    expect(sql).toContain("ELSE 1");
  });

  it("usa COALESCE para tratar plan_id NULL como camada 1", () => {
    // sp.priority_level pode ser NULL via LEFT JOIN — COALESCE evita que
    // anúncios sem plano caiam por NULL > number = unknown.
    expect((sql.match(/COALESCE\(sp\.priority_level, 0\)/g) || []).length).toBe(2);
  });
});

describe("planRankExpr e cityDemandBoostExpr (regressão de imports)", () => {
  it("planRankExpr ainda exporta como função/string consumível pelo builder", () => {
    expect(typeof planRankExpr).toBe("string");
    expect(planRankExpr).toContain("sp.priority_level");
  });

  it("cityDemandBoostExpr ainda exporta como string", () => {
    expect(typeof cityDemandBoostExpr).toBe("string");
    expect(cityDemandBoostExpr).toContain("cm.demand_score");
  });
});

describe("buildSortClause — sort modes que NÃO mudam (intenção explícita do visitante)", () => {
  it("recent continua ORDER BY created_at DESC, id DESC", () => {
    const clause = normalize(buildSortClause("recent"));
    expect(clause).toBe("a.created_at DESC, a.id DESC");
    // commercial_layer NÃO entra: usuário pediu ordem cronológica.
    expect(clause).not.toContain("priority_level");
    expect(clause).not.toContain("highlight_until");
  });

  it("price_asc continua price ASC NULLS LAST, created_at DESC", () => {
    expect(normalize(buildSortClause("price_asc"))).toBe(
      "a.price ASC NULLS LAST, a.created_at DESC"
    );
  });

  it("price_desc continua price DESC NULLS LAST, created_at DESC", () => {
    expect(normalize(buildSortClause("price_desc"))).toBe(
      "a.price DESC NULLS LAST, a.created_at DESC"
    );
  });

  it("year_asc/year_desc/mileage_asc/mileage_desc seguem comportamento original", () => {
    expect(normalize(buildSortClause("year_asc"))).toBe(
      "a.year ASC NULLS LAST, a.created_at DESC"
    );
    expect(normalize(buildSortClause("year_desc"))).toBe(
      "a.year DESC NULLS LAST, a.created_at DESC"
    );
    expect(normalize(buildSortClause("mileage_asc"))).toBe(
      "a.mileage ASC NULLS LAST, a.created_at DESC"
    );
    expect(normalize(buildSortClause("mileage_desc"))).toBe(
      "a.mileage DESC NULLS LAST, a.created_at DESC"
    );
  });

  it("sort=highlight (escolhido pelo usuário) preserva comportamento histórico", () => {
    const clause = normalize(buildSortClause("highlight"));
    expect(clause).toContain("CASE WHEN a.highlight_until > NOW() THEN 1 ELSE 0 END) DESC");
    expect(clause).toContain("a.priority DESC NULLS LAST");
    expect(clause).toContain("a.created_at DESC");
  });
});

describe("buildSortClause — relevance (catálogo/territorial sem busca textual)", () => {
  const clause = normalize(buildSortClause("relevance", { useTextRank: false }));

  it("commercial_layer DESC é a chave primária", () => {
    // commercial_layer aparece antes de hybrid_score e de created_at.
    const layerIdx = clause.indexOf("highlight_until > NOW() THEN 4");
    const hybridIdx = clause.indexOf("hybrid_score DESC");
    const createdIdx = clause.indexOf("a.created_at DESC");
    expect(layerIdx).toBeGreaterThan(-1);
    expect(hybridIdx).toBeGreaterThan(layerIdx);
    expect(createdIdx).toBeGreaterThan(hybridIdx);
  });

  it("não inclui text_rank (não há busca textual)", () => {
    expect(clause).not.toContain("text_rank");
  });

  it("default (sort omitido) coincide com sort=relevance", () => {
    expect(normalize(buildSortClause())).toBe(clause);
    expect(normalize(buildSortClause(undefined))).toBe(clause);
  });
});

describe("buildSortClause — relevance (busca textual ativa)", () => {
  const clause = normalize(buildSortClause("relevance", { useTextRank: true }));

  it("text_rank DESC é a chave primária (intenção do visitante manda)", () => {
    const textIdx = clause.indexOf("text_rank DESC");
    const layerIdx = clause.indexOf("highlight_until > NOW() THEN 4");
    expect(textIdx).toBe(0);
    expect(layerIdx).toBeGreaterThan(textIdx);
  });

  it("commercial_layer entra como tiebreaker comercial DENTRO do mesmo nível textual", () => {
    const layerIdx = clause.indexOf("highlight_until > NOW() THEN 4");
    const hybridIdx = clause.indexOf("hybrid_score DESC");
    expect(layerIdx).toBeGreaterThan(-1);
    expect(hybridIdx).toBeGreaterThan(layerIdx);
  });

  it("hybrid_score continua presente como tiebreaker secundário", () => {
    expect(clause).toContain("hybrid_score DESC");
  });
});
