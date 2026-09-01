import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `primaryCity` — a cidade padrão do portal, e a independência de ordem de
 * deploy (SEO Fase 4.1A, achado P1-2).
 *
 * A regra é a MESMA do backend (`pickPrimaryPublicCity`): maior estoque ativo,
 * empate por slug ASC. O frontend prefere o campo do backend e, quando ele não
 * vem — backend em versão anterior —, deriva do próprio mapa `cities` em vez de
 * ficar sem cidade até o outro serviço subir.
 */

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

vi.mock("@/lib/env/backend-api", () => ({
  resolveInternalBackendApiUrl: (p: string) => `https://backend.test${p}`,
}));
vi.mock("@/lib/http/internal-backend-headers", () => ({
  buildInternalBackendHeaders: () => ({}),
}));

const { fetchPublicCitySet } = await import("@/lib/city/public-city-set");

function respond(data: unknown) {
  fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ data }) } as Response);
}

beforeEach(() => {
  fetchMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("primaryCity", () => {
  it("usa o campo do backend quando ele vem e é coerente com `cities`", async () => {
    respond({
      cities: { "atibaia-sp": 27, "campinas-sp": 10 },
      primaryCity: { slug: "atibaia-sp", uf: "SP", activeAds: 27 },
    });

    const set = await fetchPublicCitySet();
    expect(set?.primaryCity).toEqual({ slug: "atibaia-sp", uf: "SP", activeAds: 27 });
  });

  it("backend SEM o campo (versão anterior) → deriva do mapa, mesma regra", async () => {
    respond({ cities: { "atibaia-sp": 27, "campinas-sp": 10 } });

    const set = await fetchPublicCitySet();
    expect(set?.primaryCity).toEqual({ slug: "atibaia-sp", uf: "SP", activeAds: 27 });
  });

  it("maior estoque vence, independente da ordem das chaves", async () => {
    respond({ cities: { "aaa-sp": 1, "zzz-rj": 99 } });

    const set = await fetchPublicCitySet();
    expect(set?.primaryCity?.slug).toBe("zzz-rj");
    expect(set?.primaryCity?.uf).toBe("RJ");
  });

  it("empate resolve por slug ASC — determinístico", async () => {
    respond({ cities: { "zzz-sp": 5, "aaa-sp": 5, "mmm-sp": 5 } });
    const a = await fetchPublicCitySet();

    respond({ cities: { "mmm-sp": 5, "zzz-sp": 5, "aaa-sp": 5 } });
    const b = await fetchPublicCitySet();

    expect(a?.primaryCity?.slug).toBe("aaa-sp");
    expect(b?.primaryCity?.slug).toBe("aaa-sp");
  });

  it("conjunto vazio → null, sem inventar cidade", async () => {
    respond({ cities: {} });

    const set = await fetchPublicCitySet();
    expect(set?.primaryCity).toBeNull();
  });

  it("campo do backend com slug FORA do mapa é recusado — cai na derivação", async () => {
    respond({
      cities: { "atibaia-sp": 27 },
      // Cidade que não está no conjunto: o campo não pode ser segunda fonte de
      // verdade sobre quais cidades existem.
      primaryCity: { slug: "sao-paulo-sp", uf: "SP", activeAds: 999 },
    });

    const set = await fetchPublicCitySet();
    expect(set?.primaryCity?.slug).toBe("atibaia-sp");
  });

  it("cidade com contagem zero nunca é primária", async () => {
    respond({ cities: { "vazia-sp": 0, "atibaia-sp": 3 } });

    const set = await fetchPublicCitySet();
    expect(set?.primaryCity?.slug).toBe("atibaia-sp");
  });

  it("backend fora devolve null (e não conjunto vazio)", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false } as Response);
    expect(await fetchPublicCitySet()).toBeNull();
  });
});
