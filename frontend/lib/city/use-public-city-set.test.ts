// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { usePublicCitySet, __resetPublicCitySetCache } from "./use-public-city-set";

/**
 * O ponto central: falha de rede NÃO pode virar "conjunto vazio".
 *
 * Se virasse, o cliente concluiria que nenhuma cidade existe e descartaria a
 * cidade guardada de todo visitante, esvaziando o cabeçalho. É a versão
 * cliente da lição "payload malformado ≠ conjunto vazio" do gate no servidor.
 */

type FetchArgs = [input: RequestInfo | URL, init?: RequestInit];

function mockFetch(impl: () => unknown) {
  const fn = vi.fn(async (..._args: FetchArgs) => impl() as Response);
  vi.stubGlobal("fetch", fn);
  return fn;
}

beforeEach(() => {
  __resetPublicCitySetCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("conjunto carregado", () => {
  beforeEach(() => {
    mockFetch(() => ({
      ok: true,
      json: async () => ({ ok: true, slugs: ["atibaia-sp", "braganca-paulista-sp"] }),
    }));
  });

  it("responde true para cidade no conjunto e false para fora", async () => {
    const { result } = renderHook(() => usePublicCitySet());
    await waitFor(() => expect(result.current.status).toBe("ready"));

    expect(result.current.isPublicCity("atibaia-sp")).toBe(true);
    expect(result.current.isPublicCity("altaneira-ce")).toBe(false);
  });

  it("normaliza caixa e espaços", async () => {
    const { result } = renderHook(() => usePublicCitySet());
    await waitFor(() => expect(result.current.status).toBe("ready"));

    expect(result.current.isPublicCity("  ATIBAIA-SP ")).toBe(true);
  });

  it("slug vazio é undefined, não false", async () => {
    const { result } = renderHook(() => usePublicCitySet());
    await waitFor(() => expect(result.current.status).toBe("ready"));

    expect(result.current.isPublicCity("")).toBeUndefined();
    expect(result.current.isPublicCity(null)).toBeUndefined();
  });
});

describe("indisponível NUNCA vira conjunto vazio", () => {
  const falhas: Array<[string, () => unknown]> = [
    ["HTTP 503", () => ({ ok: false, json: async () => ({}) })],
    ["ok:false no corpo", () => ({ ok: true, json: async () => ({ ok: false, slugs: null }) })],
    ["slugs não é array", () => ({ ok: true, json: async () => ({ ok: true, slugs: {} }) })],
    ["corpo sem slugs", () => ({ ok: true, json: async () => ({ ok: true }) })],
    [
      "erro de rede",
      () => {
        throw new Error("network");
      },
    ],
    [
      "JSON inválido",
      () => ({
        ok: true,
        json: async () => {
          throw new Error("bad json");
        },
      }),
    ],
  ];

  for (const [nome, impl] of falhas) {
    it(`${nome} → status "unavailable" e isPublicCity undefined`, async () => {
      __resetPublicCitySetCache();
      mockFetch(impl);

      const { result } = renderHook(() => usePublicCitySet());
      await waitFor(() => expect(result.current.status).toBe("unavailable"));

      // O ponto: NÃO é `false`. `false` autorizaria descartar a cidade.
      expect(result.current.isPublicCity("altaneira-ce")).toBeUndefined();
      expect(result.current.isPublicCity("atibaia-sp")).toBeUndefined();
    });
  }

  it("conjunto legitimamente vazio é diferente de falha", async () => {
    // Site sem nenhum anúncio: `ok:true` com lista vazia. Aí sim é seguro
    // afirmar que a cidade não existe.
    mockFetch(() => ({ ok: true, json: async () => ({ ok: true, slugs: [] }) }));

    const { result } = renderHook(() => usePublicCitySet());
    await waitFor(() => expect(result.current.status).toBe("ready"));

    expect(result.current.isPublicCity("atibaia-sp")).toBe(false);
  });
});

describe("enquanto carrega", () => {
  it("isPublicCity é undefined antes de resolver", () => {
    mockFetch(() => new Promise(() => {}) as never);

    const { result } = renderHook(() => usePublicCitySet());

    expect(result.current.status).toBe("loading");
    expect(result.current.isPublicCity("altaneira-ce")).toBeUndefined();
  });
});

describe("uma requisição por página, não por componente", () => {
  it("dois consumidores compartilham a mesma chamada", async () => {
    const fetchMock = mockFetch(() => ({
      ok: true,
      json: async () => ({ ok: true, slugs: ["atibaia-sp"] }),
    }));

    const a = renderHook(() => usePublicCitySet());
    const b = renderHook(() => usePublicCitySet());

    await waitFor(() => expect(a.result.current.status).toBe("ready"));
    await waitFor(() => expect(b.result.current.status).toBe("ready"));

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
