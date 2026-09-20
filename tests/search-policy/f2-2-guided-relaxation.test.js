// tests/search-policy/f2-2-guided-relaxation.test.js
//
// F2.2-B1 — Guided Relaxation da DEC-26 (v3 §9), certificada em 2026-09-20.
//
// O que estes testes travam, e que a política anterior violava:
//
//   1. o degrau vem do ESTOQUE (boundary real), nunca de +15% / −2 / +25% /
//      "próximo anel de rings_manual";
//   2. o arredondamento é para cima e a BANDA sai do valor final — nunca do
//      boundary bruto (o crossing de preço prova a diferença);
//   3. a banda é categórica: `PEQUENA` com +1 vence `GRANDE` com +50;
//   4. a investigação até 150 km é lazy — com o alvo atingido, nenhuma query
//      de relaxação é disparada;
//   5. valor aplicado, `url_params` e valor que classifica a banda são o mesmo
//      número (V3-INV-063).

import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/shared/logger.js", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { logger } from "../../src/shared/logger.js";
import { SEARCH_POLICY_DEFAULT } from "../../src/modules/ads/search-policy/policy-config.js";
import {
  COST_BAND,
  classifyAbsoluteBand,
  classifyRelativeBand,
  compareRelaxations,
  rankRelaxations,
  resolveNumericConcession,
  roundUpToQuantum,
} from "../../src/modules/ads/search-policy/relaxation-policy.js";
import {
  buildBenefitQuery,
  buildBoundaryQuery,
  buildRelaxationVariants,
  computeRelaxations,
  concessionRadiusCap,
} from "../../src/modules/ads/search-policy/relaxations.js";
import { GEO_MODE } from "../../src/modules/ads/search-policy/scope-resolver.js";

const policy = SEARCH_POLICY_DEFAULT;
const R = policy.relaxations;

const ATIBAIA = { id: 1, slug: "atibaia-sp", name: "Atibaia", state: "SP" };

const ctxOf = (filters, { profile = "SEARCH_MODEL", target = 12, origin = ATIBAIA } = {}) => ({
  filters,
  origin,
  uf: "SP",
  intent: { profile, target, max_auto_radius: 75 },
});
const scopeOf = (effective_radius_km, geo_mode = GEO_MODE.AUTO_RADIUS) => ({
  geo_mode,
  effective_radius_km,
  liquidityRows: [],
});

/** db falso: devolve linhas fixas e registra as queries executadas. */
function fakeDb(rowsByCall) {
  const calls = [];
  return {
    calls,
    query: vi.fn(async (sql, params) => {
      calls.push({ sql, params });
      return { rows: [rowsByCall[calls.length - 1] ?? {}] };
    }),
  };
}

// ── Primitivas da política ───────────────────────────────────────────────────

describe("DEC-26 — arredondamento e bandas (puro)", () => {
  it("arredonda SEMPRE para cima, nunca para baixo", () => {
    expect(roundUpToQuantum(104800, 1000)).toBe(105000);
    expect(roundUpToQuantum(105000, 1000)).toBe(105000);
    expect(roundUpToQuantum(59200, 5000)).toBe(60000);
    expect(roundUpToQuantum(38.1, 5)).toBe(40);
  });

  it("preço: banda pela variação relativa, com as fronteiras 5% / 10%", () => {
    const bands = R.price;
    expect(classifyRelativeBand(100000, 105000, bands)).toBe(COST_BAND.SMALL); // +5% exato
    expect(classifyRelativeBand(100000, 106000, bands)).toBe(COST_BAND.MEDIUM); // +6%
    expect(classifyRelativeBand(100000, 110000, bands)).toBe(COST_BAND.MEDIUM); // +10% exato
    expect(classifyRelativeBand(100000, 110001, bands)).toBe(COST_BAND.LARGE);
  });

  it("km e distância: banda pela variação absoluta", () => {
    expect(classifyAbsoluteBand(10000, R.mileage)).toBe(COST_BAND.SMALL);
    expect(classifyAbsoluteBand(10001, R.mileage)).toBe(COST_BAND.MEDIUM);
    expect(classifyAbsoluteBand(25001, R.mileage)).toBe(COST_BAND.LARGE);
    expect(classifyAbsoluteBand(15, R.radius)).toBe(COST_BAND.SMALL);
    expect(classifyAbsoluteBand(25, R.radius)).toBe(COST_BAND.SMALL);
    expect(classifyAbsoluteBand(50, R.radius)).toBe(COST_BAND.MEDIUM);
    expect(classifyAbsoluteBand(125, R.radius)).toBe(COST_BAND.LARGE);
  });

  it("ano: 1 PEQUENA, 2 MEDIA, 3+ GRANDE", () => {
    expect(classifyAbsoluteBand(1, R.year)).toBe(COST_BAND.SMALL);
    expect(classifyAbsoluteBand(2, R.year)).toBe(COST_BAND.MEDIUM);
    expect(classifyAbsoluteBand(3, R.year)).toBe(COST_BAND.LARGE);
    expect(classifyAbsoluteBand(9, R.year)).toBe(COST_BAND.LARGE);
  });
});

