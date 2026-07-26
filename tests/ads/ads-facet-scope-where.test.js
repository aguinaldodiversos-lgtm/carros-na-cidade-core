import { describe, expect, it } from "vitest";

import {
  buildAdsFacetScopeWhere,
  buildAdsFacetWhere,
} from "../../src/modules/ads/filters/ads-filter.builder.js";

/**
 * `buildAdsFacetScopeWhere` alimenta as facets de CONTROLE (chips de Ofertas,
 * segmentado de Vendedor, Câmbio) — as contagens que aparecem ao lado do
 * rótulo na sidebar.
 *
 * Duas propriedades importam:
 *
 *   1. Escopo só territorial. Se a contagem respeitasse o próprio filtro que
 *      ela conta, escolher "Lojas" faria "Particulares (0)" trivialmente e o
 *      chip ficaria inclicável para sempre — o oposto do objetivo, que é
 *      avisar ANTES do clique.
 *
 *   2. Paridade placeholder/param. A cadeia `$N` é montada à mão; um
 *      descasamento produz "bind message supplies N parameters, but prepared
 *      statement requires N-1" em runtime, sem nenhum sinal em teste unitário
 *      que não conte. Foi esse o modo de falha do `city_slugs` na Página
 *      Regional, e não temos Postgres em CI para pegá-lo executando.
 */

const CENARIOS = [
  ["cidade", { city_slug: "atibaia-sp" }, 1],
  ["regional (city_slugs + state)", { city_slugs: ["atibaia-sp", "jundiai-sp"], state: "SP" }, 2],
  ["regional 15 cidades", { city_slugs: Array.from({ length: 15 }, (_, i) => `c${i}-sp`) }, 1],
  ["estado", { state: "SP" }, 1],
  ["city_id", { city_id: 42 }, 1],
  ["nacional", {}, 0],
];

function placeholders(sql) {
  return [...sql.matchAll(/\$(\d+)/g)].map((m) => Number(m[1]));
}

describe("buildAdsFacetScopeWhere — paridade placeholder/param", () => {
  for (const [nome, filtros, esperado] of CENARIOS) {
    it(`${nome}: $N contíguos e batendo com params`, () => {
      const { whereClause, params } = buildAdsFacetScopeWhere(filtros);
      const found = placeholders(whereClause);

      expect(params).toHaveLength(esperado);
      expect(new Set(found).size).toBe(params.length);
      if (params.length > 0) {
        expect(Math.max(...found)).toBe(params.length);
        // Contíguos de 1..N — buraco significaria param órfão.
        expect([...new Set(found)].sort((a, b) => a - b)).toEqual(
          Array.from({ length: params.length }, (_, i) => i + 1)
        );
      } else {
        expect(found).toEqual([]);
      }
    });
  }

  it("buildAdsFacetWhere mantém a paridade com filtros de veículo somados", () => {
    const { whereClause, params } = buildAdsFacetWhere({
      city_slug: "atibaia-sp",
      brand: "Fiat",
      transmission: "Manual",
      below_fipe: true,
    });
    const found = placeholders(whereClause);
    expect(params).toHaveLength(4);
    expect(Math.max(...found)).toBe(4);
    expect(new Set(found).size).toBe(4);
  });
});

describe("buildAdsFacetScopeWhere — escopo territorial", () => {
  const TUDO = {
    city_slug: "atibaia-sp",
    brand: "Fiat",
    model: "Argo",
    fuel_type: "Flex",
    body_type: "Hatch",
    transmission: "Manual",
    below_fipe: true,
    seller_kind: "private",
    priority_tier: 4,
    opportunity: true,
  };

  it("ignora TODO filtro de veículo (contagem não se auto-zera)", () => {
    const { whereClause, params } = buildAdsFacetScopeWhere(TUDO);

    for (const proibido of [
      "a.brand",
      "a.model",
      "a.fuel_type",
      "a.body_type",
      "a.below_fipe",
      "gearbox",
    ]) {
      expect(whereClause, `scopeWhere não deve conter ${proibido}`).not.toContain(proibido);
    }
    // Só o território sobrou como parâmetro.
    expect(params).toEqual(["atibaia-sp"]);
  });

  it("não referencia u./sp. (não exige JOIN que o caller possa não ter)", () => {
    const { whereClause } = buildAdsFacetScopeWhere(TUDO);
    expect(whereClause).not.toMatch(/\bu\./);
    expect(whereClause).not.toMatch(/\bsp\./);
  });

  it("mantém status='active' e o território", () => {
    const { whereClause } = buildAdsFacetScopeWhere({ city_slug: "atibaia-sp" });
    expect(whereClause).toContain("a.status = 'active'");
    expect(whereClause).toContain("c.slug =");
  });

  it("compartilha a regra territorial com buildAdsFacetWhere (não divergem)", () => {
    for (const [, filtros] of CENARIOS) {
      const scope = buildAdsFacetScopeWhere(filtros);
      const full = buildAdsFacetWhere(filtros);
      // Sem filtro de veículo nos cenários, os dois têm que ser idênticos.
      expect(full.whereClause).toBe(scope.whereClause);
      expect(full.params).toEqual(scope.params);
    }
  });
});
