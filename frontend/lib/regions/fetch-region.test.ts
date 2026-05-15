import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `server-only` é um pacote do Next que joga se importado em client. No vitest
// em ambiente node, stubamos como módulo vazio para o import nao quebrar.
vi.mock("server-only", () => ({}));

vi.mock("@/lib/env/backend-api", () => ({
  getBackendApiBaseUrl: vi.fn(),
  resolveInternalBackendApiUrl: vi.fn(),
}));

vi.mock("@/lib/net/ssr-resilient-fetch", () => ({
  ssrResilientFetch: vi.fn(),
}));

import {
  getBackendApiBaseUrl,
  resolveInternalBackendApiUrl,
} from "@/lib/env/backend-api";
import { ssrResilientFetch } from "@/lib/net/ssr-resilient-fetch";
import {
  fetchRegionByCitySlug,
  regionToAdsSearchFilters,
  type RegionPayload,
} from "./fetch-region";

const mockedBackendBase = vi.mocked(getBackendApiBaseUrl);
const mockedResolveUrl = vi.mocked(resolveInternalBackendApiUrl);
const mockedFetch = vi.mocked(ssrResilientFetch);

const ORIGINAL_TOKEN = process.env.INTERNAL_API_TOKEN;
const VALID_TOKEN = "test-token-32-chars-aaaaaaaaaaaaaaa";