describe("DEC-26 — a banda sai do VALOR FINAL, não do boundary bruto", () => {
  // Exemplos normativos da DEC-26.
  it("preço 100.000 · boundary 104.800 → final 105.000, +5%, PEQUENA", () => {
    expect(
      resolveNumericConcession({
        boundary: 104800,
        current: 100000,
        quantum: R.price.quantum,
        direction: "up",
        scale: "relative",
        bands: R.price,
      })
    ).toEqual({ final: 105000, delta: 5000, cost_band: COST_BAND.SMALL });
  });

  it("CROSSING: 100.500 · boundary 105.300 (+4,78%) → final 106.000 (+5,47%) = MEDIA", () => {
    // O boundary BRUTO está abaixo de 5% e classificaria PEQUENA; o valor que
    // o usuário realmente aceita está acima, e é ele que manda. Este é o caso
    // que a clarificação de 2026-09-20 acrescentou à DEC-26.
    const raw = (105300 - 100500) / 100500;
    expect(raw).toBeLessThan(R.price.small_max_pct);
    expect(classifyRelativeBand(100500, 105300, R.price)).toBe(COST_BAND.SMALL);

    const concession = resolveNumericConcession({
      boundary: 105300,
      current: 100500,
      quantum: R.price.quantum,
      direction: "up",
      scale: "relative",
      bands: R.price,
    });
    expect(concession.final).toBe(106000);
    expect((concession.final - 100500) / 100500).toBeCloseTo(0.0547, 4);
    expect(concession.cost_band).toBe(COST_BAND.MEDIUM);
  });

  it("quilometragem 50.000 · boundary 59.200 → final 60.000, +10.000, PEQUENA", () => {
    expect(
      resolveNumericConcession({
        boundary: 59200,
        current: 50000,
        quantum: R.mileage.quantum,
        direction: "up",
        scale: "absolute",
        bands: R.mileage,
      })
    ).toEqual({ final: 60000, delta: 10000, cost_band: COST_BAND.SMALL });
  });

  it("CROSSING de quilometragem: 52.000 · boundary 61.500 (+9.500) → 65.000 (+13.000) = MEDIA", () => {
    expect(classifyAbsoluteBand(61500 - 52000, R.mileage)).toBe(COST_BAND.SMALL);
    const concession = resolveNumericConcession({
      boundary: 61500,
      current: 52000,
      quantum: R.mileage.quantum,
      direction: "up",
      scale: "absolute",
      bands: R.mileage,
    });
    expect(concession).toEqual({ final: 65000, delta: 13000, cost_band: COST_BAND.MEDIUM });
  });

  it("distância 25 · boundary 38,1 → final 40, +15, PEQUENA (exemplo normativo)", () => {
    expect(
      resolveNumericConcession({
        boundary: 38.1,
        current: 25,
        quantum: R.radius.quantum,
        direction: "up",
        scale: "absolute",
        bands: R.radius,
        cap: 150,
      })
    ).toEqual({ final: 40, delta: 15, cost_band: COST_BAND.SMALL });
  });

  it("distância 25 → 150: acréscimo 125, GRANDE (segundo exemplo normativo)", () => {
    expect(
      resolveNumericConcession({
        boundary: 148.2,
        current: 25,
        quantum: R.radius.quantum,
        direction: "up",
        scale: "absolute",
        bands: R.radius,
        cap: 150,
      })
    ).toEqual({ final: 150, delta: 125, cost_band: COST_BAND.LARGE });
  });

  it("o teto corta a concessão que deixaria o candidato de fora", () => {
    // Candidato a 151 km: arredondar para cima daria 155, o cap baixaria para
    // 150 e o candidato que justificou a concessão ficaria fora dela.
    expect(
      resolveNumericConcession({
        boundary: 151,
        current: 25,
        quantum: R.radius.quantum,
        direction: "up",
        scale: "absolute",
        bands: R.radius,
        cap: 150,
      })
    ).toBeNull();
  });

  it("ano não tem quantum: o boundary real é o próprio valor aplicado", () => {
    expect(
      resolveNumericConcession({
        boundary: 2017,
        current: 2018,
        direction: "down",
        scale: "absolute",
        bands: R.year,
      })
    ).toEqual({ final: 2017, delta: 1, cost_band: COST_BAND.SMALL });
    expect(
      resolveNumericConcession({
        boundary: 2015,
        current: 2018,
        direction: "down",
        scale: "absolute",
        bands: R.year,
      })
    ).toEqual({ final: 2015, delta: 3, cost_band: COST_BAND.LARGE });
  });

  it("boundary inexistente → sem concessão", () => {
    expect(
      resolveNumericConcession({
        boundary: null,
        current: 100000,
        quantum: 1000,
        direction: "up",
        scale: "relative",
        bands: R.price,
      })
    ).toBeNull();
  });
});

