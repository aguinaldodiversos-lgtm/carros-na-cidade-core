import { describe, it, expect, vi, beforeEach } from "vitest";

const poolQuery = vi.fn();

vi.mock("../../src/infrastructure/database/db.js", () => ({
  pool: { query: (...args) => poolQuery(...args) },
  query: (...args) => poolQuery(...args),
}));

vi.mock("../../src/modules/admin/regional-settings/admin-regional-settings.service.js", () => ({
  getRegionalRadiusKm: vi.fn(),
}));

import { getRegionByBaseSlugDynamic } from "../../src/modules/regions/regions.service.js";
import { getRegionalRadiusKm } from "../../src/modules/admin/regional-settings/admin-regional-settings.service.js";

const ATIBAIA = {
  id: 100,
  slug: "atibaia-sp",
  name: "Atibaia",
  state: "SP",
  latitude: -23.116,
  longitude: -46.55,
};

const HAVERSINE_NEIGHBORS = [
  {
    city_id: 200,
    slug: "braganca-paulista-sp",
    name: "Bragança Paulista",
    state: "SP",
    distance_km: 22.1,
  },
  {
    city_id: 201,
    slug: "piracaia-sp",
    name: "Piracaia",
    state: "SP",
    distance_km: 18.3,
  },
];

const MEMBERSHIP_NEIGHBORS = [
  {
    city_id: 999,
    slug: "fallback-city-sp",
    name: "Fallback City",
    state: "SP",
    layer: 2,
    distance_km: 45,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  poolQuery.mockReset();
});

describe("getRegionByBaseSlugDynamic — base inexistente", () => {
  it("retorna null quando cidade-base não existe", async () => {
    poolQuery.mockResolvedValueOnce({ rows: [] });
    const result = await getRegionByBaseSlugDynamic("inexistente-xx");
    expect(result).toBeNull();
  });
});

describe("getRegionByBaseSlugDynamic — caminho haversine OK", () => {
  it("retorna members do haversine quando base tem lat/lon e há vizinhas", async () => {
    getRegionalRadiusKm.mockResolvedValue(80);
    poolQuery
      .mockResolvedValueOnce({ rows: [ATIBAIA] }) // findBaseCity
      .mockResolvedValueOnce({ rows: HAVERSINE_NEIGHBORS }); // haversine

    const result = await getRegionByBaseSlugDynamic("atibaia-sp");

    expect(result).not.toBeNull();
    expect(result.base.slug).toBe("atibaia-sp");
    expect(result.radius_km).toBe(80);
    expect(result.members).toHaveLength(2);
    expect(result.members[0].slug).toBe("braganca-paulista-sp");
    // Layer derivado da distância: dist <= 30 → layer 1
    expect(result.members[0].layer).toBe(1);
  });

  it("respeita radius custom (50) configurado pelo admin", async () => {
    getRegionalRadiusKm.mockResolvedValue(50);
    poolQuery
      .mockResolvedValueOnce({ rows: [ATIBAIA] })
      .mockResolvedValueOnce({ rows: HAVERSINE_NEIGHBORS });

    const result = await getRegionByBaseSlugDynamic("atibaia-sp");

    expect(result.radius_km).toBe(50);
    // Confirma que a 2a query (haversine) recebe 50 como parâmetro de raio.
    const haversineCall = poolQuery.mock.calls[1];
    const params = haversineCall[1];
    expect(params).toContain(50);
  });
});

describe("getRegionByBaseSlugDynamic — fallback para region_memberships", () => {
  it("cai para memberships quando base não tem lat/lon", async () => {
    getRegionalRadiusKm.mockResolvedValue(80);
    const baseSemCoords = { ...ATIBAIA, latitude: null, longitude: null };
    poolQuery
      .mockResolvedValueOnce({ rows: [baseSemCoords] }) // findBaseCity
      .mockResolvedValueOnce({ rows: MEMBERSHIP_NEIGHBORS }); // memberships fallback

    const result = await getRegionByBaseSlugDynamic("atibaia-sp");

    expect(result).not.toBeNull();
    expect(result.members).toHaveLength(1);
    expect(result.members[0].slug).toBe("fallback-city-sp");
    // Confirma que NÃO chamou a query haversine (só base + memberships).
    expect(poolQuery).toHaveBeenCalledTimes(2);
  });

  it("cai para memberships quando haversine retorna 0 vizinhas", async () => {
    getRegionalRadiusKm.mockResolvedValue(80);
    poolQuery
      .mockResolvedValueOnce({ rows: [ATIBAIA] }) // findBaseCity
      .mockResolvedValueOnce({ rows: [] }) // haversine vazio
      .mockResolvedValueOnce({ rows: MEMBERSHIP_NEIGHBORS }); // memberships fallback

    const result = await getRegionByBaseSlugDynamic("atibaia-sp");

    expect(result.members).toHaveLength(1);
    expect(result.members[0].slug).toBe("fallback-city-sp");
    expect(poolQuery).toHaveBeenCalledTimes(3);
  });

  it("cai para memberships quando query haversine lança", async () => {
    getRegionalRadiusKm.mockResolvedValue(80);
    poolQuery
      .mockResolvedValueOnce({ rows: [ATIBAIA] }) // findBaseCity
      .mockRejectedValueOnce(new Error("simulação de falha SQL")) // haversine falha
      .mockResolvedValueOnce({ rows: MEMBERSHIP_NEIGHBORS }); // memberships fallback

    const result = await getRegionByBaseSlugDynamic("atibaia-sp");

    expect(result.members).toHaveLength(1);
    expect(result.members[0].slug).toBe("fallback-city-sp");
  });
});

describe("getRegionByBaseSlugDynamic — radius read robustness", () => {
  it("usa 80 quando getRegionalRadiusKm lança (degrade graceful)", async () => {
    getRegionalRadiusKm.mockRejectedValue(new Error("DB offline"));
    poolQuery
      .mockResolvedValueOnce({ rows: [ATIBAIA] })
      .mockResolvedValueOnce({ rows: HAVERSINE_NEIGHBORS });

    const result = await getRegionByBaseSlugDynamic("atibaia-sp");

    expect(result.radius_km).toBe(80);
    const haversineCall = poolQuery.mock.calls[1];
    expect(haversineCall[1]).toContain(80);
  });
});

describe("getRegionByBaseSlugDynamic — contenção territorial", () => {
  it("query haversine filtra por mesma UF da cidade base", async () => {
    getRegionalRadiusKm.mockResolvedValue(80);
    poolQuery
      .mockResolvedValueOnce({ rows: [ATIBAIA] })
      .mockResolvedValueOnce({ rows: HAVERSINE_NEIGHBORS });

    await getRegionByBaseSlugDynamic("atibaia-sp");

    const haversineCall = poolQuery.mock.calls[1];
    const sql = haversineCall[0];
    const params = haversineCall[1];
    // SQL precisa filtrar por state da base.
    expect(sql).toMatch(/c\.state\s*=\s*\$2/);
    expect(params).toContain("SP");
  });
});
