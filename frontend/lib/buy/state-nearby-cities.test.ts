import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { StateRegionSummary } from "@/lib/territory/fetch-state-regions";
import type { RegionPayload } from "@/lib/regions/fetch-region";

const cookiesMock = vi.fn();
const fetchRegionMock = vi.fn();

vi.mock("next/headers", () => ({
  cookies: () => ({
    get: (name: string) => cookiesMock(name),
  }),
}));

vi.mock("@/lib/regions/fetch-region", () => ({
  fetchRegionByCitySlug: (slug: string) => fetchRegionMock(slug),
}));

import { resolveStateNearbyContext } from "./state-nearby-cities";
import { CITY_COOKIE_NAME } from "@/lib/city/city-constants";

function makeRegion(overrides: Partial<StateRegionSummary> = {}): StateRegionSummary {
  return {
    slug: "atibaia-sp",
    name: "Região de Atibaia",
    baseCitySlug: "atibaia-sp",
    baseCityName: "Atibaia",
    href: "/carros-usados/regiao/atibaia-sp",
    cityNames: ["Atibaia", "Bragança Paulista", "Jarinu"],
    citySlugs: ["atibaia-sp", "braganca-paulista-sp", "jarinu-sp"],
    adsCount: 4,
    featuredCount: 1,
    radiusKm: 80,
    ...overrides,
  };
}

function makeRegionPayload(overrides: Partial<RegionPayload> = {}): RegionPayload {
  return {
    base: {
      id: 1,
      slug: "atibaia-sp",
      name: "Atibaia",
      state: "SP",
    },
    members: [
      {
        city_id: 2,
        slug: "braganca-paulista-sp",
        name: "Bragança Paulista",
        state: "SP",
        layer: 1,
        distance_km: 18,
      },
      {
        city_id: 3,
        slug: "jarinu-sp",
        name: "Jarinu",
        state: "SP",
        layer: 1,
        distance_km: 14,
      },
    ],
    radius_km: 80,
    ...overrides,
  };
}

function mockCookie(value: object | null) {
  cookiesMock.mockImplementation((name: string) => {
    if (name !== CITY_COOKIE_NAME) return undefined;
    if (value === null) return undefined;
    return { value: encodeURIComponent(JSON.stringify(value)) };
  });
}

beforeEach(() => {
  cookiesMock.mockReset();
  fetchRegionMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("resolveStateNearbyContext — estágio 1 (match na amostra)", () => {
  it("sem cookie → null", async () => {
    mockCookie(null);
    expect(await resolveStateNearbyContext("SP", [makeRegion()])).toBeNull();
  });

  it("cookie de outra UF → null (não cruza estados)", async () => {
    mockCookie({ slug: "belo-horizonte-mg", name: "Belo Horizonte", state: "MG" });
    expect(await resolveStateNearbyContext("SP", [makeRegion()])).toBeNull();
  });

  it("cookie do mesmo estado + match na amostra → resolve sem fetch extra", async () => {
    mockCookie({ slug: "braganca-paulista-sp", name: "Bragança Paulista", state: "SP" });
    const ctx = await resolveStateNearbyContext("SP", [makeRegion()]);

    expect(ctx).not.toBeNull();
    expect(ctx?.activeCityName).toBe("Bragança Paulista");
    expect(ctx?.nearbyCities).toEqual([
      { slug: "atibaia-sp", name: "Atibaia" },
      { slug: "braganca-paulista-sp", name: "Bragança Paulista" },
      { slug: "jarinu-sp", name: "Jarinu" },
    ]);
    expect(fetchRegionMock).not.toHaveBeenCalled();
  });

  it("UF inválida → null", async () => {
    mockCookie({ slug: "atibaia-sp", name: "Atibaia", state: "SP" });
    expect(await resolveStateNearbyContext("", [makeRegion()])).toBeNull();
    expect(await resolveStateNearbyContext("XYZ", [makeRegion()])).toBeNull();
  });
});

describe("resolveStateNearbyContext — estágio 2 (fetch dedicado)", () => {
  it("amostra sem match → fetch por slug, resolve com members do backend", async () => {
    mockCookie({ slug: "atibaia-sp", name: "Atibaia", state: "SP" });
    fetchRegionMock.mockResolvedValue(makeRegionPayload());

    const ctx = await resolveStateNearbyContext("SP", []);

    expect(fetchRegionMock).toHaveBeenCalledWith("atibaia-sp");
    expect(ctx).not.toBeNull();
    expect(ctx?.activeCityName).toBe("Atibaia");
    expect(ctx?.nearbyCities).toEqual([
      { slug: "atibaia-sp", name: "Atibaia" },
      { slug: "braganca-paulista-sp", name: "Bragança Paulista" },
      { slug: "jarinu-sp", name: "Jarinu" },
    ]);
  });

  it("fetch retorna null (backend offline) → null (graceful)", async () => {
    mockCookie({ slug: "atibaia-sp", name: "Atibaia", state: "SP" });
    fetchRegionMock.mockResolvedValue(null);

    expect(await resolveStateNearbyContext("SP", [])).toBeNull();
  });

  it("filtra members de outra UF (defesa contra payload inconsistente)", async () => {
    mockCookie({ slug: "atibaia-sp", name: "Atibaia", state: "SP" });
    fetchRegionMock.mockResolvedValue(
      makeRegionPayload({
        members: [
          {
            city_id: 9,
            slug: "outro-mg",
            name: "Outro",
            state: "MG",
            layer: 1,
            distance_km: 100,
          },
          {
            city_id: 2,
            slug: "jarinu-sp",
            name: "Jarinu",
            state: "SP",
            layer: 1,
            distance_km: 14,
          },
        ],
      })
    );

    const ctx = await resolveStateNearbyContext("SP", []);
    const slugs = ctx?.nearbyCities.map((c) => c.slug) ?? [];
    expect(slugs).toContain("atibaia-sp");
    expect(slugs).toContain("jarinu-sp");
    expect(slugs).not.toContain("outro-mg");
  });

  it("de-dup quando members repete a base", async () => {
    mockCookie({ slug: "atibaia-sp", name: "Atibaia", state: "SP" });
    fetchRegionMock.mockResolvedValue(
      makeRegionPayload({
        members: [
          {
            city_id: 1,
            slug: "atibaia-sp",
            name: "Atibaia",
            state: "SP",
            layer: 0,
            distance_km: 0,
          },
          {
            city_id: 2,
            slug: "jarinu-sp",
            name: "Jarinu",
            state: "SP",
            layer: 1,
            distance_km: 14,
          },
        ],
      })
    );

    const ctx = await resolveStateNearbyContext("SP", []);
    expect(ctx?.nearbyCities.map((c) => c.slug)).toEqual(["atibaia-sp", "jarinu-sp"]);
  });
});
