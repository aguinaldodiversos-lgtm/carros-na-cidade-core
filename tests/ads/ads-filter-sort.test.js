import { describe, expect, it } from "vitest";
import { buildSortClause } from "../../src/modules/ads/filters/ads-filter.sort.js";
import {
  cityDemandBoostExpr,
  commercialLayerExpr,
  commercialLayerFor,
  planRankExpr,
} from "../../src/modules/ads/filters/ads-ranking.sql.js";

function normalize(sql) {
  return String(sql || "")
    .replace(/\s+/g, " ")
    .trim();
}

describe("commercialLayerExpr (data-driven por weight, pós-039)", () => {
  const sql = normalize(commercialLayerExpr);

  it("é GREATEST(boost_se_ativo, COALESCE(sp.weight,1)) — camada vem do weight do plano", () => {
    expect(sql).toMatch(/^GREATEST\(/);
    expect(sql).toContain("COALESCE(sp.weight, 1)");
  });

  it("boost/destaque ativo é o topo FIXO = BOOST_LAYER_WEIGHT (4)", () => {
    expect(sql).toContain("WHEN a.highlight_until > NOW() THEN 4 ELSE 0 END");
  });

  it("NÃO usa mais priority_level para definir a camada", () => {
    expect(sql).not.toContain("priority_level");
  });

  it("piso = 1 via COALESCE (plano nulo/legado nunca cai em 0)", () => {
    expect((sql.match(/COALESCE\(sp\.weight, 1\)/g) || []).length).toBe(1);
    expect(sql).not.toMatch(/COALESCE\(sp\.weight, 0\)/);
  });
});

describe("commercialLayerFor (espelho JS) — ordenação decimal e regressão", () => {
  it("REGRESSÃO: pesos atuais reproduzem exatamente a ordem de hoje", () => {
    expect(commercialLayerFor({ weight: 1 })).toBe(1); // Grátis
    expect(commercialLayerFor({ weight: 2 })).toBe(2); // Start
    expect(commercialLayerFor({ weight: 3 })).toBe(3); // Pro
    // Destaque ativo é o topo, sobre qualquer plano.
    expect(commercialLayerFor({ highlightActive: true, weight: 1 })).toBe(4);
    expect(commercialLayerFor({ highlightActive: true, weight: 3 })).toBe(4);
    // Ordem estrita preservada.
    const order = [1, 2, 3, 4];
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("weight=3.5 fica ESTRITAMENTE entre Pro (3.0) e boost (4.0)", () => {
    const layer = commercialLayerFor({ weight: 3.5 });
    expect(layer).toBe(3.5);
    expect(layer).toBeGreaterThan(3);
    expect(layer).toBeLessThan(4);
  });

  it("3.4 < 3.5 < 3.6 mantém ordem relativa entre planos decimais", () => {
    const a = commercialLayerFor({ weight: 3.4 });
    const b = commercialLayerFor({ weight: 3.5 });
    const c = commercialLayerFor({ weight: 3.6 });
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(c);
  });

  it("weight nulo/indefinido → piso 1 (COALESCE)", () => {
    expect(commercialLayerFor({ weight: null })).toBe(1);
    expect(commercialLayerFor({})).toBe(1);
  });

  it("sincronia: o espelho JS bate com a fórmula do SQL (boost 4 + COALESCE weight 1)", () => {
    const sql = normalize(commercialLayerExpr);
    expect(sql).toContain("THEN 4"); // BOOST_LAYER_WEIGHT
    expect(sql).toContain("COALESCE(sp.weight, 1)");
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
    expect(normalize(buildSortClause("year_asc"))).toBe("a.year ASC NULLS LAST, a.created_at DESC");
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
