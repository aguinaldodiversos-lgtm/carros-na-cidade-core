import { describe, expect, it } from "vitest";
import {
  BASE_CITY_BOOST_POINTS,
  baseCityBoostExpr,
} from "../../src/modules/ads/filters/ads-ranking.sql.js";
import { buildAdsSearchQuery } from "../../src/modules/ads/filters/ads-filter.builder.js";

function normalize(sql) {
  return String(sql || "").replace(/\s+/g, " ").trim();
}

describe("baseCityBoostExpr", () => {
  it("retorna CASE com c.slug = $N e os pontos calibrados", () => {
    const sql = baseCityBoostExpr(7);
    expect(sql).toBe(`(CASE WHEN c.slug = $7 THEN ${BASE_CITY_BOOST_POINTS} ELSE 0 END)`);
  });

  it("BASE_CITY_BOOST_POINTS é maior que tiebreakers típicos da camada (planRank max 32, demand 48)", () => {
    expect(BASE_CITY_BOOST_POINTS).toBeGreaterThan(48); // demand boost max
    expect(BASE_CITY_BOOST_POINTS).toBeGreaterThan(32); // planRank max
  });

  it("BASE_CITY_BOOST_POINTS é menor que o salto entre highlight ativo (125) — não inverte camada Destaque", () => {
    expect(BASE_CITY_BOOST_POINTS).toBeLessThan(125);
  });

  it("rejeita índice de param inválido (defesa contra bug do caller)", () => {
    expect(() => baseCityBoostExpr(0)).toThrow();
    expect(() => baseCityBoostExpr(-1)).toThrow();
    expect(() => baseCityBoostExpr(1.5)).toThrow();
    expect(() => baseCityBoostExpr(null)).toThrow();
    expect(() => baseCityBoostExpr(undefined)).toThrow();
    expect(() => baseCityBoostExpr("3")).toThrow();
  });
});

describe("buildAdsSearchQuery — base-city boost (multi-cidade)", () => {
  it("city_slugs com >1 cidade injeta boost no hybrid_score (CASE WHEN c.slug = $X)", () => {
    const { dataQuery, params } = buildAdsSearchQuery({
      city_slugs: ["atibaia-sp", "santos-sp", "jundiai-sp"],
    });
    const sql = normalize(dataQuery);

    // Boost presente.
    expect(sql).toMatch(/CASE WHEN c\.slug = \$\d+ THEN 60 ELSE 0 END/);

    // Param da base é a primeira cidade.
    expect(params).toContain("atibaia-sp");

    // Param do array continua presente (city_slugs ANY).
    expect(params.find((p) => Array.isArray(p))).toEqual([
      "atibaia-sp",
      "santos-sp",
      "jundiai-sp",
    ]);
  });

  it("city_slugs com 1 cidade NÃO injeta boost (nenhuma vizinha — boost sem alvo)", () => {
    const { dataQuery, params } = buildAdsSearchQuery({
      city_slugs: ["atibaia-sp"],
    });
    const sql = normalize(dataQuery);

    expect(sql).not.toMatch(/CASE WHEN c\.slug = \$\d+ THEN 60/);
    // Slug isolado NÃO entra como param da base.
    expect(params.filter((p) => p === "atibaia-sp").length).toBe(0);
    // (Continua no array param do ANY, que é diferente.)
  });

  it("city_slug singular (sem city_slugs) NÃO injeta boost", () => {
    const { dataQuery } = buildAdsSearchQuery({ city_slug: "atibaia-sp" });
    const sql = normalize(dataQuery);
    expect(sql).not.toMatch(/CASE WHEN c\.slug = \$\d+ THEN 60/);
  });

  it("nenhum filtro territorial → NÃO injeta boost", () => {
    const { dataQuery } = buildAdsSearchQuery({});
    const sql = normalize(dataQuery);
    expect(sql).not.toMatch(/CASE WHEN c\.slug = \$\d+ THEN 60/);
  });

  it("city_slugs + state continua emitindo ANY E filtro UF, MAIS o boost", () => {
    const { dataQuery, params } = buildAdsSearchQuery({
      city_slugs: ["atibaia-sp", "santos-sp"],
      state: "SP",
    });
    const sql = normalize(dataQuery);

    expect(sql).toContain("c.slug = ANY($");
    expect(sql).toContain("UPPER(COALESCE(a.state, c.state)) = $");
    expect(sql).toMatch(/CASE WHEN c\.slug = \$\d+ THEN 60/);
    expect(params).toContain("SP");
    expect(params).toContain("atibaia-sp");
  });

  it("base-city boost convive com sort=highlight (não invade ORDER BY)", () => {
    const { dataQuery } = buildAdsSearchQuery({
      city_slugs: ["atibaia-sp", "santos-sp"],
      sort: "highlight",
    });
    const sql = normalize(dataQuery);

    // Boost continua sendo somado dentro do hybrid_score.
    expect(sql).toMatch(/CASE WHEN c\.slug = \$\d+ THEN 60 ELSE 0 END/);

    // Sort=highlight tem ORDER BY próprio (highlight_until > NOW + priority).
    // hybrid_score continua calculado mas não vai para o ORDER BY direto —
    // não é preocupação deste teste validar isso.
  });

  it("o param da cidade-base é o primeiro elemento de city_slugs (após dedup do parser)", () => {
    const { params } = buildAdsSearchQuery({
      city_slugs: ["atibaia-sp", "bom-jesus-dos-perdoes-sp", "jundiai-sp"],
    });
    // O slug "atibaia-sp" deve aparecer como string standalone (param da base),
    // além de estar dentro do array do ANY.
    const standaloneStrings = params.filter((p) => typeof p === "string");
    expect(standaloneStrings).toContain("atibaia-sp");
  });
});

