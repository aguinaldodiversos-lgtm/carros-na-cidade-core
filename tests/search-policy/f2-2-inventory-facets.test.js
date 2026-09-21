// tests/search-policy/f2-2-inventory-facets.test.js
//
// F2.2-B2 — facetas guiadas pelo estoque.
//
// O defeito corrigido aqui não era sutil: com `min_options_to_render = 2`, um
// `continue` APAGAVA da resposta qualquer dimensão que tivesse exatamente uma
// opção real. Medido antes da correção, com uma opção por dimensão, a resposta
// saía com ZERO facetas — inclusive **preço**, porque o descarte acontecia
// antes de `decideOpenFacets`, e portanto antes de `always_open` ter chance de
// proteger a dimensão que a DEC-22 declara primária permanente.
//
// A v3 §13 resolve isso em uma frase: facetas de baixo poder discriminativo
// "podem permanecer recolhidas em 'Mais filtros', SEM DEIXAR DE ESTAR
// DISPONÍVEIS ao usuário quando possuírem opções reais".
//
// Invariantes tocados: V3-INV-019, 020, 021, 022, 064, 065, 070.

import { describe, expect, it } from "vitest";
import {
  assembleFacets,
  decideOpenFacets,
  buildActiveFacetQuery,
  buildPassiveFacetsQuery,
  facetKeysFor,
} from "../../src/modules/ads/search-policy/facets-policy.js";
import { SEARCH_POLICY_DEFAULT } from "../../src/modules/ads/search-policy/policy-config.js";

const policy = SEARCH_POLICY_DEFAULT;
const rows = (entries) => new Map(Object.entries(entries));

describe("B2 — cardinalidade 1 não apaga a dimensão", () => {
  it("dimensão com exatamente 1 opção count>0 continua disponível", () => {
    const facets = assembleFacets(
      rows({ transmission: [{ value: "automatico", count: 12 }] }),
      {},
      policy
    );
    const t = facets.find((f) => f.key === "transmission");
    expect(t).toBeDefined();
    expect(t.options).toEqual([{ value: "automatico", label: "Automático", count: 12 }]);
  });

  it("a contagem da única opção é preservada", () => {
    const facets = assembleFacets(rows({ fuel: [{ value: "diesel", count: 7 }] }), {}, policy);
    expect(facets.find((f) => f.key === "fuel").options[0].count).toBe(7);
  });

  it("o limiar de 2 não faz a dimensão sumir — só a mantém recolhida", () => {
    expect(policy.facets.min_options_to_render).toBe(2);
    const facets = assembleFacets(
      rows({
        transmission: [{ value: "automatico", count: 12 }],
        brand: [
          { value: "Fiat", count: 5 },
          { value: "GM - Chevrolet", count: 7 },
        ],
      }),
      {},
      policy
    );
    const t = facets.find((f) => f.key === "transmission");
    expect(t).toBeDefined();
    expect(t.open).toBe(false); // "Mais filtros"
    expect(facets.find((f) => f.key === "brand").open).toBe(true); // 2 opções, entra na área principal
  });
});

describe("B2 — opções zero (V3-INV-021 / V3-INV-022)", () => {
  it("opção não selecionada com count 0 não é oferecida", () => {
    const facets = assembleFacets(
      rows({
        transmission: [
          { value: "automatico", count: 12 },
          { value: "manual", count: 0 },
        ],
      }),
      {},
      policy
    );
    const t = facets.find((f) => f.key === "transmission");
    expect(t.options.map((o) => o.value)).toEqual(["automatico"]);
    expect(t.options.some((o) => o.count === 0)).toBe(false);
  });

  it("dimensão em que TODAS as opções são zero não é emitida (nada a oferecer)", () => {
    const facets = assembleFacets(rows({ fuel: [{ value: "flex", count: 0 }] }), {}, policy);
    expect(facets.find((f) => f.key === "fuel")).toBeUndefined();
  });

  it("opção ATIVA com zero permanece visível e removível, e a dimensão abre", () => {
    const facets = assembleFacets(
      rows({ transmission: [{ value: "manual", count: 3 }] }),
      { transmission: "automatico" },
      policy
    );
    const t = facets.find((f) => f.key === "transmission");
    expect(t.options[0]).toEqual({
      value: "automatico",
      label: "Automático",
      count: 0,
      active: true,
    });
    expect(t.open).toBe(true);
    expect(t.active_value).toBe("automatico");
  });

  it("o zero ativo NÃO vira opção disponível para outra busca", () => {
    // Sem o filtro ativo, a mesma linha de estoque não produz a opção.
    const semFiltro = assembleFacets(
      rows({ transmission: [{ value: "manual", count: 3 }] }),
      {},
      policy
    );
    const t = semFiltro.find((f) => f.key === "transmission");
    expect(t.options.map((o) => o.value)).toEqual(["manual"]);
    expect(t.options.some((o) => o.value === "automatico")).toBe(false);
  });
});

