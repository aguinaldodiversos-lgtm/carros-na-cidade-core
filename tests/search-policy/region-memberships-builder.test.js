// tests/search-policy/region-memberships-builder.test.js
//
// F1 §3.1 — construtor puro de region_memberships (sem Postgres).
// Coordenadas REAIS do snapshot de produção (cities.latitude/longitude,
// 2026-09-07), para que as distâncias aqui sejam as mesmas do banco.
import { describe, expect, it } from "vitest";
import {
  buildAllMemberships,
  buildMembershipsForBase,
  classifyLegacyLayer,
  hasAnyNeighborRow,
  compareWithExisting,
  findMissingFromSuperset,
  haversineKm,
  LAYER_EXTENDED,
  LAYER_EXTENDED as LAYER_EXTENDED_ALIAS,
  layerMapFrom,
  LEGACY_LAYER_1_MAX_MEMBERS,
  LEGACY_MAX_LAYER,
  MAX_DISTANCE_KM,
  pickLegacyRegionMembers,
  rollbackSql,
  roundKm,
  summarizeMemberships,
} from "../../src/modules/regions/region-memberships.builder.js";

const ATIBAIA = {
  id: 4761,
  slug: "atibaia-sp",
  state: "SP",
  latitude: -23.1171,
  longitude: -46.5563,
};
const BRAGANCA = {
  id: 4800,
  slug: "braganca-paulista-sp",
  state: "SP",
  latitude: -22.9527,
  longitude: -46.5419,
};
const EXTREMA = {
  id: 1848,
  slug: "extrema-mg",
  state: "MG",
  latitude: -22.854,
  longitude: -46.3178,
};
const CAMANDUCAIA = {
  id: 1682,
  slug: "camanducaia-mg",
  state: "MG",
  latitude: -22.7515,
  longitude: -46.1494,
};
const CAMPINAS = {
  id: 4822,
  slug: "campinas-sp",
  state: "SP",
  latitude: -22.9053,
  longitude: -47.0659,
};
const JUNDIAI = {
  id: 5009,
  slug: "jundiai-sp",
  state: "SP",
  latitude: -23.1852,
  longitude: -46.8974,
};
const SAO_PAULO = {
  id: 5278,
  slug: "sao-paulo-sp",
  state: "SP",
  latitude: -23.5329,
  longitude: -46.6395,
};
const RIO = {
  id: 3663,
  slug: "rio-de-janeiro-rj",
  state: "RJ",
  latitude: -22.9129,
  longitude: -43.2003,
};
const SEM_GEO = { id: 9999, slug: "sem-geo-tt", state: "SP", latitude: null, longitude: null };

const ALL = [ATIBAIA, BRAGANCA, EXTREMA, CAMANDUCAIA, CAMPINAS, JUNDIAI, SAO_PAULO, RIO, SEM_GEO];

function row(rows, memberId) {
  return rows.find((r) => r.member_city_id === memberId);
}

describe("haversineKm — sentinelas geográficas (§3.1, tolerância ±0,5 km)", () => {
  it("braganca-paulista-sp ↔ extrema-mg ≈ 25,4 km", () => {
    const km = haversineKm(
      BRAGANCA.latitude,
      BRAGANCA.longitude,
      EXTREMA.latitude,
      EXTREMA.longitude
    );
    expect(Math.abs(km - 25.4)).toBeLessThanOrEqual(0.5);
  });
  it("atibaia-sp ↔ extrema-mg ≈ 38,1 km", () => {
    const km = haversineKm(
      ATIBAIA.latitude,
      ATIBAIA.longitude,
      EXTREMA.latitude,
      EXTREMA.longitude
    );
    expect(Math.abs(km - 38.1)).toBeLessThanOrEqual(0.5);
  });
  it("atibaia-sp ↔ braganca-paulista-sp ≈ 18,3 km", () => {
    const km = haversineKm(
      ATIBAIA.latitude,
      ATIBAIA.longitude,
      BRAGANCA.latitude,
      BRAGANCA.longitude
    );
    expect(Math.abs(km - 18.3)).toBeLessThanOrEqual(0.5);
  });
  it("roundKm grava 2 casas", () => {
    expect(roundKm(18.3412345)).toBe(18.34);
    expect(roundKm(0)).toBe(0);
  });
});