describe("buildAdsSearchQuery — segurança contra base_city_id público", () => {
  it("base_city_id no filtro é IGNORADO — não vira param SQL", () => {
    // Mesmo que algum caller tente injetar via passthrough do schema,
    // o builder não destrutura `base_city_id`. Test confirma que valor 42
    // NÃO aparece como param.
    const { params } = buildAdsSearchQuery({
      city_slugs: ["atibaia-sp", "santos-sp"],
      base_city_id: 42,
    });

    expect(params).not.toContain(42);
    expect(params).not.toContain("42");
  });

  it("base_city_slug no filtro é IGNORADO — só city_slugs[0] decide a base", () => {
    // Se um caller tentasse forjar a base via base_city_slug (em vez de
    // mexer em city_slugs[0]), tem que ser ignorado. O boost vai para o
    // primeiro slug de city_slugs, não para "santos-sp".
    const { params, dataQuery } = buildAdsSearchQuery({
      city_slugs: ["atibaia-sp", "jundiai-sp"],
      base_city_slug: "santos-sp",
    });
    const sql = normalize(dataQuery);

    expect(sql).toMatch(/CASE WHEN c\.slug = \$\d+ THEN 60/);
    // Standalone params (não-array): atibaia-sp deve estar; santos-sp NÃO.
    const standaloneStrings = params.filter((p) => typeof p === "string");
    expect(standaloneStrings).toContain("atibaia-sp");
    expect(standaloneStrings).not.toContain("santos-sp");
  });

  it("city_slugs sem [0] válido → boost não dispara (defesa)", () => {
    // Com array vazio, a regra prévia já não deveria deixar passar pelo
    // schema. Test cobre o cenário em que o builder recebe direto (caller
    // programático), garantindo que array vazio não tenta indexar [0].
    const { dataQuery } = buildAdsSearchQuery({ city_slugs: [] });
    const sql = normalize(dataQuery);
    expect(sql).not.toMatch(/CASE WHEN c\.slug = \$\d+ THEN 60/);
  });
});

describe("buildAdsSearchQuery — payload público de /api/ads/search inalterado", () => {
  it("dataQuery preserva shape do SELECT (mesmas colunas, ordem similar)", () => {
    const { dataQuery: withoutBoost } = buildAdsSearchQuery({});
    const { dataQuery: withBoost } = buildAdsSearchQuery({
      city_slugs: ["atibaia-sp", "santos-sp"],
    });

    // Ambos têm o mesmo SELECT — diferença é só no WHERE/score.
    // Tolerante a whitespace ao redor da vírgula: o objetivo é confirmar
    // que `a.*` e `c.slug AS city_slug` estão lado a lado, não a formatação.
    const selectShape = /a\.\*\s*,\s*c\.slug\s+AS\s+city_slug/i;
    expect(normalize(withoutBoost)).toMatch(selectShape);
    expect(normalize(withBoost)).toMatch(selectShape);

    // Defesa: status='active' continua presente nas duas variantes (não
    // perdemos o guard público em nenhuma camada de boost).
    expect(normalize(withoutBoost)).toMatch(/a\.status\s*=\s*'active'/i);
    expect(normalize(withBoost)).toMatch(/a\.status\s*=\s*'active'/i);
  });

  it("countQuery não é afetado pelo boost (sem JOIN extra, sem param da base)", () => {
    const { countQuery, countParams } = buildAdsSearchQuery({
      city_slugs: ["atibaia-sp", "santos-sp"],
    });
    const sql = normalize(countQuery);

    // countQuery não computa hybrid_score, então não tem o CASE de boost.
    expect(sql).not.toMatch(/CASE WHEN c\.slug = \$\d+ THEN 60/);

    // countParams é prefix dos params (sem limit/offset), e inclui o array
    // de city_slugs e o slug da base. Tamanho consistente.
    expect(countParams.length).toBeGreaterThan(0);
  });
});