describe("B2 — preço primário permanente (DEC-22 / V3-INV-070)", () => {
  it("preço sobrevive e abre mesmo com uma única faixa não-zero", () => {
    const facets = assembleFacets(
      rows({
        price: [{ value: 0, count: 12 }],
        transmission: [{ value: "automatico", count: 12 }],
      }),
      {},
      policy
    );
    const price = facets.find((f) => f.key === "price");
    expect(price).toBeDefined();
    expect(price.open).toBe(true);
    expect(price.options).toHaveLength(1);
    expect(price.entropy).toBe(0); // poder discriminativo nulo, e ainda assim primário
  });

  it("entropia zero não rebaixa preço, nem quando outras dimensões são mais informativas", () => {
    const facets = assembleFacets(
      rows({
        price: [{ value: 0, count: 30 }],
        brand: [
          { value: "Fiat", count: 10 },
          { value: "GM - Chevrolet", count: 10 },
          { value: "Honda", count: 10 },
        ],
        commercial_model: [
          { value: "Onix", count: 15 },
          { value: "Argo", count: 15 },
        ],
        year: [
          { value: 2022, count: 15 },
          { value: 2023, count: 15 },
        ],
      }),
      {},
      policy
    );
    const open = facets.filter((f) => f.open).map((f) => f.key);
    expect(open).toContain("price");
    expect(open.length).toBe(policy.facets.open_max);
  });
});

describe("B2 — ordem estável das dimensões", () => {
  const keysFor = (counts) =>
    assembleFacets(
      rows({
        price: [
          { value: 0, count: counts[0] },
          { value: 1, count: counts[1] },
        ],
        brand: [
          { value: "Fiat", count: counts[2] },
          { value: "GM - Chevrolet", count: counts[3] },
        ],
        transmission: [
          { value: "automatico", count: counts[4] },
          { value: "manual", count: counts[5] },
        ],
      }),
      {},
      policy
    ).map((f) => f.key);

  it("variar counts não reordena as dimensões emitidas", () => {
    const a = keysFor([5, 5, 5, 5, 5, 5]);
    const b = keysFor([1, 99, 40, 2, 7, 3]);
    const c = keysFor([80, 1, 1, 90, 60, 2]);
    expect(b).toEqual(a);
    expect(c).toEqual(a);
    // e a ordem é a de política, não a de contagem
    expect(a).toEqual(facetKeysFor({}).filter((k) => a.includes(k)));
  });
});

