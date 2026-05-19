import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `server-only` é um pacote do Next que joga se importado em client. No vitest
// em ambiente node, stubamos como módulo vazio para o import nao quebrar.
vi.mock("server-only", () => ({}));

vi.mock("@/lib/regions/fetch-region", () => ({
  fetchRegionByCitySlug: vi.fn(),
}));

vi.mock("@/lib/city/fetch-city-meta-server", () => ({
  fetchCityMetaBySlug: vi.fn(),
}));

import { fetchCityMetaBySlug } from "@/lib/city/fetch-city-meta-server";
import { fetchRegionByCitySlug } from "@/lib/regions/fetch-region";

import { resolveTerritory } from "./territory-resolver";

const mockedRegion = vi.mocked(fetchRegionByCitySlug);
const mockedCity = vi.mocked(fetchCityMetaBySlug);

beforeEach(() => {
  mockedRegion.mockReset();
  mockedCity.mockReset();
});

afterEach(() => {
  vi.resetModules();
});

describe("resolveTerritory — fallbacks de estado (sem cookie nem query)", () => {
  it("devolve nível 'state' com SP por padrão", async () => {
    const ctx = await resolveTerritory({});
    expect(ctx.level).toBe("state");
    expect(ctx.state.code).toBe("SP");
    expect(ctx.state.slug).toBe("sp");
    expect(ctx.state.name).toBe("São Paulo");
    expect(ctx.canonicalUrl).toBe("/comprar/estado/sp");
    expect(ctx.region).toBeUndefined();
    expect(ctx.city).toBeUndefined();
  });

  it("breadcrumbs do estado começam em Início e terminam no nome do estado", async () => {
    const ctx = await resolveTerritory({});
    expect(ctx.breadcrumbs).toHaveLength(2);
    expect(ctx.breadcrumbs[0]).toEqual({ label: "Início", href: "/" });
    expect(ctx.breadcrumbs[1]).toEqual({ label: "São Paulo", href: "/comprar/estado/sp" });
  });

  it("title e description usam o estado em vez de 'Brasil'", async () => {
    const ctx = await resolveTerritory({});
    expect(ctx.title).toBe("Carros usados em São Paulo");
    expect(ctx.description).toMatch(/estado de São Paulo/);
    expect(ctx.title.toLowerCase()).not.toContain("brasil");
    expect(ctx.description.toLowerCase()).not.toContain("brasil");
  });
});

describe("resolveTerritory — inferência de estado a partir do cookie", () => {
  it("usa o state do cookie quando presente", async () => {
    const ctx = await resolveTerritory({
      cookie: { slug: "belo-horizonte-mg", state: "MG", name: "Belo Horizonte" },
    });
    expect(ctx.state.code).toBe("MG");
    expect(ctx.state.slug).toBe("mg");
  });

  it("infere UF pelo sufixo do slug quando cookie não tem state", async () => {
    const ctx = await resolveTerritory({
      cookie: { slug: "curitiba-pr", name: "Curitiba" },
    });
    expect(ctx.state.code).toBe("PR");
  });

  it("cai no estado padrão (SP) se cookie tem slug malformado", async () => {
    const ctx = await resolveTerritory({
      cookie: { slug: "slug-invalido-sem-uf-valida-zz", name: "Foo" },
    });
    // ZZ não é UF brasileira válida → fallback SP.
    expect(ctx.state.code).toBe("SP");
  });

  it("cookie da cidade NÃO promove o nível para 'city' (Home permanece estadual)", async () => {
    const ctx = await resolveTerritory({
      cookie: { slug: "atibaia-sp", state: "SP", name: "Atibaia" },
    });
    expect(ctx.level).toBe("state");
    expect(ctx.city).toBeUndefined();
  });
});