describe("buildMembershipsForBase — sem fronteira de UF, alcance 150 km, layer legado preservado", () => {
  const fromBraganca = buildMembershipsForBase(BRAGANCA, ALL);

  it("inclui Extrema-MG (cross-UF) com layer 4 e distância 25,4", () => {
    const extrema = row(fromBraganca, EXTREMA.id);
    expect(extrema).toBeDefined();
    expect(extrema.layer).toBe(LAYER_EXTENDED);
    expect(Math.abs(extrema.distance_km - 25.4)).toBeLessThanOrEqual(0.5);
  });

  it("Atibaia (18 km, mesma UF) mantém layer 1 — regra antiga", () => {
    expect(row(fromBraganca, ATIBAIA.id).layer).toBe(1);
  });

  it("build do zero: Campinas (54 km) layer 2 e São Paulo (~65 km) layer 3 — regra antiga completa", () => {
    // Base sem vizinhança gravada = build do zero: a regra antiga vale inteira,
    // inclusive a banda 60–100 km (layer 3), que existe desde 2026-07 para os
    // stops de 75/100 km do filtro de distância.
    expect(row(fromBraganca, CAMPINAS.id).layer).toBe(2);
    expect(row(fromBraganca, SAO_PAULO.id).layer).toBe(3);
  });

  it("base JÁ construída: a faixa 60–100 km vira layer 4, nunca 3", () => {
    // É a regra 2. Sem ela, o rebuild daria layer 3 a milhares de bases que
    // hoje não o têm e o guard layer <= 3 passaria a enxergar linhas novas.
    const congelada = buildMembershipsForBase(BRAGANCA, ALL, { allowLegacyLayer3: false });
    expect(row(congelada, SAO_PAULO.id).layer).toBe(LAYER_EXTENDED);
    expect(row(congelada, CAMPINAS.id).layer).toBe(2);
    expect(congelada.some((r) => r.layer === 3)).toBe(false);
  });

  it("Rio de Janeiro (> 150 km) não entra", () => {
    expect(row(fromBraganca, RIO.id)).toBeUndefined();
  });

  it("nunca inclui a própria base nem cidades sem coordenadas", () => {
    const ids = fromBraganca.map((r) => r.member_city_id);
    expect(ids).not.toContain(BRAGANCA.id);
    expect(ids).not.toContain(SEM_GEO.id);
  });

  it("ordena por distância ASC e desempata por id", () => {
    for (let i = 1; i < fromBraganca.length; i += 1) {
      const prev = fromBraganca[i - 1];
      const curr = fromBraganca[i];
      expect(
        curr.distance_km > prev.distance_km ||
          (curr.distance_km === prev.distance_km && curr.member_city_id > prev.member_city_id)
      ).toBe(true);
    }
  });

  it("do lado mineiro: Bragança-SP entra como layer 4 e Camanducaia-MG (mesma UF, ~24 km) como layer 1", () => {
    const fromExtrema = buildMembershipsForBase(EXTREMA, ALL);
    expect(row(fromExtrema, BRAGANCA.id).layer).toBe(LAYER_EXTENDED);
    expect(row(fromExtrema, CAMANDUCAIA.id).layer).toBe(1);
  });

  it("base sem coordenadas não gera vizinhas", () => {
    expect(buildMembershipsForBase(SEM_GEO, ALL)).toEqual([]);
  });

  it("faixa 100–150 km (mesma UF) entra com layer 4; > 150 km fica fora", () => {
    // ~1° de latitude ≈ 111 km ao sul de Bragança; ~1,4° ≈ 155 km.
    const far120 = {
      id: 7001,
      state: "SP",
      latitude: BRAGANCA.latitude - 1.08,
      longitude: BRAGANCA.longitude,
    };
    const far155 = {
      id: 7002,
      state: "SP",
      latitude: BRAGANCA.latitude - 1.4,
      longitude: BRAGANCA.longitude,
    };
    const rows = buildMembershipsForBase(BRAGANCA, [BRAGANCA, far120, far155]);
    expect(row(rows, far120.id)).toBeDefined();
    expect(row(rows, far120.id).layer).toBe(LAYER_EXTENDED);
    expect(row(rows, far120.id).distance_km).toBeGreaterThan(100);
    expect(row(rows, far120.id).distance_km).toBeLessThanOrEqual(MAX_DISTANCE_KM);
    expect(row(rows, far155.id)).toBeUndefined();
  });

  it("tetos legados: 15 vizinhas a ≤30 km → 12 com layer 1, as 3 mais distantes com layer 4", () => {
    const base = { id: 1, state: "SP", latitude: -23.0, longitude: -46.5 };
    const neighbors = Array.from({ length: 15 }, (_, i) => ({
      id: 100 + i,
      state: "SP",
      latitude: -23.0 - 0.012 * (i + 1), // ~1,3 km de passo → todas ≤ 20 km
      longitude: -46.5,
    }));
    const rows = buildMembershipsForBase(base, [base, ...neighbors]);
    const layer1 = rows.filter((r) => r.layer === 1);
    const extended = rows.filter((r) => r.layer === LAYER_EXTENDED);
    expect(layer1.length).toBe(LEGACY_LAYER_1_MAX_MEMBERS);
    expect(extended.length).toBe(15 - LEGACY_LAYER_1_MAX_MEMBERS);
    // as 12 mais próximas são as de layer 1
    const maxLayer1 = Math.max(...layer1.map((r) => r.distance_km));
    const minExtended = Math.min(...extended.map((r) => r.distance_km));
    expect(maxLayer1).toBeLessThan(minExtended);
    // visão legada = exatamente as 12
    expect(pickLegacyRegionMembers(base, [base, ...neighbors]).length).toBe(
      LEGACY_LAYER_1_MAX_MEMBERS
    );
  });

  it("classifyLegacyLayer: 30/60/100 no build do zero; sem layer 3 em base congelada", () => {
    expect(classifyLegacyLayer(30)).toBe(1);
    expect(classifyLegacyLayer(30.01)).toBe(2);
    expect(classifyLegacyLayer(60)).toBe(2);
    expect(classifyLegacyLayer(60.01)).toBe(3);
    expect(classifyLegacyLayer(100.01)).toBeNull();
    expect(classifyLegacyLayer(60.01, { includeLayer3: false })).toBeNull();
  });
});