// ── Ordenação ────────────────────────────────────────────────────────────────

describe("DEC-26 — ordenação categórica", () => {
  const item = (dimension, cost_band, results, sellers = 0, cities = 0) => ({
    dimension,
    cost_band,
    delta_result_count: results,
    delta_seller_count: sellers,
    delta_city_count: cities,
  });

  it("PEQUENA +1 vence GRANDE +50 — a banda domina o benefício", () => {
    const ranked = rankRelaxations(
      [item("radius", COST_BAND.LARGE, 50), item("price", COST_BAND.SMALL, 1)],
      { priority_order: R.priority_order, min_delta: 1, max_options: 3 }
    );
    expect(ranked.map((r) => r.dimension)).toEqual(["price", "radius"]);
  });

  it("25 → 150 km não vence uma pequena concessão de preço (caso da DEC-26)", () => {
    const ranked = rankRelaxations(
      [item("radius", COST_BAND.LARGE, 999), item("price", COST_BAND.SMALL, 1)],
      { priority_order: R.priority_order, min_delta: 1, max_options: 3 }
    );
    expect(ranked[0].dimension).toBe("price");
  });

  it("dentro da mesma banda: result → seller → city → priority_order", () => {
    const byResult = [item("price", COST_BAND.SMALL, 2), item("year", COST_BAND.SMALL, 5)];
    expect(rankRelaxations(byResult, { priority_order: R.priority_order })[0].dimension).toBe(
      "year"
    );

    const bySeller = [item("price", COST_BAND.SMALL, 5, 1), item("year", COST_BAND.SMALL, 5, 3)];
    expect(rankRelaxations(bySeller, { priority_order: R.priority_order })[0].dimension).toBe(
      "year"
    );

    const byCity = [
      item("price", COST_BAND.SMALL, 5, 2, 1),
      item("year", COST_BAND.SMALL, 5, 2, 4),
    ];
    expect(rankRelaxations(byCity, { priority_order: R.priority_order })[0].dimension).toBe("year");

    const byPriority = [
      item("mileage", COST_BAND.SMALL, 5, 2, 2),
      item("price", COST_BAND.SMALL, 5, 2, 2),
      item("year", COST_BAND.SMALL, 5, 2, 2),
    ];
    expect(
      rankRelaxations(byPriority, { priority_order: R.priority_order }).map((r) => r.dimension)
    ).toEqual(["price", "year", "mileage"]);
  });

  it("priority_order é o ÚLTIMO desempate: nunca supera banda nem benefício", () => {
    // `price` é o primeiro da priority_order e mesmo assim perde para `radius`
    // quando a banda é maior, e para `year` quando o benefício é menor.
    expect(
      compareRelaxations(
        item("price", COST_BAND.MEDIUM, 10),
        item("radius", COST_BAND.SMALL, 1),
        R.priority_order
      )
    ).toBeGreaterThan(0);
    expect(
      compareRelaxations(
        item("price", COST_BAND.SMALL, 1),
        item("year", COST_BAND.SMALL, 2),
        R.priority_order
      )
    ).toBeGreaterThan(0);
  });

  it("delta 0 é oculto; delta 1 é elegível; corte em 3", () => {
    const ranked = rankRelaxations(
      [
        item("price", COST_BAND.SMALL, 0),
        item("year", COST_BAND.SMALL, 1),
        item("mileage", COST_BAND.SMALL, 2),
        item("radius", COST_BAND.SMALL, 3),
        item("transmission", COST_BAND.SMALL, 4),
      ],
      {
        priority_order: R.priority_order,
        min_delta: R.min_delta_to_offer,
        max_options: R.max_options,
      }
    );
    expect(ranked).toHaveLength(3);
    expect(ranked.map((r) => r.dimension)).toEqual(["transmission", "radius", "mileage"]);
    // Com corte em 3, o delta 0 ficaria de fora de qualquer jeito — é o pior
    // colocado. Só isolando o filtro se prova que ele é OCULTADO, e não apenas
    // empurrado para o fim da fila.
    expect(ranked.some((r) => r.dimension === "price")).toBe(false);
    expect(
      rankRelaxations([item("price", COST_BAND.SMALL, 0)], {
        priority_order: R.priority_order,
        min_delta: R.min_delta_to_offer,
        max_options: R.max_options,
      })
    ).toEqual([]);
    expect(
      rankRelaxations([item("price", COST_BAND.SMALL, 0), item("year", COST_BAND.LARGE, 1)], {
        priority_order: R.priority_order,
        min_delta: R.min_delta_to_offer,
        max_options: R.max_options,
      }).map((r) => r.dimension)
    ).toEqual(["year"]);
  });
});

