// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";

const pushMock = vi.fn();
const replaceMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
    replace: replaceMock,
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  }),
}));

import { useNearbyRegionRedirect } from "./useNearbyRegionRedirect";

const originalFetch = global.fetch;
const originalGeolocation = (globalThis as typeof globalThis & { navigator?: Navigator }).navigator
  ?.geolocation;

function setupGeoSuccess(latitude = -23.117, longitude = -46.55) {
  Object.defineProperty(window.navigator, "geolocation", {
    configurable: true,
    value: {
      getCurrentPosition: vi.fn((success) => {
        success({
          coords: {
            latitude,
            longitude,
            accuracy: 10,
            altitude: null,
            altitudeAccuracy: null,
            heading: null,
            speed: null,
          },
          timestamp: Date.now(),
        });
      }),
    },
  });
}

function setupGeoDenied() {
  Object.defineProperty(window.navigator, "geolocation", {
    configurable: true,
    value: {
      getCurrentPosition: vi.fn((_s, error) => {
        error({
          code: 1,
          PERMISSION_DENIED: 1,
          POSITION_UNAVAILABLE: 2,
          TIMEOUT: 3,
          message: "denied",
        });
      }),
    },
  });
}

function setupGeoUnavailable() {
  Object.defineProperty(window.navigator, "geolocation", {
    configurable: true,
    value: {
      getCurrentPosition: vi.fn((_s, error) => {
        error({
          code: 2,
          PERMISSION_DENIED: 1,
          POSITION_UNAVAILABLE: 2,
          TIMEOUT: 3,
          message: "position unavailable",
        });
      }),
    },
  });
}

function removeGeo() {
  Object.defineProperty(window.navigator, "geolocation", {
    configurable: true,
    value: undefined,
  });
}

function mockOkResponse(payload: object) {
  global.fetch = vi.fn(
    async () =>
      new Response(JSON.stringify({ ok: true, data: payload }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
  ) as unknown as typeof fetch;
}

beforeEach(() => {
  pushMock.mockClear();
  replaceMock.mockClear();
  document.cookie = "cnc_city=;path=/;max-age=0";
  document.cookie = "cnc_territorial_prefs_v1=;path=/;max-age=0";
});

afterEach(() => {
  cleanup();
  if (originalGeolocation) {
    Object.defineProperty(window.navigator, "geolocation", {
      configurable: true,
      value: originalGeolocation,
    });
  }
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("useNearbyRegionRedirect — destino é sempre Regional", () => {
  it("backend devolve region.href → navega para esse href", async () => {
    setupGeoSuccess();
    mockOkResponse({
      city: { slug: "atibaia-sp", name: "Atibaia", state: "SP" },
      state: { code: "SP", slug: "sp" },
      region: {
        slug: "atibaia-sp",
        name: "Região de Atibaia",
        href: "/carros-usados/regiao/atibaia-sp",
      },
      confidence: "high",
      distanceKm: 3.2,
    });

    const { result } = renderHook(() => useNearbyRegionRedirect());
    act(() => result.current.trigger());

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/carros-usados/regiao/atibaia-sp");
    });
    // NUNCA chamou para Cidade ou Estado.
    expect(pushMock).not.toHaveBeenCalledWith(expect.stringMatching(/^\/carros-em\//));
    expect(pushMock).not.toHaveBeenCalledWith(expect.stringMatching(/^\/carros-usados\/[a-z]{2}$/));
  });

  it("backend devolve city mas region=null → constrói /carros-usados/regiao/[citySlug]", async () => {
    setupGeoSuccess();
    mockOkResponse({
      city: { slug: "atibaia-sp", name: "Atibaia", state: "SP" },
      state: { code: "SP", slug: "sp" },
      region: null,
      confidence: "medium",
      distanceKm: 25,
    });

    const { result } = renderHook(() => useNearbyRegionRedirect());
    act(() => result.current.trigger());

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/carros-usados/regiao/atibaia-sp");
    });
  });

  it("regionalEnabled=false: cai para Cidade (única opção sem Regional)", async () => {
    setupGeoSuccess();
    mockOkResponse({
      city: { slug: "atibaia-sp", name: "Atibaia", state: "SP" },
      state: { code: "SP", slug: "sp" },
      region: {
        slug: "atibaia-sp",
        name: "Região de Atibaia",
        href: "/carros-usados/regiao/atibaia-sp",
      },
      confidence: "high",
      distanceKm: 3.2,
    });

    const { result } = renderHook(() => useNearbyRegionRedirect({ regionalEnabled: false }));
    act(() => result.current.trigger());

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/carros-em/atibaia-sp");
    });
  });
});

