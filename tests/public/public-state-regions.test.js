import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Cobertura do endpoint `GET /api/public/states/:uf/regions`:
 *
 *   1. Controller — valida UF, sanitiza limit, monta envelope.
 *   2. Service    — pipeline candidatas → resolver regional → dedup →
 *                   contagem agregada → ordenação.
 *
 * Mocks: cities.repository.findCitiesByStateVariants e
 * regions.service.getRegionByBaseSlugDynamic. O pool de DB é mockado
 * indiretamente via countAdsByCitySlugs — usamos um stub para evitar
 * dependência do Postgres real.
 */

const mocks = vi.hoisted(() => ({
  findCitiesByStateVariants: vi.fn(),
  getRegionByBaseSlugDynamic: vi.fn(),
  poolQuery: vi.fn(),
}));

vi.mock("../../src/modules/cities/cities.repository.js", () => ({
  findCitiesByStateVariants: mocks.findCitiesByStateVariants,
}));

vi.mock("../../src/modules/regions/regions.service.js", () => ({
  getRegionByBaseSlugDynamic: mocks.getRegionByBaseSlugDynamic,
}));

vi.mock("../../src/infrastructure/database/db.js", () => ({
  pool: { query: mocks.poolQuery },
}));

import { listFeaturedRegionsByUf } from "../../src/modules/regions/state-regions.service.js";
import { getFeaturedRegionsByState } from "../../src/modules/public/public-state.controller.js";