// ── Variantes ────────────────────────────────────────────────────────────────

describe("DEC-26 — variantes materializadas", () => {
  it("nenhum degrau fixo sobrevive: o valor sai do boundary, não de +15%/−2/+25%", () => {
    const ctx = ctxOf({ price_max: 75000, year_from: 2018, mileage_max: 80000 });
    const v = buildRelaxationVariants(ctx, scopeOf(25), policy, {
      price_boundary: 76200,
      year_boundary: 2017,
      mileage_boundary: 81000,
    });
    const by = Object.fromEntries(v.map((x) => [x.dimension, x]));
    expect(by.price.applied_value).toBe(77000); // não 86250 (+15%)
    expect(by.year.applied_value).toBe(2017); // não 2016 (−2)
    expect(by.mileage.applied_value).toBe(85000); // não 100000 (+25%)
  });

  it("V3-INV-063: aplicado, url_params e base da banda são o MESMO número", () => {
    const ctx = ctxOf({ price_max: 100500, mileage_max: 50000 });
    const v = buildRelaxationVariants(ctx, scopeOf(25), policy, {
      price_boundary: 105300,
      mileage_boundary: 59200,
      radius_boundary: 38.1,
    });
    const by = Object.fromEntries(v.map((x) => [x.dimension, x]));

    expect(by.price.applied_value).toBe(106000);
    expect(by.price.url_params.price_max).toBe(by.price.applied_value);
    expect(by.price.filters.price_max).toBe(by.price.applied_value);
    expect(by.price.cost_band).toBe(classifyRelativeBand(100500, by.price.applied_value, R.price));

    expect(by.mileage.url_params.mileage_max).toBe(by.mileage.applied_value);
    expect(by.mileage.filters.mileage_max).toBe(by.mileage.applied_value);

    expect(by.radius.applied_value).toBe(40);
    expect(by.radius.url_params.raio).toBe(40);
    expect(by.radius.radiusKm).toBe(40);
    expect(by.radius.cost_band).toBe(COST_BAND.SMALL);
  });

  it("radius: 25 → candidato a 38,1 → 40 km PEQUENA, sem consultar rings_manual", () => {
    const ctx = ctxOf({});
    const v = buildRelaxationVariants(ctx, scopeOf(25), policy, { radius_boundary: 38.1 });
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({
      dimension: "radius",
      applied_value: 40,
      cost_band: COST_BAND.SMALL,
      url_params: { raio: 40 },
    });
    // 40 não está em rings_manual: a concessão não é um preset.
    expect(policy.rings_manual.includes(40)).toBe(false);
  });

  it("sem candidato útil até 150 km → nenhuma sugestão de radius", () => {
    const v = buildRelaxationVariants(ctxOf({}), scopeOf(25), policy, { radius_boundary: null });
    expect(v).toEqual([]);
  });

  it("câmbio: a concessão é REMOVER a restrição, banda GRANDE", () => {
    const v = buildRelaxationVariants(
      ctxOf({ transmission: "automatico" }),
      scopeOf(0),
      policy,
      {}
    );
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({
      dimension: "transmission",
      cost_band: COST_BAND.LARGE,
      url_params: { transmission: null },
      applied_value: null,
    });
    expect(v[0].filters.transmission).toBeUndefined();
  });

  it("teto da concessão nunca passa da malha pré-computada", () => {
    expect(concessionRadiusCap(policy)).toBe(150);
    expect(concessionRadiusCap({ relaxations: { radius: { max_km: 999 } } })).toBe(150);
    expect(concessionRadiusCap({ relaxations: { radius: { max_km: 100 } } })).toBe(100);
  });
});