describe("useNearbyRegionRedirect — estados de erro", () => {
  it("permissão negada → state=denied (sem chamar fetch nem navegar)", async () => {
    setupGeoDenied();
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;

    const { result } = renderHook(() => useNearbyRegionRedirect());
    act(() => result.current.trigger());

    await waitFor(() => {
      expect(result.current.state.kind).toBe("denied");
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("POSITION_UNAVAILABLE → state=unavailable", async () => {
    setupGeoUnavailable();
    const { result } = renderHook(() => useNearbyRegionRedirect());
    act(() => result.current.trigger());

    await waitFor(() => {
      expect(result.current.state.kind).toBe("unavailable");
    });
  });

  it("navegador sem navigator.geolocation → state=unavailable (sem chamar fetch)", async () => {
    removeGeo();
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;

    const { result } = renderHook(() => useNearbyRegionRedirect());
    act(() => result.current.trigger());

    await waitFor(() => {
      expect(result.current.state.kind).toBe("unavailable");
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("BFF responde 502 → state=backend_error (NÃO out_of_coverage)", async () => {
    setupGeoSuccess();
    global.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ ok: false, error: "backend_error" }), {
          status: 502,
        })
    ) as unknown as typeof fetch;

    const { result } = renderHook(() => useNearbyRegionRedirect());
    act(() => result.current.trigger());

    await waitFor(() => {
      expect(result.current.state.kind).toBe("backend_error");
    });
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("BFF responde 200 + data:null → state=out_of_coverage", async () => {
    setupGeoSuccess(0, 0);
    global.fetch = vi.fn(
      async () => new Response(JSON.stringify({ ok: true, data: null }), { status: 200 })
    ) as unknown as typeof fetch;

    const { result } = renderHook(() => useNearbyRegionRedirect());
    act(() => result.current.trigger());

    await waitFor(() => {
      expect(result.current.state.kind).toBe("out_of_coverage");
    });
    expect(pushMock).not.toHaveBeenCalled();
  });
});

describe("useNearbyRegionRedirect — privacidade e idempotência", () => {
  it("não salva coordenadas em localStorage (só nome/slug)", async () => {
    setupGeoSuccess(-23.123, -46.789);
    mockOkResponse({
      city: { slug: "atibaia-sp", name: "Atibaia", state: "SP" },
      state: { code: "SP", slug: "sp" },
      region: {
        slug: "atibaia-sp",
        name: "Região de Atibaia",
        href: "/carros-usados/regiao/atibaia-sp",
      },
      confidence: "high",
      distanceKm: 3.2,
    });

    const { result } = renderHook(() => useNearbyRegionRedirect());
    act(() => result.current.trigger());

    await waitFor(() => expect(pushMock).toHaveBeenCalled());

    // Storage não pode conter coordenadas em nenhuma forma.
    const storageDump = JSON.stringify({
      cookie: document.cookie,
      localStorage:
        typeof localStorage !== "undefined"
          ? Object.entries(localStorage).reduce(
              (acc, [k, v]) => ({ ...acc, [k]: v }),
              {} as Record<string, string>
            )
          : {},
    });
    expect(storageDump.toLowerCase()).not.toContain("latitude");
    expect(storageDump.toLowerCase()).not.toContain("longitude");
    expect(storageDump).not.toContain("-23.123");
    expect(storageDump).not.toContain("-46.789");
  });

  it("trigger duplo não dispara duas navegações", async () => {
    setupGeoSuccess();
    mockOkResponse({
      city: { slug: "atibaia-sp", name: "Atibaia", state: "SP" },
      state: { code: "SP", slug: "sp" },
      region: {
        slug: "atibaia-sp",
        name: "Região de Atibaia",
        href: "/carros-usados/regiao/atibaia-sp",
      },
      confidence: "high",
      distanceKm: 3.2,
    });

    const { result } = renderHook(() => useNearbyRegionRedirect());
    act(() => {
      result.current.trigger();
      result.current.trigger();
    });

    await waitFor(() => expect(pushMock).toHaveBeenCalled());
    expect(pushMock).toHaveBeenCalledTimes(1);
  });

  it("reset volta para idle e permite novo trigger", async () => {
    setupGeoDenied();
    const { result } = renderHook(() => useNearbyRegionRedirect());

    act(() => result.current.trigger());
    await waitFor(() => expect(result.current.state.kind).toBe("denied"));

    act(() => result.current.reset());
    expect(result.current.state.kind).toBe("idle");
  });
});
