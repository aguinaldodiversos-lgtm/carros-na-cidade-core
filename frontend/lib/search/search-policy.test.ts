import { describe, expect, it } from "vitest";
import {
  distanceLabel,
  engineControlTotals,
  facetCounts,
  readOfferCounts,
  readSearchPolicy,
  readSearchPolicyFacets,
  territoryNotice,
} from "./search-policy";

const policyBlock = {
  geo_mode: "AUTO_RADIUS",
  reason: "REGIONAL_FLOOR",
  effective_radius_km: 25,
  requested_radius_km: null,
  user_geo_explicit: false,
  origin_city: { slug: "atibaia-sp", name: "Atibaia", state: "SP" },
  cities: [
    { slug: "atibaia-sp", name: "Atibaia", state: "SP", distance_km: 0, count: 33 },
    {
      slug: "braganca-paulista-sp",
      name: "Bragança Paulista",
      state: "SP",
      distance_km: 18.34,
      count: 1,
    },
    { slug: "jarinu-sp", name: "Jarinu", state: "SP", distance_km: 17.6, count: 0 },
  ],
};

describe("readSearchPolicy", () => {
  it("lê o bloco do motor", () => {
    const policy = readSearchPolicy(policyBlock);
    expect(policy).toMatchObject({
      geo_mode: "AUTO_RADIUS",
      effective_radius_km: 25,
      origin_city: { slug: "atibaia-sp", name: "Atibaia" },
    });
    expect(policy?.cities).toHaveLength(3);
  });

  it("caminho legado e shapes inesperados devolvem null", () => {
    expect(readSearchPolicy(undefined)).toBeNull();
    expect(readSearchPolicy(null)).toBeNull();
    expect(readSearchPolicy("v1")).toBeNull();
    expect(readSearchPolicy([])).toBeNull();
  });
});

describe("territoryNotice", () => {
  it("declara o raio e conta só as vizinhas COM candidato", () => {
    expect(territoryNotice(readSearchPolicy(policyBlock))).toBe(
      "Mostrando ofertas em até 25 km de Atibaia, incluindo 1 cidade vizinha"
    );
  });

  it("plural quando há mais de uma vizinha com candidato", () => {
    const policy = readSearchPolicy({
      ...policyBlock,
      cities: [
        ...policyBlock.cities,
        { slug: "piracaia-sp", name: "Piracaia", state: "SP", distance_km: 21.4, count: 2 },
      ],
    });
    expect(territoryNotice(policy)).toContain("incluindo 2 cidades vizinhas");
  });

  it("raio 0 não declara nada — é o caso do conjunto todo na própria cidade (DEC-28)", () => {
    expect(
      territoryNotice(readSearchPolicy({ ...policyBlock, effective_radius_km: 0 }))
    ).toBeNull();
  });

  it("sem origem resolvida, nada a declarar", () => {
    expect(territoryNotice(readSearchPolicy({ ...policyBlock, origin_city: null }))).toBeNull();
  });

  it("legado não declara nada", () => {
    expect(territoryNotice(null)).toBeNull();
  });

  it("território sem vizinha com candidato declara só o raio", () => {
    const policy = readSearchPolicy({
      ...policyBlock,
      cities: [policyBlock.cities[0], policyBlock.cities[2]],
    });
    expect(territoryNotice(policy)).toBe("Mostrando ofertas em até 25 km de Atibaia");
  });
});

describe("distanceLabel", () => {
  it("arredonda acima de 10 km e usa uma casa abaixo disso", () => {
    expect(distanceLabel(18.34)).toBe("a 18 km");
    expect(distanceLabel(9.26)).toBe("a 9,3 km");
  });

  it("própria cidade e legado não ganham rótulo", () => {
    expect(distanceLabel(0)).toBeNull();
    expect(distanceLabel(null)).toBeNull();
    expect(distanceLabel(undefined)).toBeNull();
    expect(distanceLabel("perto")).toBeNull();
  });
});

