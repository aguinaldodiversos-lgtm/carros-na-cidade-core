import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Smoke test do pipeline regional server-side:
 *
 *   fetchRegionByCitySlug()  →  regionToAdsSearchFilters()  →  buildAdsSearchParams()
 *
 * Por que um smoke test separado dos unitários?
 * - Os testes unitários em fetch-region.test.ts já validam cada função em
 *   isolamento. Este arquivo valida o ENCADEAMENTO — garante que o contrato
 *   de city_slugs[0] = cidade-base sobrevive intacto da resposta do backend
 *   regional até a query string final que vai pra /api/ads/search.
 * - Importa SOMENTE módulos de `lib/` (helpers puros + BFF). Nenhuma página
 *   pública (`app/`), componente (`components/`) ou estilo (`styles/`) é
 *   tocado — a Página Regional ainda não existe; este teste apenas prova
 *   que o pipeline está pronto para ela.
 *
 * Mock surface mínima: só `ssrResilientFetch`. Tudo o mais (BFF, helper,
 * builder) roda como em produção.
 */

vi.mock("server-only", () => ({}));

vi.mock("@/lib/env/backend-api", () => ({
  getBackendApiBaseUrl: vi.fn(() => "https://backend.example.com"),
  resolveBackendApiUrl: vi.fn(
    (path: string) => `https://backend.example.com${path}`
  ),
}));

vi.mock("@/lib/net/ssr-resilient-fetch", () => ({
  ssrResilientFetch: vi.fn(),
}));

import { ssrResilientFetch } from "@/lib/net/ssr-resilient-fetch";
import {
  fetchRegionByCitySlug,
  regionToAdsSearchFilters,
  type RegionPayload,
} from "@/lib/regions/fetch-region";
import { buildAdsSearchParams } from "@/lib/search/ads-search";

const mockedFetch = vi.mocked(ssrResilientFetch);

const ORIGINAL_TOKEN = process.env.INTERNAL_API_TOKEN;
const VALID_TOKEN = "smoke-token-32-chars-aaaaaaaaaaaaa";

