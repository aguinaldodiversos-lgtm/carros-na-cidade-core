import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Cobertura do endpoint POST /api/internal/location/resolve.
 *
 *   - service: validação lat/long, classifyConfidence, integração com
 *     getRegionByBaseSlugDynamic.
 *   - controller: gates 400 para payload inválido, 200 com data:null
 *     quando fora de cobertura.
 *
 * O pool de Postgres e o getRegionByBaseSlugDynamic são mockados para
 * evitar dependência de DB.
 */

const mocks = vi.hoisted(() => ({
  poolQuery: vi.fn(),
  getRegionByBaseSlugDynamic: vi.fn(),
}));

vi.mock("../../src/infrastructure/database/db.js", () => ({
  pool: { query: mocks.poolQuery },
}));

vi.mock("../../src/modules/regions/regions.service.js", () => ({
  getRegionByBaseSlugDynamic: mocks.getRegionByBaseSlugDynamic,
}));

import {
  findNearestCity,
  resolveLocation,
  __INTERNAL__,
} from "../../src/modules/location/location.service.js";
import { resolveLocationEndpoint } from "../../src/modules/location/location.controller.js";

function makeRes() {
  const res = {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  return res;
}

const ATIBAIA_LAT = -23.117;
const ATIBAIA_LNG = -46.55;

beforeEach(() => {
  mocks.poolQuery.mockReset();
  mocks.getRegionByBaseSlugDynamic.mockReset();
});

afterEach(() => vi.clearAllMocks());

describe("location.service — classifyConfidence", () => {
  it("≤30 km → high", () => {
    expect(__INTERNAL__.classifyConfidence(0)).toBe("high");
    expect(__INTERNAL__.classifyConfidence(30)).toBe("high");
  });
  it("30 < d ≤ 60 → medium", () => {
    expect(__INTERNAL__.classifyConfidence(30.01)).toBe("medium");
    expect(__INTERNAL__.classifyConfidence(60)).toBe("medium");
  });
  it("60 < d ≤ 80 → low", () => {
    expect(__INTERNAL__.classifyConfidence(60.01)).toBe("low");
    expect(__INTERNAL__.classifyConfidence(80)).toBe("low");
  });
  it("> 80 → null (caller cai em fallback)", () => {
    expect(__INTERNAL__.classifyConfidence(80.01)).toBeNull();
    expect(__INTERNAL__.classifyConfidence(1000)).toBeNull();
  });
});

describe("location.service — findNearestCity (validação)", () => {
  it("lat fora de [-90,90] → null sem SQL", async () => {
    const result = await findNearestCity(91, -46);
    expect(result).toBeNull();
    expect(mocks.poolQuery).not.toHaveBeenCalled();
  });
  it("lng fora de [-180,180] → null sem SQL", async () => {
    const result = await findNearestCity(-23, 200);
    expect(result).toBeNull();
    expect(mocks.poolQuery).not.toHaveBeenCalled();
  });
  it("lat NaN → null", async () => {
    const result = await findNearestCity(Number.NaN, -46);
    expect(result).toBeNull();
  });
});

describe("location.service — findNearestCity (happy path)", () => {
  it("retorna cidade com distance_km arredondada", async () => {
    mocks.poolQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 7,
          slug: "atibaia-sp",
          name: "Atibaia",
          state: "SP",
          distance_km: "3.21",
        },
      ],
    });

    const result = await findNearestCity(ATIBAIA_LAT, ATIBAIA_LNG);
    expect(result).toEqual({
      city: { id: 7, slug: "atibaia-sp", name: "Atibaia", state: "SP" },
      distanceKm: 3.21,
    });
  });

  it("retorna null quando ninguém no raio", async () => {
    mocks.poolQuery.mockResolvedValueOnce({ rows: [] });
    const result = await findNearestCity(0, 0); // meio do Atlântico
    expect(result).toBeNull();
  });

  it("SQL exception → null silencioso (caller cai em fallback)", async () => {
    mocks.poolQuery.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const result = await findNearestCity(ATIBAIA_LAT, ATIBAIA_LNG);
    expect(result).toBeNull();
  });
});