function buildResponse(status: number, body: unknown): Response {
  return new Response(body == null ? "" : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function buildHappyPayload() {
  return {
    ok: true,
    data: {
      base: { id: 1, slug: "atibaia-sp", name: "Atibaia", state: "SP" },
      members: [
        {
          city_id: 2,
          slug: "bom-jesus-dos-perdoes-sp",
          name: "Bom Jesus dos Perdões",
          state: "SP",
          layer: 1,
          distance_km: 12.4,
        },
        {
          city_id: 3,
          slug: "campinas-sp",
          name: "Campinas",
          state: "SP",
          layer: 2,
          distance_km: 55.2,
        },
      ],
    },
  };
}

beforeEach(() => {
  process.env.INTERNAL_API_TOKEN = VALID_TOKEN;
  mockedBackendBase.mockReturnValue("https://backend.example.com");
  mockedResolveUrl.mockImplementation(
    (path: string) => `https://backend.example.com${path}`
  );
  mockedFetch.mockReset();
});

afterEach(() => {
  if (ORIGINAL_TOKEN === undefined) delete process.env.INTERNAL_API_TOKEN;
  else process.env.INTERNAL_API_TOKEN = ORIGINAL_TOKEN;
  vi.restoreAllMocks();
});

describe("fetchRegionByCitySlug — gates antes do fetch", () => {
  it("slug vazio → retorna null sem chamadas externas", async () => {
    const result = await fetchRegionByCitySlug("");
    expect(result).toBeNull();
    expect(mockedFetch).not.toHaveBeenCalled();
  });

  it("slug com whitespace puro → retorna null sem chamadas", async () => {
    const result = await fetchRegionByCitySlug("   ");
    expect(result).toBeNull();
    expect(mockedFetch).not.toHaveBeenCalled();
  });

  it("INTERNAL_API_TOKEN ausente → null + console.warn (sem fetch)", async () => {
    delete process.env.INTERNAL_API_TOKEN;
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await fetchRegionByCitySlug("atibaia-sp");

    expect(result).toBeNull();
    expect(mockedFetch).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0]?.[0])).toMatch(/INTERNAL_API_TOKEN/i);
  });

  it("INTERNAL_API_TOKEN string vazia (espaços) → null + console.warn", async () => {
    process.env.INTERNAL_API_TOKEN = "   ";
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await fetchRegionByCitySlug("atibaia-sp");

    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("backend base URL ausente → null silencioso (sem warn ruidoso)", async () => {
    mockedBackendBase.mockReturnValue("");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await fetchRegionByCitySlug("atibaia-sp");

    expect(result).toBeNull();
    expect(mockedFetch).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });
});

describe("fetchRegionByCitySlug — propagação de cache + headers", () => {
  it("envia X-Internal-Token e propaga next: { revalidate: 300, tags } no fetch", async () => {
    mockedFetch.mockResolvedValueOnce(buildResponse(200, buildHappyPayload()));

    await fetchRegionByCitySlug("atibaia-sp");

    expect(mockedFetch).toHaveBeenCalledTimes(1);
    const [calledUrl, calledOpts] = mockedFetch.mock.calls[0];

    expect(calledUrl).toBe("https://backend.example.com/api/internal/regions/atibaia-sp");
    expect(calledOpts?.method).toBe("GET");

    const headers = calledOpts?.headers as Record<string, string> | undefined;
    expect(headers?.["X-Internal-Token"]).toBe(VALID_TOKEN);
    expect(headers?.Accept).toBe("application/json");

    expect(calledOpts?.next).toEqual({
      revalidate: 300,
      tags: ["internal:regions", "internal:regions:atibaia-sp"],
    });

    expect(calledOpts?.logTag).toBe("regions:bff");
  });

  it("encoda slug com caracteres especiais na URL", async () => {
    mockedFetch.mockResolvedValueOnce(buildResponse(200, buildHappyPayload()));

    await fetchRegionByCitySlug("são-paulo-sp");

    const [calledUrl] = mockedFetch.mock.calls[0];
    // resolveBackendApiUrl recebe path com slug encoded; mock simplesmente
    // concatena com a base, então o slug encoded chega encoded na URL final.
    expect(String(calledUrl)).toContain(encodeURIComponent("são-paulo-sp"));
  });
});

describe("fetchRegionByCitySlug — happy path 200", () => {
  it("body válido → retorna { base, members[] } parsed", async () => {
    mockedFetch.mockResolvedValueOnce(buildResponse(200, buildHappyPayload()));

    const result = await fetchRegionByCitySlug("atibaia-sp");

    expect(result).not.toBeNull();
    expect(result?.base).toEqual({
      id: 1,
      slug: "atibaia-sp",
      name: "Atibaia",
      state: "SP",
    });
    expect(result?.members).toHaveLength(2);
    expect(result?.members[0]).toEqual({
      city_id: 2,
      slug: "bom-jesus-dos-perdoes-sp",
      name: "Bom Jesus dos Perdões",
      state: "SP",
      layer: 1,
      distance_km: 12.4,
    });
  });

  it("body com members:[] → retorna { base, members: [] } (cidade sem vizinhos)", async () => {
    mockedFetch.mockResolvedValueOnce(
      buildResponse(200, {
        ok: true,
        data: {
          base: { id: 99, slug: "isolada-tt", name: "Isolada", state: "TT" },
          members: [],
        },
      })
    );

    const result = await fetchRegionByCitySlug("isolada-tt");

    expect(result).not.toBeNull();
    expect(result?.members).toEqual([]);
  });

  it("body com members null → trata como [] (defensivo)", async () => {
    mockedFetch.mockResolvedValueOnce(
      buildResponse(200, {
        ok: true,
        data: {
          base: { id: 99, slug: "x-tt", name: "X", state: "TT" },
          members: null,
        },
      })
    );

    const result = await fetchRegionByCitySlug("x-tt");
    expect(result?.members).toEqual([]);
  });

  it("filtra members com shape inválido (parcial), preserva os válidos", async () => {
    mockedFetch.mockResolvedValueOnce(
      buildResponse(200, {
        ok: true,
        data: {
          base: { id: 1, slug: "atibaia-sp", name: "Atibaia", state: "SP" },
          members: [
            { city_id: 2, slug: "valida-sp", name: "Valida", state: "SP", layer: 1, distance_km: 5 },
            { slug: "sem-id-sp", name: "Sem ID", state: "SP", layer: 1, distance_km: 10 }, // inválido
            null,
            { city_id: 3, slug: "outra-sp", name: "Outra", state: "SP", layer: 2, distance_km: 40 },
          ],
        },
      })
    );

    const result = await fetchRegionByCitySlug("atibaia-sp");
    expect(result?.members).toHaveLength(2);
    expect(result?.members.map((m) => m.slug)).toEqual(["valida-sp", "outra-sp"]);
  });

  it("distance_km null no backend → distance_km null no payload", async () => {
    mockedFetch.mockResolvedValueOnce(
      buildResponse(200, {
        ok: true,
        data: {
          base: { id: 1, slug: "x-tt", name: "X", state: "TT" },
          members: [
            { city_id: 2, slug: "y-tt", name: "Y", state: "TT", layer: 1, distance_km: null },
          ],
        },
      })
    );

    const result = await fetchRegionByCitySlug("x-tt");
    expect(result?.members[0].distance_km).toBeNull();
  });
});

describe("fetchRegionByCitySlug — degrade gracioso em erros", () => {
  it("404 do backend → retorna null silencioso (slug desconhecido OU token errado)", async () => {
    mockedFetch.mockResolvedValueOnce(buildResponse(404, { ok: false, error: "Not Found" }));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await fetchRegionByCitySlug("desconhecida-tt");

    expect(result).toBeNull();
    // 404 é esperado, não loga error.
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("500 do backend → null + console.error com status no contexto", async () => {
    mockedFetch.mockResolvedValueOnce(buildResponse(500, { ok: false }));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await fetchRegionByCitySlug("atibaia-sp");

    expect(result).toBeNull();
    expect(errorSpy).toHaveBeenCalled();
    const callArgs = errorSpy.mock.calls[0];
    expect(String(callArgs[0])).toMatch(/status.*nao-OK|status não-OK/i);
    expect(callArgs[1]).toMatchObject({ slug: "atibaia-sp", status: 500 });
  });

  it("ssrResilientFetch joga (timeout/rede) → null + console.error", async () => {
    mockedFetch.mockRejectedValueOnce(new Error("ECONNRESET socket hang up"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await fetchRegionByCitySlug("atibaia-sp");

    expect(result).toBeNull();
    expect(errorSpy).toHaveBeenCalled();
    expect(String(errorSpy.mock.calls[0][0])).toMatch(/falha de rede/i);
  });

  it("body não é JSON parseável → null + console.error", async () => {
    // Response com body que vai falhar ao parsear como JSON.
    const broken = new Response("<<not json>>", {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
    mockedFetch.mockResolvedValueOnce(broken);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await fetchRegionByCitySlug("atibaia-sp");

    expect(result).toBeNull();
    expect(errorSpy).toHaveBeenCalled();
    expect(String(errorSpy.mock.calls[0][0])).toMatch(/não é JSON|nao e JSON|parseável|parseavel/i);
  });

  it("envelope com ok:false → null + console.error", async () => {
    mockedFetch.mockResolvedValueOnce(
      buildResponse(200, { ok: false, error: "ops" })
    );
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await fetchRegionByCitySlug("atibaia-sp");

    expect(result).toBeNull();
    expect(errorSpy).toHaveBeenCalled();
  });

  it("base com shape inválido → null + console.error (não vaza payload corrompido)", async () => {
    mockedFetch.mockResolvedValueOnce(
      buildResponse(200, {
        ok: true,
        data: {
          base: { id: "string-em-vez-de-number", slug: "x", name: "X", state: "TT" },
          members: [],
        },
      })
    );
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await fetchRegionByCitySlug("x-tt");

    expect(result).toBeNull();
    expect(errorSpy).toHaveBeenCalled();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// regionToAdsSearchFilters — helper puro (sem rede, sem env)
// ───────────────────────────────────────────────────────────────────────────

function buildRegion(overrides: Partial<RegionPayload> = {}): RegionPayload {
  return {
    base: { id: 1, slug: "atibaia-sp", name: "Atibaia", state: "SP" },
    members: [
      {
        city_id: 2,
        slug: "bom-jesus-dos-perdoes-sp",
        name: "Bom Jesus dos Perdões",
        state: "SP",
        layer: 1,
        distance_km: 12.4,
      },
      {
        city_id: 3,
        slug: "campinas-sp",
        name: "Campinas",
        state: "SP",
        layer: 2,
        distance_km: 55.2,
      },
    ],
    ...overrides,
  };
}

describe("regionToAdsSearchFilters — city_slugs e ordem", () => {
  it("city_slugs[0] é a cidade-base (preferência no ranking)", () => {
    const result = regionToAdsSearchFilters(buildRegion());
    expect(result.city_slugs?.[0]).toBe("atibaia-sp");
  });

  it("preserva a ordem dos members após a base", () => {
    const result = regionToAdsSearchFilters(buildRegion());
    expect(result.city_slugs).toEqual([
      "atibaia-sp",
      "bom-jesus-dos-perdoes-sp",
      "campinas-sp",
    ]);
  });

  it("remove duplicado quando member tem o mesmo slug da base", () => {
    const region = buildRegion({
      members: [
        {
          city_id: 1,
          slug: "atibaia-sp",
          name: "Atibaia",
          state: "SP",
          layer: 1,
          distance_km: 0,
        },
        {
          city_id: 3,
          slug: "campinas-sp",
          name: "Campinas",
          state: "SP",
          layer: 2,
          distance_km: 50,
        },
      ],
    });
    const result = regionToAdsSearchFilters(region);
    expect(result.city_slugs).toEqual(["atibaia-sp", "campinas-sp"]);
  });

  it("remove slugs vazios dos members (defesa)", () => {
    const region = buildRegion({
      members: [
        {
          city_id: 99,
          slug: "",
          name: "Sem slug",
          state: "SP",
          layer: 1,
          distance_km: 0,
        },
        {
          city_id: 3,
          slug: "campinas-sp",
          name: "Campinas",
          state: "SP",
          layer: 2,
          distance_km: 55,
        },
      ],
    });
    const result = regionToAdsSearchFilters(region);
    expect(result.city_slugs).toEqual(["atibaia-sp", "campinas-sp"]);
  });

  it("respeita o cap de 30 slugs (1 base + 29 members)", () => {
    const members = Array.from({ length: 50 }, (_, i) => ({
      city_id: i + 100,
      slug: `cidade-${String(i + 100).padStart(3, "0")}-sp`,
      name: `Cidade ${i + 100}`,
      state: "SP",
      layer: 2,
      distance_km: 30,
    }));
    const region = buildRegion({ members });
    const result = regionToAdsSearchFilters(region);
    expect(result.city_slugs).toHaveLength(30);
    expect(result.city_slugs?.[0]).toBe("atibaia-sp");
    expect(result.city_slugs?.[1]).toBe("cidade-100-sp");
    expect(result.city_slugs?.[29]).toBe("cidade-128-sp");
  });
});

describe("regionToAdsSearchFilters — overrides", () => {
  it("aceita brand, page e price_min via overrides (com mapeamento price_min → min_price)", () => {
    const result = regionToAdsSearchFilters(buildRegion(), {
      brand: "honda",
      page: 2,
      price_min: 30000,
    });
    expect(result.brand).toBe("honda");
    expect(result.page).toBe(2);
    expect(result.min_price).toBe(30000);
  });

  it("overrides NÃO sobrescreve city_slugs (vem sempre do RegionPayload)", () => {
    const result = regionToAdsSearchFilters(
      buildRegion(),
      // city_slugs não consta no tipo de overrides — força via cast para
      // verificar a defesa em runtime.
      { city_slugs: ["hackerville-tt"] } as unknown as Parameters<
        typeof regionToAdsSearchFilters
      >[1]
    );
    expect(result.city_slugs).toEqual([
      "atibaia-sp",
      "bom-jesus-dos-perdoes-sp",
      "campinas-sp",
    ]);
  });
});

describe("regionToAdsSearchFilters — includeState", () => {
  it("includeState ausente → não adiciona state", () => {
    const result = regionToAdsSearchFilters(buildRegion());
    expect(result.state).toBeUndefined();
  });

  it("includeState=false → não adiciona state", () => {
    const result = regionToAdsSearchFilters(buildRegion(), { includeState: false });
    expect(result.state).toBeUndefined();
  });

  it("includeState=true → adiciona state da base", () => {
    const result = regionToAdsSearchFilters(buildRegion(), { includeState: true });
    expect(result.state).toBe("SP");
  });

  it("includeState=true: overrides não sobrescreve state", () => {
    const result = regionToAdsSearchFilters(
      buildRegion(),
      // state não consta no tipo de overrides — força via cast para
      // verificar que region.base.state prevalece.
      { includeState: true, state: "RJ" } as unknown as Parameters<
        typeof regionToAdsSearchFilters
      >[1]
    );
    expect(result.state).toBe("SP");
  });
});

describe("regionToAdsSearchFilters — null safety", () => {
  it("region null → lança erro claro (sem retornar {} silencioso)", () => {
    expect(() =>
      regionToAdsSearchFilters(null as unknown as RegionPayload)
    ).toThrow(/region/i);
  });

  it("region undefined → lança erro claro", () => {
    expect(() =>
      regionToAdsSearchFilters(undefined as unknown as RegionPayload)
    ).toThrow(/region/i);
  });
});
