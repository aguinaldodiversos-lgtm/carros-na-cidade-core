import { describe, expect, it } from "vitest";
import {
  haversineKm,
  pickRegionMembers,
} from "../../scripts/build-region-memberships.mjs";

describe("haversineKm", () => {
  it("retorna 0 para o mesmo ponto", () => {
    expect(haversineKm(-23.5505, -46.6333, -23.5505, -46.6333)).toBe(0);
  });

  it("calcula distância São Paulo → Atibaia (~50 km, dentro de margem)", () => {
    // SP capital: -23.5505, -46.6333. Atibaia: -23.1171, -46.5503.
    const distance = haversineKm(-23.5505, -46.6333, -23.1171, -46.5503);
    // Distância real ~49 km. Aceitamos margem de ±2 km (Haversine sobre esfera).
    expect(distance).toBeGreaterThan(40);
    expect(distance).toBeLessThan(60);
  });

  it("calcula distância Rio de Janeiro → São Paulo (~360 km)", () => {
    const distance = haversineKm(-22.9068, -43.1729, -23.5505, -46.6333);
    expect(distance).toBeGreaterThan(340);
    expect(distance).toBeLessThan(380);
  });

  it("é simétrica: d(A,B) === d(B,A)", () => {
    const ab = haversineKm(-23.5505, -46.6333, -23.1171, -46.5503);
    const ba = haversineKm(-23.1171, -46.5503, -23.5505, -46.6333);
    expect(ab).toBeCloseTo(ba, 6);
  });
});

const SP_CAPITAL = {
  id: 1,
  state: "SP",
  name: "São Paulo",
  latitude: -23.5505,
  longitude: -46.6333,
};
const SP_GUARULHOS = {
  id: 2,
  state: "SP",
  name: "Guarulhos",
  latitude: -23.4538,
  longitude: -46.5333,
}; // ~17 km
const SP_OSASCO = {
  id: 3,
  state: "SP",
  name: "Osasco",
  latitude: -23.5329,
  longitude: -46.7918,
}; // ~16 km
const SP_ATIBAIA = {
  id: 4,
  state: "SP",
  name: "Atibaia",
  latitude: -23.1171,
  longitude: -46.5503,
}; // ~49 km
const SP_CAMPINAS = {
  id: 5,
  state: "SP",
  name: "Campinas",
  latitude: -22.9099,
  longitude: -47.0626,
}; // ~90 km
const RJ_RIO = {
  id: 99,
  state: "RJ",
  name: "Rio de Janeiro",
  latitude: -22.9068,
  longitude: -43.1729,
};
const SP_NO_GEO = {
  id: 100,
  state: "SP",
  name: "Cidade Sem GPS",
  latitude: null,
  longitude: null,
};

describe("pickRegionMembers", () => {
  it("classifica vizinhos próximos como layer 1 (≤30 km)", () => {
    const members = pickRegionMembers(SP_CAPITAL, [
      SP_CAPITAL,
      SP_GUARULHOS,
      SP_OSASCO,
      SP_ATIBAIA,
    ]);

    const layer1Ids = members.filter((m) => m.layer === 1).map((m) => m.member_city_id);
    expect(layer1Ids).toContain(SP_GUARULHOS.id);
    expect(layer1Ids).toContain(SP_OSASCO.id);
    expect(layer1Ids).not.toContain(SP_ATIBAIA.id); // 49 km > 30
  });

  it("classifica vizinhos médios como layer 2 (30-60 km)", () => {
    const members = pickRegionMembers(SP_CAPITAL, [SP_CAPITAL, SP_ATIBAIA, SP_CAMPINAS]);

    const layer2Ids = members.filter((m) => m.layer === 2).map((m) => m.member_city_id);
    expect(layer2Ids).toContain(SP_ATIBAIA.id);
    expect(layer2Ids).not.toContain(SP_CAMPINAS.id); // ~90 km > 60
  });

  it("nunca inclui a própria cidade-base como membro", () => {
    const members = pickRegionMembers(SP_CAPITAL, [SP_CAPITAL, SP_GUARULHOS]);
    const ids = members.map((m) => m.member_city_id);
    expect(ids).not.toContain(SP_CAPITAL.id);
    expect(ids).toContain(SP_GUARULHOS.id);
  });

  it("nunca inclui cidades de UF diferente (a regra é estritamente intra-estadual)", () => {
    const members = pickRegionMembers(SP_CAPITAL, [SP_CAPITAL, RJ_RIO, SP_GUARULHOS]);
    const ids = members.map((m) => m.member_city_id);
    expect(ids).not.toContain(RJ_RIO.id);
    expect(ids).toContain(SP_GUARULHOS.id);
  });

  it("pula cidades sem latitude/longitude (degrada graciosamente)", () => {
    const members = pickRegionMembers(SP_CAPITAL, [SP_CAPITAL, SP_NO_GEO, SP_GUARULHOS]);
    const ids = members.map((m) => m.member_city_id);
    expect(ids).not.toContain(SP_NO_GEO.id);
    expect(ids).toContain(SP_GUARULHOS.id);
  });

  it("retorna lista vazia quando a cidade-base não tem nenhum vizinho dentro de 60 km", () => {
    const ISOLATED = {
      id: 200,
      state: "AC",
      name: "Cidade Isolada",
      latitude: -10,
      longitude: -70,
    };
    const FAR_AWAY = {
      id: 201,
      state: "AC",
      name: "Outra Cidade",
      latitude: -8,
      longitude: -68,
    };
    const members = pickRegionMembers(ISOLATED, [ISOLATED, FAR_AWAY]);
    expect(members).toEqual([]);
  });

  it("respeita o teto de 12 membros em layer 1", () => {
    // Gera 20 cidades a ~10 km da base (cluster denso, todas em SP).
    const dense = Array.from({ length: 20 }, (_, i) => ({
      id: 1000 + i,
      state: "SP",
      name: `Vizinha ${i}`,
      latitude: -23.5505 + 0.01 + i * 0.001, // pequenas variações
      longitude: -46.6333,
    }));

    const members = pickRegionMembers(SP_CAPITAL, [SP_CAPITAL, ...dense]);
    const layer1 = members.filter((m) => m.layer === 1);

    expect(layer1.length).toBeLessThanOrEqual(12);
  });

  it("ordena cada layer por distância ASC (mais próximo primeiro)", () => {
    const members = pickRegionMembers(SP_CAPITAL, [
      SP_CAPITAL,
      SP_GUARULHOS, // ~17 km
      SP_OSASCO, // ~16 km
      SP_ATIBAIA, // ~49 km (layer 2)
    ]);

    const layer1 = members.filter((m) => m.layer === 1);
    expect(layer1.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < layer1.length; i++) {
      expect(layer1[i].distance_km).toBeGreaterThanOrEqual(layer1[i - 1].distance_km);
    }
  });
});