describe("location.service — resolveLocation (integração com região)", () => {
  it("coordenada de Atibaia → resolve atibaia-sp + Região de Atibaia", async () => {
    mocks.poolQuery.mockResolvedValueOnce({
      rows: [
        { id: 7, slug: "atibaia-sp", name: "Atibaia", state: "SP", distance_km: "3.2" },
      ],
    });
    mocks.getRegionByBaseSlugDynamic.mockResolvedValueOnce({
      base: { id: 7, slug: "atibaia-sp", name: "Atibaia", state: "SP" },
      members: [
        { slug: "itatiba-sp", name: "Itatiba", state: "SP", layer: 1, distance_km: 20 },
      ],
      radius_km: 80,
    });

    const result = await resolveLocation(ATIBAIA_LAT, ATIBAIA_LNG);

    expect(result).not.toBeNull();
    expect(result.city).toEqual({ slug: "atibaia-sp", name: "Atibaia", state: "SP" });
    expect(result.state).toEqual({ code: "SP", slug: "sp" });
    expect(result.region).toEqual({
      slug: "atibaia-sp",
      name: "Região de Atibaia",
      href: "/carros-usados/regiao/atibaia-sp",
      memberCount: 1,
    });
    expect(result.confidence).toBe("high");
    expect(result.distanceKm).toBe(3.2);
  });

  it("cidade encontrada mas sem região resolvível → city/state OK, region null", async () => {
    mocks.poolQuery.mockResolvedValueOnce({
      rows: [{ id: 7, slug: "isolada-sp", name: "Isolada", state: "SP", distance_km: 10 }],
    });
    mocks.getRegionByBaseSlugDynamic.mockResolvedValueOnce(null);

    const result = await resolveLocation(-23, -46);
    expect(result.city.slug).toBe("isolada-sp");
    expect(result.region).toBeNull();
  });

  it("região fetcher joga → region null, lista de cidade continua", async () => {
    mocks.poolQuery.mockResolvedValueOnce({
      rows: [{ id: 7, slug: "x-sp", name: "X", state: "SP", distance_km: 10 }],
    });
    mocks.getRegionByBaseSlugDynamic.mockRejectedValueOnce(new Error("BFF down"));

    const result = await resolveLocation(-23, -46);
    expect(result.city.slug).toBe("x-sp");
    expect(result.region).toBeNull();
  });

  it("fora de cobertura (>80 km) → null", async () => {
    mocks.poolQuery.mockResolvedValueOnce({
      rows: [{ id: 7, slug: "longe-pa", name: "Longe", state: "PA", distance_km: 1500 }],
    });
    const result = await resolveLocation(ATIBAIA_LAT, ATIBAIA_LNG);
    expect(result).toBeNull();
  });

  it("coordenadas inválidas → null sem SQL", async () => {
    const result = await resolveLocation(999, -46);
    expect(result).toBeNull();
    expect(mocks.poolQuery).not.toHaveBeenCalled();
  });
});

describe("controller POST /api/internal/location/resolve", () => {
  it("body válido → 200 com data: city/state/region", async () => {
    mocks.poolQuery.mockResolvedValueOnce({
      rows: [{ id: 7, slug: "atibaia-sp", name: "Atibaia", state: "SP", distance_km: 3.2 }],
    });
    mocks.getRegionByBaseSlugDynamic.mockResolvedValueOnce({
      base: { id: 7, slug: "atibaia-sp", name: "Atibaia", state: "SP" },
      members: [],
      radius_km: 80,
    });

    const req = { body: { latitude: ATIBAIA_LAT, longitude: ATIBAIA_LNG } };
    const res = makeRes();
    await resolveLocationEndpoint(req, res, vi.fn());

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.city.slug).toBe("atibaia-sp");
  });

  it("latitude inválida → 400", async () => {
    const req = { body: { latitude: 999, longitude: 0 } };
    const res = makeRes();
    await resolveLocationEndpoint(req, res, vi.fn());
    expect(res.statusCode).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  it("longitude inválida → 400", async () => {
    const req = { body: { latitude: 0, longitude: 999 } };
    const res = makeRes();
    await resolveLocationEndpoint(req, res, vi.fn());
    expect(res.statusCode).toBe(400);
  });

  it("body sem latitude → 400", async () => {
    const req = { body: {} };
    const res = makeRes();
    await resolveLocationEndpoint(req, res, vi.fn());
    expect(res.statusCode).toBe(400);
  });

  it("latitude/longitude como string numérica é aceita (coerção)", async () => {
    mocks.poolQuery.mockResolvedValueOnce({
      rows: [{ id: 7, slug: "atibaia-sp", name: "Atibaia", state: "SP", distance_km: 3.2 }],
    });
    mocks.getRegionByBaseSlugDynamic.mockResolvedValueOnce(null);

    const req = { body: { latitude: "-23.117", longitude: "-46.55" } };
    const res = makeRes();
    await resolveLocationEndpoint(req, res, vi.fn());
    expect(res.statusCode).toBe(200);
    expect(res.body.data.city.slug).toBe("atibaia-sp");
  });

  it("fora de cobertura → 200 com data:null", async () => {
    mocks.poolQuery.mockResolvedValueOnce({ rows: [] });
    const req = { body: { latitude: 0, longitude: 0 } };
    const res = makeRes();
    await resolveLocationEndpoint(req, res, vi.fn());
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true, data: null });
  });
});