describe("resolveTerritory — input explícito de cidade", () => {
  it("query.city_slug válido promove para nível 'city'", async () => {
    mockedCity.mockResolvedValue({ name: "Atibaia", state: "SP" });
    const ctx = await resolveTerritory({
      query: { city_slug: "atibaia-sp" },
    });
    expect(ctx.level).toBe("city");
    expect(ctx.city).toEqual({ slug: "atibaia-sp", name: "Atibaia", state: "SP" });
    expect(ctx.state.code).toBe("SP");
    expect(ctx.canonicalUrl).toBe("/comprar/cidade/atibaia-sp");
  });

  it("breadcrumbs da cidade incluem o estado intermediário", async () => {
    mockedCity.mockResolvedValue({ name: "Atibaia", state: "SP" });
    const ctx = await resolveTerritory({ citySlug: "atibaia-sp" });
    expect(ctx.breadcrumbs.map((b) => b.label)).toEqual(["Início", "São Paulo", "Atibaia"]);
  });

  it("usa nome derivado do slug quando o meta SSR falha", async () => {
    mockedCity.mockResolvedValue(null);
    const ctx = await resolveTerritory({ citySlug: "ribeirao-preto-sp" });
    expect(ctx.level).toBe("city");
    expect(ctx.city?.name).toBe("Ribeirao Preto");
    expect(ctx.state.code).toBe("SP");
  });
});

describe("resolveTerritory — input explícito de região", () => {
  it("regionSlug fetcha a região e devolve nível 'region'", async () => {
    mockedRegion.mockResolvedValue({
      base: { id: 1, slug: "atibaia-sp", name: "Atibaia", state: "SP" },
      members: [
        { city_id: 2, slug: "braganca-paulista-sp", name: "Bragança Paulista", state: "SP", layer: 1, distance_km: 25 },
        { city_id: 3, slug: "itatiba-sp", name: "Itatiba", state: "SP", layer: 1, distance_km: 28 },
      ],
      radius_km: 80,
    });

    const ctx = await resolveTerritory({ regionSlug: "atibaia-sp" });

    expect(ctx.level).toBe("region");
    expect(ctx.region?.baseCitySlug).toBe("atibaia-sp");
    // Contrato: cidade-base na posição [0] (alinhado com boost +60 no backend).
    expect(ctx.region?.citySlugs[0]).toBe("atibaia-sp");
    expect(ctx.region?.citySlugs).toContain("braganca-paulista-sp");
    expect(ctx.region?.citySlugs).toContain("itatiba-sp");
    expect(ctx.region?.radiusKm).toBe(80);
    expect(ctx.canonicalUrl).toBe("/carros-usados/regiao/atibaia-sp");
    expect(ctx.title).toBe("Carros usados na Região de Atibaia");
  });

  it("região não encontrada cai para resolução de cidade do mesmo slug", async () => {
    mockedRegion.mockResolvedValue(null);
    mockedCity.mockResolvedValue({ name: "Atibaia", state: "SP" });

    const ctx = await resolveTerritory({ regionSlug: "atibaia-sp" });

    expect(ctx.level).toBe("city");
    expect(ctx.city?.slug).toBe("atibaia-sp");
  });
});

describe("resolveTerritory — level hint força o nível", () => {
  it("level='state' ignora citySlug explícito (Home estadual mesmo com cookie city)", async () => {
    const ctx = await resolveTerritory({
      level: "state",
      citySlug: "atibaia-sp",
      cookie: { slug: "atibaia-sp", state: "SP", name: "Atibaia" },
    });
    expect(ctx.level).toBe("state");
    expect(ctx.city).toBeUndefined();
    expect(ctx.state.code).toBe("SP");
    // Nem chamou o fetcher de cidade — economia de RTT.
    expect(mockedCity).not.toHaveBeenCalled();
  });

  it("level='state' usa UF do cookie mesmo sem city_slug explícito", async () => {
    const ctx = await resolveTerritory({
      level: "state",
      cookie: { slug: "belo-horizonte-mg", state: "MG", name: "Belo Horizonte" },
    });
    expect(ctx.state.code).toBe("MG");
  });
});

describe("resolveTerritory — proteções territoriais", () => {
  it("não mistura estados: região traz só state da cidade-base", async () => {
    mockedRegion.mockResolvedValue({
      base: { id: 1, slug: "atibaia-sp", name: "Atibaia", state: "SP" },
      members: [
        // Cidade hipotética de MG num cenário de fronteira — confiamos no
        // backend para já não devolver isso, mas o estado da região
        // continua sendo o da cidade-base.
        { city_id: 2, slug: "extrema-mg", name: "Extrema", state: "MG", layer: 2, distance_km: 55 },
      ],
    });

    const ctx = await resolveTerritory({ regionSlug: "atibaia-sp" });

    expect(ctx.state.code).toBe("SP");
  });
});