describe("B2 — neutralidade comercial", () => {
  // O peso comercial não entra em `assembleFacets` de forma alguma: as linhas
  // chegam contadas pelo CandidateScope, que não pondera. A prova estrutural é
  // que o SQL das facetas não cita nenhuma expressão de peso; a prova de
  // comportamento, com o mesmo inventário e planos diferentes, está na
  // integração.
  const ctx = { filters: {}, territory: { mode: "EXACT_CITY", originId: 1, radiusKm: 0 } };

  it("o SQL das facetas não pondera por peso comercial nem por destaque", () => {
    const passive = buildPassiveFacetsQuery(ctx, policy, ["brand", "transmission"]);
    const active = buildActiveFacetQuery(
      { filters: { transmission: "automatico" }, territory: ctx.territory },
      policy,
      "transmission"
    );
    for (const { sql } of [passive, active]) {
      expect(sql).toMatch(/COUNT\(\*\)/);
      expect(sql).not.toMatch(/highlight_until/);
      expect(sql).not.toMatch(/\bweight\b/);
      expect(sql).not.toMatch(/ORDER BY[\s\S]*weight/);
    }
  });

  it("counts iguais produzem facetas iguais, venha o estoque de que plano vier", () => {
    const mesmoInventario = rows({
      brand: [
        { value: "Fiat", count: 5 },
        { value: "GM - Chevrolet", count: 7 },
      ],
    });
    const a = assembleFacets(mesmoInventario, {}, policy);
    const b = assembleFacets(mesmoInventario, {}, policy);
    expect(b).toEqual(a);
  });
});

describe("B2 — self-excluding preservado (V3-INV-020 / V3-INV-064)", () => {
  const territory = { mode: "EXACT_CITY", originId: 1, radiusKm: 0 };
  const filters = { brand: "Chevrolet", transmission: "automatico" };

  it("a faceta de câmbio remove só câmbio e mantém a marca", () => {
    const { sql } = buildActiveFacetQuery({ filters, territory }, policy, "transmission");
    expect(sql).toContain("a.brand ILIKE");
    expect(sql).not.toMatch(/COALESCE\(a\.transmission[\s\S]*ILIKE[\s\S]*WHERE/);
    expect(sql).not.toContain("a.transmission, a.gearbox, a.cambio, '') ILIKE $");
  });

  it("a faceta de marca remove só marca e mantém o câmbio", () => {
    const { sql } = buildActiveFacetQuery({ filters, territory }, policy, "brand");
    expect(sql).toContain("COALESCE(a.transmission");
    expect(sql).not.toContain("a.brand ILIKE");
  });

  it("as facetas passivas respeitam TODAS as restrições ativas", () => {
    const { sql } = buildPassiveFacetsQuery({ filters, territory }, policy, ["fuel", "year"]);
    expect(sql).toContain("a.brand ILIKE");
    expect(sql).toContain("COALESCE(a.transmission");
  });
});

describe("B2 — compatibilidade de configuração", () => {
  it("min_options_to_render continua governando ABERTURA, não existência", () => {
    const relaxado = JSON.parse(JSON.stringify(policy));
    relaxado.facets.min_options_to_render = 1;
    const base = rows({ transmission: [{ value: "automatico", count: 12 }] });

    const comLimiar2 = assembleFacets(base, {}, policy);
    const comLimiar1 = assembleFacets(base, {}, relaxado);

    // existe nos dois
    expect(comLimiar2.find((f) => f.key === "transmission")).toBeDefined();
    expect(comLimiar1.find((f) => f.key === "transmission")).toBeDefined();
    // e o limiar só muda a abertura
    expect(comLimiar2.find((f) => f.key === "transmission").open).toBe(false);
    expect(comLimiar1.find((f) => f.key === "transmission").open).toBe(true);
  });

  it("a política com compat legada (068/069) monta facetas sem regressão", () => {
    const compat = JSON.parse(JSON.stringify(policy));
    compat.relaxations.max_items = 3;
    compat.relaxations.steps = { radius: "next_ring", price_max: 0.15 };
    const facets = assembleFacets(
      rows({
        price: [{ value: 0, count: 12 }],
        transmission: [{ value: "automatico", count: 12 }],
      }),
      {},
      compat
    );
    expect(facets.map((f) => f.key)).toEqual(["price", "transmission"]);
    expect(facets.find((f) => f.key === "price").open).toBe(true);
  });

  it("uma facets policy sem always_open não derruba nada", () => {
    const sem = JSON.parse(JSON.stringify(policy));
    delete sem.facets.always_open;
    const facets = decideOpenFacets(
      assembleFacets(rows({ transmission: [{ value: "automatico", count: 12 }] }), {}, sem),
      sem
    );
    expect(facets.find((f) => f.key === "transmission")).toBeDefined();
  });
});