// ── SQL ──────────────────────────────────────────────────────────────────────

describe("DEC-26 — SQL de boundaries", () => {
  it("cada boundary relaxa EXATAMENTE uma dimensão e mantém as demais", () => {
    const ctx = ctxOf({
      price_max: 75000,
      year_from: 2018,
      mileage_max: 80000,
      transmission: "automatico",
      commercial_model: "Onix",
    });
    const q = buildBoundaryQuery(ctx, scopeOf(25), policy);
    const price = q.sql.match(/MIN\(a\.price\) FILTER \(WHERE ([^)]*(?:\)[^)]*)*?)\)::float/)[1];
    expect(price).toContain("a.price >"); // relaxa preço
    expect(price).not.toMatch(/a\.price <=/); // e só ele
    expect(price).toContain("a.year >="); // mantém ano
    expect(price).toContain("a.mileage <="); // mantém km
    expect(price).toContain("COALESCE(a.transmission"); // mantém câmbio
    expect(price).toContain("commercial_model"); // mantém modelo
    expect(price).toContain("rm.distance_km <="); // mantém território
  });

  it("o boundary de distância é a ÚNICA cláusula que passa do território atual", () => {
    const q = buildBoundaryQuery(ctxOf({ price_max: 75000 }), scopeOf(25), policy);
    expect(q.sql).toContain("MIN(rm.distance_km) FILTER");
    const radius = q.sql.match(/MIN\(rm\.distance_km\) FILTER \(WHERE (.*?)\)::float/s)[1];
    expect(radius).toContain("rm.distance_km >");
    // e o teto da investigação é o da concessão
    expect(q.params).toContain(150);
    expect(q.cap).toBe(150);
  });

  it("uma única query cobre todas as dimensões — nada de N+1", () => {
    const q = buildBoundaryQuery(
      ctxOf({ price_max: 75000, year_from: 2018, mileage_max: 80000 }),
      scopeOf(25),
      policy
    );
    expect(q.dimensions).toEqual(["price", "year", "mileage", "radius"]);
    expect(q.sql.match(/SELECT/g)).toHaveLength(1);
  });

  it("sem dimensão numérica e sem origem, não há query de boundary", () => {
    expect(
      buildBoundaryQuery(ctxOf({ transmission: "manual" }, { origin: null }), scopeOf(0), policy)
    ).toBeNull();
  });

  it("benefício: uma query com atual + variantes, incluindo sellers e cities", () => {
    const ctx = ctxOf({ price_max: 75000 });
    const variants = buildRelaxationVariants(ctx, scopeOf(25), policy, {
      price_boundary: 76200,
      radius_boundary: 38.1,
    });
    const q = buildBenefitQuery(ctx, scopeOf(25), variants);
    expect(q.sql.match(/SELECT/g)).toHaveLength(1);
    expect(q.sql).toContain("cur_results");
    expect(q.sql).toContain("COUNT(DISTINCT a.advertiser_id)");
    expect(q.sql).toContain("COUNT(DISTINCT a.city_id)");
    expect(q.sql).toContain("v0_results");
    expect(q.sql).toContain("v1_results");
    // cidades acrescentadas saem daqui, não de liquidityRows
    expect(q.sql).toContain("ARRAY_AGG(DISTINCT c.slug)");
  });
});