describe("buildAllMemberships + summarizeMemberships", () => {
  const { rows, stats } = buildAllMemberships(ALL);

  it("gera self-row (layer 0, 0 km) para TODA cidade, inclusive sem coordenadas", () => {
    for (const c of ALL) {
      const self = rows.find((r) => r.base_city_id === c.id && r.member_city_id === c.id);
      expect(self).toBeDefined();
      expect(self.layer).toBe(0);
      expect(self.distance_km).toBe(0);
    }
    expect(stats.basesWithoutCoords).toBe(1);
    expect(stats.basesWithCoords).toBe(ALL.length - 1);
  });

  it("cidade sem coordenadas só tem a self-row (como base e como membro)", () => {
    const asBase = rows.filter((r) => r.base_city_id === SEM_GEO.id);
    const asMember = rows.filter((r) => r.member_city_id === SEM_GEO.id);
    expect(asBase.length).toBe(1);
    expect(asMember.length).toBe(1);
  });

  it("pares são simétricos em distância", () => {
    const ab = rows.find((r) => r.base_city_id === BRAGANCA.id && r.member_city_id === EXTREMA.id);
    const ba = rows.find((r) => r.base_city_id === EXTREMA.id && r.member_city_id === BRAGANCA.id);
    expect(ab.distance_km).toBe(ba.distance_km);
  });

  it("resumo conta cross-UF > 0 e faixas", () => {
    const s = summarizeMemberships(rows, ALL);
    expect(s.self).toBe(ALL.length);
    expect(s.crossUf).toBeGreaterThan(0);
    expect(s.byLayer[0]).toBe(ALL.length);
    expect(s.byBand["0-25"]).toBeGreaterThan(0); // Atibaia↔Bragança (18 km) ×2
    expect(s.total).toBe(rows.length);
  });
});