describe("facetas do motor", () => {
  const facets = readSearchPolicyFacets([
    {
      key: "seller_kind",
      label: "Vendedor",
      open: false,
      active_value: null,
      options: [{ value: "dealer", label: "Lojas", count: 34 }],
    },
    { key: "", label: "sem chave", options: [] },
  ]);

  it("ignora faceta sem chave", () => {
    expect(facets.map((f) => f.key)).toEqual(["seller_kind"]);
  });

  it("facetCounts devolve mapa por valor e {} quando a faceta não veio", () => {
    expect(facetCounts(facets, "seller_kind")).toEqual({ dealer: 34 });
    expect(facetCounts(facets, "transmission")).toEqual({});
  });
});

describe("engineControlTotals", () => {
  const facets = readSearchPolicyFacets([
    {
      key: "seller_kind",
      label: "Vendedor",
      options: [{ value: "dealer", label: "Lojas", count: 34 }],
    },
    {
      key: "transmission",
      label: "Câmbio",
      options: [
        { value: "manual", label: "Manual", count: 23 },
        { value: "automatico", label: "Automático", count: 11 },
      ],
    },
  ]);

  it("opção ausente vira 0, porque o motor já varreu o universo", () => {
    expect(engineControlTotals(facets)?.sellerKind).toEqual({ dealer: 34, private: 0 });
  });

  it("câmbio vem do motor", () => {
    expect(engineControlTotals(facets)?.transmission).toEqual({ manual: 23, automatico: 11 });
  });

  it("ofertas vêm do motor quando o bloco existe (F3-B)", () => {
    const offers = readOfferCounts({ opportunity: 2, below_fipe: 5, highlight: 1 });
    expect(engineControlTotals(facets, offers)?.offers).toEqual({
      opportunity: 2,
      below_fipe: 5,
      highlight: 1,
    });
  });

  it("sem o bloco do motor, ofertas ficam SEM número — nunca o da cidade", () => {
    // Era o estado da F3-A e continua sendo o correto para backend antigo: o
    // chip sem número diz "não contei"; com o número da cidade diria uma
    // mentira confiante ao lado de um grid regional.
    expect(engineControlTotals(facets)?.offers).toBeUndefined();
    expect(engineControlTotals(facets, null)?.offers).toBeUndefined();
  });

  it("sem facetas do motor devolve null e a sidebar segue com o BFF legado", () => {
    expect(engineControlTotals([])).toBeNull();
    expect(engineControlTotals([], { opportunity: 1, below_fipe: 1, highlight: 1 })).toBeNull();
  });
});

describe("readOfferCounts", () => {
  it("lê o bloco do motor", () => {
    expect(readOfferCounts({ opportunity: 2, below_fipe: 5, highlight: 1 })).toEqual({
      opportunity: 2,
      below_fipe: 5,
      highlight: 1,
    });
  });

  it("zeros reais são preservados — 0 é uma contagem, não uma ausência", () => {
    expect(readOfferCounts({ opportunity: 0, below_fipe: 0, highlight: 0 })).toEqual({
      opportunity: 0,
      below_fipe: 0,
      highlight: 0,
    });
  });

  it("bloco ausente ou incompleto vira null, nunca zeros inventados", () => {
    // Completar com zero afirmaria "não existe destaque nenhum" quando a
    // verdade é que ninguém contou.
    expect(readOfferCounts(undefined)).toBeNull();
    expect(readOfferCounts(null)).toBeNull();
    expect(readOfferCounts({})).toBeNull();
    expect(readOfferCounts({ opportunity: 2, below_fipe: 5 })).toBeNull();
    expect(readOfferCounts({ opportunity: "x", below_fipe: 5, highlight: 1 })).toBeNull();
    expect(readOfferCounts([{ opportunity: 1 }])).toBeNull();
  });
});