function buildResponse(status: number, body: unknown): Response {
  return new Response(body == null ? "" : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Payload regional do exemplo do spec:
 *   base   = atibaia-sp
 *   layer1 = bragança-paulista, piracaia, nazaré-paulista
 */
function buildAtibaiaPayload() {
  return {
    ok: true,
    data: {
      base: { id: 100, slug: "atibaia-sp", name: "Atibaia", state: "SP" },
      members: [
        {
          city_id: 200,
          slug: "braganca-paulista-sp",
          name: "Bragança Paulista",
          state: "SP",
          layer: 1,
          distance_km: 22.1,
        },
        {
          city_id: 300,
          slug: "piracaia-sp",
          name: "Piracaia",
          state: "SP",
          layer: 1,
          distance_km: 18.3,
        },
        {
          city_id: 400,
          slug: "nazare-paulista-sp",
          name: "Nazaré Paulista",
          state: "SP",
          layer: 1,
          distance_km: 28.7,
        },
      ],
    },
  };
}

beforeEach(() => {
  process.env.INTERNAL_API_TOKEN = VALID_TOKEN;
  mockedFetch.mockReset();
});

afterEach(() => {
  if (ORIGINAL_TOKEN === undefined) delete process.env.INTERNAL_API_TOKEN;
  else process.env.INTERNAL_API_TOKEN = ORIGINAL_TOKEN;
  vi.restoreAllMocks();
});

describe("smoke: pipeline regional ponta-a-ponta", () => {
  it("região válida → CSV city_slugs com cidade-base no índice 0", async () => {
    mockedFetch.mockResolvedValueOnce(buildResponse(200, buildAtibaiaPayload()));

    const region = await fetchRegionByCitySlug("atibaia-sp");
    expect(region).not.toBeNull();

    const filters = regionToAdsSearchFilters(region as RegionPayload);
    expect(filters.city_slugs?.[0]).toBe("atibaia-sp");
    expect(filters.city_slugs).toEqual([
      "atibaia-sp",
      "braganca-paulista-sp",
      "piracaia-sp",
      "nazare-paulista-sp",
    ]);

    const params = buildAdsSearchParams(filters);

    // O contrato com o backend é CSV; checamos pelo valor lógico (sem
    // depender da forma como URLSearchParams.toString() encoda vírgula).
    expect(params.get("city_slugs")).toBe(
      "atibaia-sp,braganca-paulista-sp,piracaia-sp,nazare-paulista-sp"
    );

    // Defesa adicional: a query string final preserva a ordem mesmo
    // após decode (toString pode ou não escapar vírgulas dependendo do
    // runtime; decodeURIComponent normaliza para a comparação humana).
    const decoded = decodeURIComponent(params.toString());
    expect(decoded).toContain(
      "city_slugs=atibaia-sp,braganca-paulista-sp,piracaia-sp,nazare-paulista-sp"
    );
  });

  it("filtros complementares (brand/model/page/price_min) chegam ao params junto do CSV", async () => {
    mockedFetch.mockResolvedValueOnce(buildResponse(200, buildAtibaiaPayload()));

    const region = await fetchRegionByCitySlug("atibaia-sp");
    const filters = regionToAdsSearchFilters(region as RegionPayload, {
      brand: "honda",
      model: "civic",
      page: 2,
      // O helper aceita `price_min` no override e mapeia para `min_price`
      // (nome que AdsSearchFilters / backend usam no contrato público).
      price_min: 30000,
    });

    const params = buildAdsSearchParams(filters);

    expect(params.get("brand")).toBe("honda");
    expect(params.get("model")).toBe("civic");
    expect(params.get("page")).toBe("2");
    expect(params.get("min_price")).toBe("30000");
    expect(params.get("city_slugs")).toBe(
      "atibaia-sp,braganca-paulista-sp,piracaia-sp,nazare-paulista-sp"
    );
  });

  it("includeState=true → params inclui state da cidade-base", async () => {
    mockedFetch.mockResolvedValueOnce(buildResponse(200, buildAtibaiaPayload()));

    const region = await fetchRegionByCitySlug("atibaia-sp");
    const filters = regionToAdsSearchFilters(region as RegionPayload, {
      includeState: true,
    });

    const params = buildAdsSearchParams(filters);

    // canonicalTerritoryForApi(): sem city_slug/city_id/city, cai em state.
    expect(params.get("state")).toBe("SP");
    // city_slugs continua presente em paralelo a state (multi-cidade).
    expect(params.get("city_slugs")).toBe(
      "atibaia-sp,braganca-paulista-sp,piracaia-sp,nazare-paulista-sp"
    );
  });

  it("sem includeState → params NÃO inclui state automaticamente", async () => {
    mockedFetch.mockResolvedValueOnce(buildResponse(200, buildAtibaiaPayload()));

    const region = await fetchRegionByCitySlug("atibaia-sp");
    const filters = regionToAdsSearchFilters(region as RegionPayload);

    const params = buildAdsSearchParams(filters);

    expect(params.get("state")).toBeNull();
    expect(params.get("city_slugs")).toBe(
      "atibaia-sp,braganca-paulista-sp,piracaia-sp,nazare-paulista-sp"
    );
  });
});

describe("smoke: null safety — region indisponível NUNCA vira busca ampla", () => {
  it("backend retorna 404 → fetchRegionByCitySlug=null; chamar regionToAdsSearchFilters(null) lança erro claro", async () => {
    mockedFetch.mockResolvedValueOnce(buildResponse(404, { ok: false }));

    const region = await fetchRegionByCitySlug("regiao-inexistente-tt");
    expect(region).toBeNull();

    // Demonstra a contenção: o caller tem que tratar `null` antes de chamar
    // o helper. Se o tratamento for esquecido, o helper grita em vez de
    // retornar `{}` silenciosamente — `{}` viraria uma busca nacional sem
    // território, que em prod seria uma página regional listando o Brasil
    // inteiro (regressão de SEO + bug visível).
    expect(() =>
      regionToAdsSearchFilters(region as unknown as RegionPayload)
    ).toThrow(/region/i);
  });

  it("padrão idiomático: caller checa null e simplesmente não chama o pipeline", async () => {
    mockedFetch.mockResolvedValueOnce(buildResponse(500, { ok: false }));

    const region = await fetchRegionByCitySlug("atibaia-sp");
    expect(region).toBeNull();

    // O comportamento esperado em produção: se region é null, o caller
    // (Página Regional, quando existir) renderiza fallback / 404 SEO e
    // NÃO monta filtros sem território. Aqui simulamos esse contrato.
    let params: URLSearchParams | null = null;
    if (region) {
      const filters = regionToAdsSearchFilters(region);
      params = buildAdsSearchParams(filters);
    }

    expect(params).toBeNull();
  });
});
