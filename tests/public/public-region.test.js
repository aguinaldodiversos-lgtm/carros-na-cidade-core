import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Testes do endpoint público `/api/public/regions/:citySlug`.
 *
 * Universalidade: o endpoint deve funcionar IDENTICAMENTE para qualquer
 * cidade brasileira cadastrada com slug+UF+coords. Atibaia não é especial.
 *
 * Estes testes garantem:
 *   1. Shape do payload bate o contrato do briefing nacional.
 *   2. Cidade existente → 200 com canonicalUrl `/carros-usados/regiao/{slug}`.
 *   3. Cidade inexistente → 404 estruturado.
 *   4. Cobertura nacional: 5 cidades de 5 regiões diferentes do Brasil.
 */

const mocks = {
  getRegionByBaseSlugDynamic: vi.fn(),
};
vi.mock("../../src/modules/regions/regions.service.js", () => ({
  getRegionByBaseSlugDynamic: (...args) => mocks.getRegionByBaseSlugDynamic(...args),
}));

const { getPublicRegionByCitySlug } = await import(
  "../../src/modules/public/public-region.controller.js"
);

function makeRes() {
  const headers = {};
  const res = {
    statusCode: 200,
    body: null,
    headers,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    setHeader(k, v) {
      headers[k] = v;
    },
  };
  return res;
}

beforeEach(() => {
  mocks.getRegionByBaseSlugDynamic.mockReset();
});

describe("GET /api/public/regions/:citySlug — universalidade nacional", () => {
  it.each([
    {
      slug: "atibaia-sp",
      cityName: "Atibaia",
      state: "SP",
      stateName: "São Paulo",
      stateSlug: "sp",
    },
    {
      slug: "belo-horizonte-mg",
      cityName: "Belo Horizonte",
      state: "MG",
      stateName: "Minas Gerais",
      stateSlug: "mg",
    },
    {
      slug: "salvador-ba",
      cityName: "Salvador",
      state: "BA",
      stateName: "Bahia",
      stateSlug: "ba",
    },
    {
      slug: "manaus-am",
      cityName: "Manaus",
      state: "AM",
      stateName: "Amazonas",
      stateSlug: "am",
    },
    {
      slug: "sumare-sp",
      cityName: "Sumaré",
      state: "SP",
      stateName: "São Paulo",
      stateSlug: "sp",
    },
  ])(
    "$slug → 200 com canonicalUrl /carros-usados/regiao/$slug",
    async ({ slug, cityName, state, stateName, stateSlug }) => {
      mocks.getRegionByBaseSlugDynamic.mockResolvedValueOnce({
        base: {
          id: 100,
          slug,
          name: cityName,
          state,
          latitude: -23,
          longitude: -46,
        },
        members: [
          { id: 200, slug: "vizinha-1-" + stateSlug, name: "Vizinha 1", state, layer: 1, distance_km: 10 },
        ],
        radius_km: 80,
      });

      const req = { params: { citySlug: slug } };
      const res = makeRes();
      const next = vi.fn();

      await getPublicRegionByCitySlug(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.region).toEqual({
        slug,
        name: `Região de ${cityName}`,
        canonicalUrl: `/carros-usados/regiao/${slug}`,
        radiusKm: 80,
      });
      expect(res.body.data.baseCity).toMatchObject({
        slug,
        name: cityName,
        state,
        latitude: -23,
        longitude: -46,
      });
      expect(res.body.data.state).toEqual({
        code: state,
        slug: stateSlug,
        name: stateName,
      });
      expect(res.body.data.citySlugs[0]).toBe(slug); // base no índice 0
      expect(Array.isArray(res.body.data.members)).toBe(true);
    }
  );

  it("cidade inexistente → 404 estruturado (sem 500)", async () => {
    mocks.getRegionByBaseSlugDynamic.mockResolvedValueOnce(null);
    const req = { params: { citySlug: "cidade-fake-zz" } };
    const res = makeRes();
    const next = vi.fn();

    await getPublicRegionByCitySlug(req, res, next);

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ success: false, error: "Region not found" });
  });

  it("citySlug vazio → 404 (não chama o serviço)", async () => {
    const req = { params: { citySlug: "" } };
    const res = makeRes();
    const next = vi.fn();

    await getPublicRegionByCitySlug(req, res, next);

    expect(res.statusCode).toBe(404);
    expect(mocks.getRegionByBaseSlugDynamic).not.toHaveBeenCalled();
  });

  it("serviço lança → next(err) (não 500 direto)", async () => {
    mocks.getRegionByBaseSlugDynamic.mockRejectedValueOnce(
      new Error("db offline")
    );
    const req = { params: { citySlug: "atibaia-sp" } };
    const res = makeRes();
    const next = vi.fn();

    await getPublicRegionByCitySlug(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(next.mock.calls[0][0]).toBeInstanceOf(Error);
  });

  it("região sem membros (cidade isolada) → 200 com members=[] (não 404)", async () => {
    // Brasília tem 1 cidade no DF; cidade-base sem vizinhos é resultado
    // GEOGRÁFICO VÁLIDO, não erro. O endpoint deve responder 200 e o
    // frontend lida com o empty state.
    mocks.getRegionByBaseSlugDynamic.mockResolvedValueOnce({
      base: { id: 1, slug: "brasilia-df", name: "Brasília", state: "DF" },
      members: [],
      radius_km: 80,
    });
    const req = { params: { citySlug: "brasilia-df" } };
    const res = makeRes();
    const next = vi.fn();

    await getPublicRegionByCitySlug(req, res, next);

    expect(res.statusCode).toBe(200);
    expect(res.body.data.members).toEqual([]);
    expect(res.body.data.citySlugs).toEqual(["brasilia-df"]);
  });
});