// ── Orquestração ─────────────────────────────────────────────────────────────

describe("DEC-26 — computeRelaxations", () => {
  it("LAZY: alvo atingido → zero queries, nenhuma investigação até 150 km", async () => {
    const db = fakeDb([]);
    const out = await computeRelaxations(
      ctxOf({ price_max: 75000 }, { target: 12 }),
      scopeOf(25),
      12,
      policy,
      {
        db,
        cache: false,
      }
    );
    expect(out).toEqual({ relaxations: [], queries: 0 });
    expect(db.query).not.toHaveBeenCalled();
    expect(db.calls.some((c) => String(c.params).includes("150"))).toBe(false);
  });

  it("alvo NÃO atingido → exatamente 2 queries", async () => {
    const db = fakeDb([
      { price_boundary: 76200, radius_boundary: 38.1 },
      {
        cur_results: 1,
        cur_sellers: 1,
        cur_cities: 1,
        v0_results: 3,
        v0_sellers: 2,
        v0_cities: 1,
        v1_results: 5,
        v1_sellers: 3,
        v1_cities: 2,
        v1_cities_added: ["extrema-mg"],
      },
    ]);
    const out = await computeRelaxations(
      ctxOf({ price_max: 75000 }, { target: 12 }),
      scopeOf(25),
      1,
      policy,
      { db, cache: false }
    );
    expect(out.queries).toBe(2);
    expect(db.query).toHaveBeenCalledTimes(2);

    const price = out.relaxations.find((r) => r.dimension === "price");
    expect(price).toMatchObject({
      cost_band: COST_BAND.SMALL,
      delta_result_count: 2,
      delta_seller_count: 1,
      delta_city_count: 0,
      applied_value: 77000,
      url_params: { price_max: 77000 },
      delta: 2,
    });
    const radius = out.relaxations.find((r) => r.dimension === "radius");
    expect(radius).toMatchObject({
      cost_band: COST_BAND.SMALL,
      delta_result_count: 4,
      applied_value: 40,
      url_params: { raio: 40 },
      included_cities: ["extrema-mg"],
    });
    // Mesma banda: vence o maior delta de resultados.
    expect(out.relaxations[0].dimension).toBe("radius");
  });

  it("delta negativo é erro de consistência: descartado e logado, nunca publicado", async () => {
    const db = fakeDb([
      { price_boundary: 76200 },
      {
        cur_results: 10,
        cur_sellers: 3,
        cur_cities: 2,
        v0_results: 4,
        v0_sellers: 1,
        v0_cities: 1,
      },
    ]);
    const out = await computeRelaxations(
      ctxOf({ price_max: 75000 }, { target: 12 }),
      scopeOf(25),
      10,
      policy,
      { db, cache: false }
    );
    expect(out.relaxations).toEqual([]);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ dimension: "price" }),
      expect.stringContaining("delta negativo")
    );
  });

  it("delta zero não é oferecido", async () => {
    const db = fakeDb([
      { price_boundary: 76200 },
      { cur_results: 2, cur_sellers: 1, cur_cities: 1, v0_results: 2, v0_sellers: 1, v0_cities: 1 },
    ]);
    const out = await computeRelaxations(
      ctxOf({ price_max: 75000 }, { target: 12 }),
      scopeOf(25),
      2,
      policy,
      { db, cache: false }
    );
    expect(out.relaxations).toEqual([]);
  });
});