describe("preservação do layer gravado (regra 1 — guard layer <= 3 byte-a-byte)", () => {
  it("linha existente mantém o layer, inclusive layer 3 que a regra nova não atribui", () => {
    // Estado "antigo": Bragança→São Paulo já gravada como layer 3 (o build
    // parcial de produção fez isso para 180 bases).
    const existing = new Map([[`${BRAGANCA.id}:${SAO_PAULO.id}`, 3]]);
    const rows = buildMembershipsForBase(BRAGANCA, ALL, {
      existingLayerByKey: existing,
      allowLegacyLayer3: false,
    });
    expect(row(rows, SAO_PAULO.id).layer).toBe(3);
    // Sem o layer gravado, numa base congelada a mesma linha seria 4.
    expect(
      row(buildMembershipsForBase(BRAGANCA, ALL, { allowLegacyLayer3: false }), SAO_PAULO.id).layer
    ).toBe(LAYER_EXTENDED);
  });

  it("o layer gravado vence a regra 2 (linha antiga de layer 4 não vira 1)", () => {
    const existing = new Map([[`${BRAGANCA.id}:${ATIBAIA.id}`, LAYER_EXTENDED]]);
    const rows = buildMembershipsForBase(BRAGANCA, ALL, {
      existingLayerByKey: existing,
      allowLegacyLayer3: false,
    });
    expect(row(rows, ATIBAIA.id).layer).toBe(LAYER_EXTENDED);
  });

  it("segundo build congela as bases já construídas: layer <= 3 não cresce nem muda", () => {
    // Simula o rebuild real: o "estado atual" é o resultado de um build antigo,
    // que só enxergava a mesma UF até 100 km (layer 1–3). O segundo build
    // acrescenta as linhas de 150 km e cross-UF — e nenhuma delas pode entrar
    // no conjunto que os leitores legados veem.
    const primeiro = buildAllMemberships(ALL).rows;
    const anterior = new Map(
      primeiro
        .filter((r) => r.layer <= LEGACY_MAX_LAYER)
        .map((r) => [
          `${r.base_city_id}:${r.member_city_id}`,
          {
            base_city_id: r.base_city_id,
            member_city_id: r.member_city_id,
            distance_km: r.distance_km,
            layer: r.layer,
          },
        ])
    );

    const segundo = buildAllMemberships(ALL, {
      existingLayerByKey: layerMapFrom(anterior),
      freezeLegacyLayer3: hasAnyNeighborRow(anterior),
    }).rows;

    const cmp = compareWithExisting(anterior, segundo);
    expect(cmp.missing).toEqual([]);
    expect(cmp.layerChanged).toEqual([]);
    expect(cmp.distanceChanged).toEqual([]);
    // O conjunto visível aos leitores legados é EXATAMENTE o anterior.
    const visiveis = segundo.filter((r) => r.layer <= LEGACY_MAX_LAYER);
    expect(visiveis.length).toBe(anterior.size);
    // E o build de fato cresceu (as linhas novas foram para layer 4).
    expect(segundo.length).toBeGreaterThan(anterior.size);
    expect(segundo.some((r) => r.layer === LAYER_EXTENDED_ALIAS)).toBe(true);
  });
});

describe("superconjunto e rollback", () => {
  it("findMissingFromSuperset aponta chaves antigas ausentes", () => {
    const rows = [
      { base_city_id: 1, member_city_id: 1 },
      { base_city_id: 1, member_city_id: 2 },
    ];
    expect(findMissingFromSuperset(new Set(["1:1", "1:2"]), rows)).toEqual([]);
    expect(findMissingFromSuperset(new Set(["1:1", "9:9"]), rows)).toEqual(["9:9"]);
  });

  it("compareWithExisting acusa linha ausente, layer alterado e distância alterada", () => {
    const anterior = new Map([
      ["1:2", { distance_km: 10, layer: 1 }],
      ["1:3", { distance_km: 40, layer: 2 }],
      ["1:9", { distance_km: 90, layer: 3 }],
    ]);
    const novos = [
      { base_city_id: 1, member_city_id: 2, distance_km: 10, layer: 1 },
      { base_city_id: 1, member_city_id: 3, distance_km: 40, layer: 4 },
    ];
    const cmp = compareWithExisting(anterior, novos);
    expect(cmp.existing).toBe(3);
    expect(cmp.missing).toEqual(["1:9"]);
    expect(cmp.layerChanged).toEqual(["1:3"]);
    expect(cmp.distanceChanged).toEqual([]);
  });

  it("rollbackSql restaura a partir do backup e rejeita identificador inválido", () => {
    const sql = rollbackSql("region_memberships_backup_202609071800");
    expect(sql).toContain("DELETE FROM region_memberships;");
    expect(sql).toContain("FROM region_memberships_backup_202609071800;");
    expect(() => rollbackSql("bad;drop")).toThrow();
  });
});