function makeRes() {
  const headers = {};
  const res = {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    set(name, value) {
      headers[name.toLowerCase()] = value;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  res._headers = headers;
  return res;
}

function makeReq({ params = {}, query = {} } = {}) {
  return { params, query };
}

function buildRegion(baseSlug, baseName, members = [], radiusKm = 80) {
  return {
    base: { id: 1, slug: baseSlug, name: baseName, state: "SP" },
    members: members.map((m, idx) => ({
      city_id: idx + 10,
      slug: m.slug,
      name: m.name,
      state: m.state ?? "SP",
      layer: m.layer ?? 1,
      distance_km: m.distance_km ?? 25,
    })),
    radius_km: radiusKm,
  };
}

function buildCity(slug, name, state = "SP") {
  return { id: Math.abs(slug.length * 7), slug, name, state };
}

beforeEach(() => {
  mocks.findCitiesByStateVariants.mockReset();
  mocks.getRegionByBaseSlugDynamic.mockReset();
  mocks.poolQuery.mockReset();

  // Default: a contagem de anúncios devolve mapa vazio (todas as regiões
  // com 0 anúncios). Cada teste sobrescreve quando precisa.
  mocks.poolQuery.mockResolvedValue({ rows: [] });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("listFeaturedRegionsByUf — validação de UF", () => {
  it("UF vazia → retorna null", async () => {
    const result = await listFeaturedRegionsByUf("");
    expect(result).toBeNull();
  });

  it("UF com 1 letra → retorna null", async () => {
    const result = await listFeaturedRegionsByUf("S");
    expect(result).toBeNull();
  });

  it("UF com caracteres inválidos é sanitizada → S1P vira SP", async () => {
    // S1P → toUpperCase → 'S1P' → replace [^A-Z] → 'SP' → slice 2 → 'SP'
    mocks.findCitiesByStateVariants.mockResolvedValue([]);
    const result = await listFeaturedRegionsByUf("S1P");
    expect(result).toEqual([]);
    expect(mocks.findCitiesByStateVariants).toHaveBeenCalledWith("SP");
  });

  it("UF sem cidades cadastradas → retorna []", async () => {
    mocks.findCitiesByStateVariants.mockResolvedValue([]);
    const result = await listFeaturedRegionsByUf("SP");
    expect(result).toEqual([]);
  });
});

describe("listFeaturedRegionsByUf — montagem de regiões", () => {
  it("monta região válida com cityNames, citySlugs e href correto", async () => {
    mocks.findCitiesByStateVariants.mockResolvedValue([
      buildCity("atibaia-sp", "Atibaia"),
    ]);
    mocks.getRegionByBaseSlugDynamic.mockResolvedValueOnce(
      buildRegion("atibaia-sp", "Atibaia", [
        { slug: "itatiba-sp", name: "Itatiba" },
        { slug: "jarinu-sp", name: "Jarinu" },
      ])
    );

    const result = await listFeaturedRegionsByUf("SP");

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      slug: "atibaia-sp",
      name: "Região de Atibaia",
      baseCitySlug: "atibaia-sp",
      baseCityName: "Atibaia",
      href: "/carros-usados/regiao/atibaia-sp",
      cityNames: ["Atibaia", "Itatiba", "Jarinu"],
      citySlugs: ["atibaia-sp", "itatiba-sp", "jarinu-sp"],
      radiusKm: 80,
    });
  });

  it("baseCitySlug aparece em [0] de citySlugs (alinhado com boost regional)", async () => {
    mocks.findCitiesByStateVariants.mockResolvedValue([
      buildCity("atibaia-sp", "Atibaia"),
    ]);
    mocks.getRegionByBaseSlugDynamic.mockResolvedValueOnce(
      buildRegion("atibaia-sp", "Atibaia", [{ slug: "vizinha-sp", name: "Vizinha" }])
    );

    const result = await listFeaturedRegionsByUf("SP");
    expect(result[0].citySlugs[0]).toBe("atibaia-sp");
  });
});

describe("listFeaturedRegionsByUf — dedup territorial", () => {
  it("cidade que já é membro de uma região anterior NÃO vira base concorrente", async () => {
    mocks.findCitiesByStateVariants.mockResolvedValue([
      buildCity("atibaia-sp", "Atibaia"),
      buildCity("itatiba-sp", "Itatiba"),
      buildCity("campinas-sp", "Campinas"),
    ]);
    mocks.getRegionByBaseSlugDynamic
      .mockResolvedValueOnce(
        buildRegion("atibaia-sp", "Atibaia", [
          { slug: "itatiba-sp", name: "Itatiba" },
        ])
      )
      .mockResolvedValueOnce(buildRegion("campinas-sp", "Campinas", []));
    // Itatiba não deve ser consultada (consumida por Atibaia).

    const result = await listFeaturedRegionsByUf("SP");

    expect(result.map((r) => r.slug)).toEqual(["atibaia-sp", "campinas-sp"]);
    expect(mocks.getRegionByBaseSlugDynamic).toHaveBeenCalledTimes(2);
    expect(mocks.getRegionByBaseSlugDynamic).toHaveBeenCalledWith("atibaia-sp");
    expect(mocks.getRegionByBaseSlugDynamic).toHaveBeenCalledWith("campinas-sp");
    expect(mocks.getRegionByBaseSlugDynamic).not.toHaveBeenCalledWith("itatiba-sp");
  });
});

describe("listFeaturedRegionsByUf — não mistura UFs", () => {
  it("região cuja base é de UF diferente é descartada (defesa)", async () => {
    mocks.findCitiesByStateVariants.mockResolvedValue([
      buildCity("cidade-fronteira", "Cidade Fronteira", "SP"),
    ]);
    // Simula bug do pipeline regional: retorna base de outra UF.
    mocks.getRegionByBaseSlugDynamic.mockResolvedValueOnce({
      base: { id: 1, slug: "cidade-fronteira", name: "Cidade Fronteira", state: "MG" },
      members: [],
      radius_km: 80,
    });

    const result = await listFeaturedRegionsByUf("SP");
    expect(result).toEqual([]);
  });

  it("members de UF diferente não entram em cityNames/citySlugs", async () => {
    mocks.findCitiesByStateVariants.mockResolvedValue([
      buildCity("atibaia-sp", "Atibaia"),
    ]);
    mocks.getRegionByBaseSlugDynamic.mockResolvedValueOnce({
      base: { id: 1, slug: "atibaia-sp", name: "Atibaia", state: "SP" },
      members: [
        { city_id: 2, slug: "extrema-mg", name: "Extrema", state: "MG", layer: 2, distance_km: 55 },
        { city_id: 3, slug: "itatiba-sp", name: "Itatiba", state: "SP", layer: 1, distance_km: 20 },
      ],
      radius_km: 80,
    });

    const result = await listFeaturedRegionsByUf("SP");
    expect(result[0].cityNames).toEqual(["Atibaia", "Itatiba"]);
    expect(result[0].citySlugs).toEqual(["atibaia-sp", "itatiba-sp"]);
  });
});

describe("listFeaturedRegionsByUf — contagem agregada de anúncios", () => {
  it("soma active_count e featured_count de todas as cidades da região", async () => {
    mocks.findCitiesByStateVariants.mockResolvedValue([
      buildCity("atibaia-sp", "Atibaia"),
    ]);
    mocks.getRegionByBaseSlugDynamic.mockResolvedValueOnce(
      buildRegion("atibaia-sp", "Atibaia", [
        { slug: "itatiba-sp", name: "Itatiba" },
        { slug: "jarinu-sp", name: "Jarinu" },
      ])
    );
    mocks.poolQuery.mockResolvedValueOnce({
      rows: [
        { slug: "atibaia-sp", active_count: 10, featured_count: 3 },
        { slug: "itatiba-sp", active_count: 5, featured_count: 1 },
        { slug: "jarinu-sp", active_count: 2, featured_count: 0 },
      ],
    });

    const result = await listFeaturedRegionsByUf("SP");
    expect(result[0].adsCount).toBe(17);
    expect(result[0].featuredCount).toBe(4);
  });

  it("contagem ausente → 0 (sem inventar)", async () => {
    mocks.findCitiesByStateVariants.mockResolvedValue([
      buildCity("atibaia-sp", "Atibaia"),
    ]);
    mocks.getRegionByBaseSlugDynamic.mockResolvedValueOnce(
      buildRegion("atibaia-sp", "Atibaia", [])
    );
    mocks.poolQuery.mockResolvedValueOnce({ rows: [] });

    const result = await listFeaturedRegionsByUf("SP");
    expect(result[0].adsCount).toBe(0);
    expect(result[0].featuredCount).toBe(0);
  });
});

describe("listFeaturedRegionsByUf — ordenação", () => {
  it("ordena por adsCount desc, featuredCount desc, baseCityName asc", async () => {
    mocks.findCitiesByStateVariants.mockResolvedValue([
      buildCity("a-sp", "A"),
      buildCity("b-sp", "B"),
      buildCity("c-sp", "C"),
      buildCity("d-sp", "D"),
    ]);
    mocks.getRegionByBaseSlugDynamic
      .mockResolvedValueOnce(buildRegion("a-sp", "A", []))
      .mockResolvedValueOnce(buildRegion("b-sp", "B", []))
      .mockResolvedValueOnce(buildRegion("c-sp", "C", []))
      .mockResolvedValueOnce(buildRegion("d-sp", "D", []));
    mocks.poolQuery.mockResolvedValueOnce({
      rows: [
        { slug: "a-sp", active_count: 5, featured_count: 1 },
        { slug: "b-sp", active_count: 10, featured_count: 0 },
        { slug: "c-sp", active_count: 10, featured_count: 5 },
        { slug: "d-sp", active_count: 10, featured_count: 5 },
      ],
    });

    const result = await listFeaturedRegionsByUf("SP");
    // C e D: empate ads + featured → ordem alfabética → C, D
    // B: ads=10 mas featured=0 → fica depois de C e D (mesmo ads, menos featured)
    // A: ads=5 → última
    expect(result.map((r) => r.baseCityName)).toEqual(["C", "D", "B", "A"]);
  });
});

describe("listFeaturedRegionsByUf — limite", () => {
  it("respeita default maxRegions=8", async () => {
    const cities = Array.from({ length: 20 }, (_, i) =>
      buildCity(`cidade-${i}-sp`, `Cidade ${i}`)
    );
    mocks.findCitiesByStateVariants.mockResolvedValue(cities);
    for (let i = 0; i < 20; i++) {
      mocks.getRegionByBaseSlugDynamic.mockResolvedValueOnce(
        buildRegion(`cidade-${i}-sp`, `Cidade ${i}`, [])
      );
    }

    const result = await listFeaturedRegionsByUf("SP");
    expect(result).toHaveLength(8);
  });

  it("aceita maxRegions custom até o hard cap (12)", async () => {
    const cities = Array.from({ length: 20 }, (_, i) =>
      buildCity(`cidade-${i}-sp`, `Cidade ${i}`)
    );
    mocks.findCitiesByStateVariants.mockResolvedValue(cities);
    for (let i = 0; i < 20; i++) {
      mocks.getRegionByBaseSlugDynamic.mockResolvedValueOnce(
        buildRegion(`cidade-${i}-sp`, `Cidade ${i}`, [])
      );
    }

    const result = await listFeaturedRegionsByUf("SP", { maxRegions: 100 });
    // Hard cap 12.
    expect(result).toHaveLength(12);
  });
});

describe("listFeaturedRegionsByUf — resiliência", () => {
  it("região individual que falha não derruba o resultado", async () => {
    mocks.findCitiesByStateVariants.mockResolvedValue([
      buildCity("ok-sp", "OK"),
      buildCity("broken-sp", "Broken"),
      buildCity("ok2-sp", "OK2"),
    ]);
    mocks.getRegionByBaseSlugDynamic
      .mockResolvedValueOnce(buildRegion("ok-sp", "OK", []))
      .mockRejectedValueOnce(new Error("DB error"))
      .mockResolvedValueOnce(buildRegion("ok2-sp", "OK2", []));

    const result = await listFeaturedRegionsByUf("SP");
    expect(result.map((r) => r.slug)).toEqual(["ok-sp", "ok2-sp"]);
  });

  it("contagem agregada que falha → adsCount=0, lista ainda retorna", async () => {
    mocks.findCitiesByStateVariants.mockResolvedValue([
      buildCity("ok-sp", "OK"),
    ]);
    mocks.getRegionByBaseSlugDynamic.mockResolvedValueOnce(
      buildRegion("ok-sp", "OK", [])
    );
    mocks.poolQuery.mockRejectedValueOnce(new Error("DB down"));

    const result = await listFeaturedRegionsByUf("SP");
    expect(result).toHaveLength(1);
    expect(result[0].adsCount).toBe(0);
    expect(result[0].featuredCount).toBe(0);
  });
});

describe("controller GET /api/public/states/:uf/regions", () => {
  it("UF válida → 200 com envelope { success, data: { state, regions } }", async () => {
    mocks.findCitiesByStateVariants.mockResolvedValue([
      buildCity("atibaia-sp", "Atibaia"),
    ]);
    mocks.getRegionByBaseSlugDynamic.mockResolvedValueOnce(
      buildRegion("atibaia-sp", "Atibaia", [])
    );

    const req = makeReq({ params: { uf: "sp" } });
    const res = makeRes();
    await getFeaturedRegionsByState(req, res, vi.fn());

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.state).toEqual({ code: "SP", slug: "sp" });
    expect(res.body.data.regions).toHaveLength(1);
    expect(res.body.data.regions[0].href).toBe("/carros-usados/regiao/atibaia-sp");
  });

  it("UF inválida (sem 2 letras) → 400", async () => {
    const req = makeReq({ params: { uf: "X" } });
    const res = makeRes();
    await getFeaturedRegionsByState(req, res, vi.fn());

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("UF com números é sanitizada → trata como UF válida (sp via 's1p')", async () => {
    mocks.findCitiesByStateVariants.mockResolvedValue([]);
    const req = makeReq({ params: { uf: "s1p" } });
    const res = makeRes();
    await getFeaturedRegionsByState(req, res, vi.fn());

    expect(res.statusCode).toBe(200);
    expect(res.body.data.state.code).toBe("SP");
    expect(res.body.data.regions).toEqual([]);
  });

  it("limit=12 respeita hard cap (válido)", async () => {
    mocks.findCitiesByStateVariants.mockResolvedValue([]);
    const req = makeReq({ params: { uf: "SP" }, query: { limit: "12" } });
    const res = makeRes();
    await getFeaturedRegionsByState(req, res, vi.fn());

    expect(res.statusCode).toBe(200);
  });

  it("payload não traz fotos/descrição/dados de admin", async () => {
    mocks.findCitiesByStateVariants.mockResolvedValue([
      buildCity("atibaia-sp", "Atibaia"),
    ]);
    mocks.getRegionByBaseSlugDynamic.mockResolvedValueOnce(
      buildRegion("atibaia-sp", "Atibaia", [{ slug: "itatiba-sp", name: "Itatiba" }])
    );

    const req = makeReq({ params: { uf: "SP" } });
    const res = makeRes();
    await getFeaturedRegionsByState(req, res, vi.fn());

    const region = res.body.data.regions[0];
    const allowedKeys = new Set([
      "slug",
      "name",
      "baseCitySlug",
      "baseCityName",
      "href",
      "cityNames",
      "citySlugs",
      "adsCount",
      "featuredCount",
      "radiusKm",
    ]);
    for (const key of Object.keys(region)) {
      expect(allowedKeys.has(key)).toBe(true);
    }
  });
});
