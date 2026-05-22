// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

// Mock do App Router — jsdom não monta AppRouterContext, então
// `useRouter()` real lança "invariant expected app router to be mounted".
// Capturamos `push` em variável compartilhada para asserts em testes
// que validam a auto-navegação pós-consentimento.
const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  }),
}));

import { LocationRegionalPrompt } from "./LocationRegionalPrompt";

const originalGeolocation = (globalThis as typeof globalThis & { navigator?: Navigator }).navigator
  ?.geolocation;
const originalFetch = global.fetch;

function setupGeolocationSuccess(latitude: number, longitude: number) {
  const geo: Pick<Geolocation, "getCurrentPosition"> = {
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
      } as GeolocationPosition);
    }),
  };
  Object.defineProperty(window.navigator, "geolocation", {
    configurable: true,
    value: geo,
  });
}

function setupGeolocationDenied() {
  const geo: Pick<Geolocation, "getCurrentPosition"> = {
    getCurrentPosition: vi.fn((_success, error) => {
      const err = {
        code: 1,
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
        message: "denied",
      } as unknown as GeolocationPositionError;
      error?.(err);
    }),
  };
  Object.defineProperty(window.navigator, "geolocation", {
    configurable: true,
    value: geo,
  });
}

function removeGeolocation() {
  Object.defineProperty(window.navigator, "geolocation", {
    configurable: true,
    value: undefined,
  });
}

beforeEach(() => {
  document.cookie = "cnc_city=;path=/;max-age=0";
  document.cookie = "cnc_territorial_prefs_v1=;path=/;max-age=0";
  pushMock.mockClear();
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

describe("LocationRegionalPrompt — estado idle (sem auto-prompt)", () => {
  it("NÃO chama navigator.geolocation no mount (consentimento obrigatório)", () => {
    const geoSpy = vi.fn();
    Object.defineProperty(window.navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition: geoSpy },
    });

    render(<LocationRegionalPrompt regionalEnabled stateName="São Paulo" stateCode="SP" />);

    expect(geoSpy).not.toHaveBeenCalled();
    expect(screen.getByTestId("location-prompt-idle")).toBeInTheDocument();
    expect(screen.getByTestId("location-prompt-trigger")).toBeInTheDocument();
  });

  it("microcopy explica uso da localização (LGPD: consentimento informado)", () => {
    render(<LocationRegionalPrompt regionalEnabled stateName="São Paulo" stateCode="SP" />);
    expect(
      screen.getByText(/não salvamos a coordenada nem enviamos para terceiros/i)
    ).toBeInTheDocument();
  });
});

describe("LocationRegionalPrompt — fluxo de sucesso", () => {
  it("clique → chama navigator.geolocation com timeout/enableHighAccuracy=false", async () => {
    setupGeolocationSuccess(-23.117, -46.55);
    global.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            ok: true,
            data: {
              city: { slug: "atibaia-sp", name: "Atibaia", state: "SP" },
              state: { code: "SP", slug: "sp" },
              region: {
                slug: "atibaia-sp",
                name: "Região de Atibaia",
                href: "/carros-usados/regiao/atibaia-sp",
              },
              confidence: "high",
              distanceKm: 3.2,
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
    ) as unknown as typeof fetch;

    render(<LocationRegionalPrompt regionalEnabled stateName="São Paulo" stateCode="SP" />);

    fireEvent.click(screen.getByTestId("location-prompt-trigger"));

    await waitFor(() => {
      expect(screen.getByTestId("location-prompt-resolved")).toBeInTheDocument();
    });

    // Verifica que a chamada usou getCurrentPosition com timeout configurado.
    const geo = window.navigator.geolocation as Geolocation;
    expect(geo.getCurrentPosition).toHaveBeenCalledTimes(1);
    const opts = (geo.getCurrentPosition as unknown as { mock: { calls: unknown[][] } }).mock
      .calls[0][2] as PositionOptions;
    expect(opts.timeout).toBeGreaterThan(0);
    expect(opts.enableHighAccuracy).toBe(false);
  });

  it("após sucesso, mostra CTA regional primário + cidade + estado", async () => {
    setupGeolocationSuccess(-23.117, -46.55);
    global.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            ok: true,
            data: {
              city: { slug: "atibaia-sp", name: "Atibaia", state: "SP" },
              state: { code: "SP", slug: "sp" },
              region: {
                slug: "atibaia-sp",
                name: "Região de Atibaia",
                href: "/carros-usados/regiao/atibaia-sp",
              },
              confidence: "high",
              distanceKm: 3.2,
            },
          }),
          { status: 200 }
        )
    ) as unknown as typeof fetch;

    render(<LocationRegionalPrompt regionalEnabled stateName="São Paulo" stateCode="SP" />);
    fireEvent.click(screen.getByTestId("location-prompt-trigger"));

    await waitFor(() =>
      expect(screen.getByText(/Encontramos sua região: Região de Atibaia/i)).toBeInTheDocument()
    );

    const regionCta = screen.getByTestId("location-prompt-region-cta");
    expect(regionCta.getAttribute("href")).toBe("/carros-usados/regiao/atibaia-sp");

    const cityCta = screen.getByTestId("location-prompt-city-cta");
    expect(cityCta.getAttribute("href")).toBe("/carros-em/atibaia-sp");

    const stateCta = screen.getByTestId("location-prompt-state-cta");
    expect(stateCta.getAttribute("href")).toBe("/comprar/estado/sp");
  });

  it("regionalEnabled=false: CTA regional NÃO aparece, headline fala em cidade", async () => {
    setupGeolocationSuccess(-23.117, -46.55);
    global.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            ok: true,
            data: {
              city: { slug: "atibaia-sp", name: "Atibaia", state: "SP" },
              state: { code: "SP", slug: "sp" },
              region: {
                slug: "atibaia-sp",
                name: "Região de Atibaia",
                href: "/carros-usados/regiao/atibaia-sp",
              },
              confidence: "high",
              distanceKm: 3.2,
            },
          }),
          { status: 200 }
        )
    ) as unknown as typeof fetch;

    render(<LocationRegionalPrompt regionalEnabled={false} stateName="São Paulo" stateCode="SP" />);
    fireEvent.click(screen.getByTestId("location-prompt-trigger"));

    await waitFor(() =>
      expect(screen.getByText(/Encontramos sua cidade: Atibaia/i)).toBeInTheDocument()
    );
    expect(screen.queryByTestId("location-prompt-region-cta")).not.toBeInTheDocument();
  });

  it("clique em 'Ver ofertas da região' salva prefs no cookie territorial", async () => {
    setupGeolocationSuccess(-23.117, -46.55);
    global.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            ok: true,
            data: {
              city: { slug: "atibaia-sp", name: "Atibaia", state: "SP" },
              state: { code: "SP", slug: "sp" },
              region: {
                slug: "atibaia-sp",
                name: "Região de Atibaia",
                href: "/carros-usados/regiao/atibaia-sp",
              },
              confidence: "high",
              distanceKm: 3.2,
            },
          }),
          { status: 200 }
        )
    ) as unknown as typeof fetch;

    render(<LocationRegionalPrompt regionalEnabled stateName="São Paulo" stateCode="SP" />);
    fireEvent.click(screen.getByTestId("location-prompt-trigger"));

    await waitFor(() => screen.getByTestId("location-prompt-region-cta"));

    await act(async () => {
      fireEvent.click(screen.getByTestId("location-prompt-region-cta"));
    });

    expect(document.cookie).toContain("cnc_territorial_prefs_v1=");
    expect(document.cookie).toContain("cnc_city=");
    // Cookie NÃO contém coordenada.
    expect(document.cookie.toLowerCase()).not.toContain("latitude");
    expect(document.cookie.toLowerCase()).not.toContain("longitude");
    expect(document.cookie.toLowerCase()).not.toContain("23.117");
  });
});

describe("LocationRegionalPrompt — permissão negada", () => {
  it("PERMISSION_DENIED → mostra fallback de escolha manual", async () => {
    setupGeolocationDenied();

    render(<LocationRegionalPrompt regionalEnabled stateName="São Paulo" stateCode="SP" />);
    fireEvent.click(screen.getByTestId("location-prompt-trigger"));

    await waitFor(() => {
      expect(screen.getByTestId("location-prompt-fallback")).toBeInTheDocument();
    });
    expect(screen.getByText(/Localização não autorizada/i)).toBeInTheDocument();
  });

  it("onOpenManualPicker é chamado quando o usuário clica em 'Escolher cidade'", async () => {
    setupGeolocationDenied();
    const onOpenManualPicker = vi.fn();

    render(
      <LocationRegionalPrompt
        regionalEnabled
        stateName="São Paulo"
        stateCode="SP"
        onOpenManualPicker={onOpenManualPicker}
      />
    );
    fireEvent.click(screen.getByTestId("location-prompt-trigger"));

    await waitFor(() => screen.getByTestId("location-prompt-manual-cta"));
    fireEvent.click(screen.getByTestId("location-prompt-manual-cta"));

    expect(onOpenManualPicker).toHaveBeenCalledTimes(1);
  });
});

describe("LocationRegionalPrompt — navigator.geolocation ausente", () => {
  it("sem geolocation no navegador → estado 'unavailable' direto sem chamar API", () => {
    removeGeolocation();
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;

    render(<LocationRegionalPrompt regionalEnabled stateName="São Paulo" stateCode="SP" />);
    fireEvent.click(screen.getByTestId("location-prompt-trigger"));

    expect(screen.getByTestId("location-prompt-fallback")).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("LocationRegionalPrompt — fora de cobertura", () => {
  it("backend retorna data:null → estado out_of_coverage com fallback estadual", async () => {
    setupGeolocationSuccess(0, 0); // meio do oceano
    global.fetch = vi.fn(
      async () => new Response(JSON.stringify({ ok: true, data: null }), { status: 200 })
    ) as unknown as typeof fetch;

    render(<LocationRegionalPrompt regionalEnabled stateName="São Paulo" stateCode="SP" />);
    fireEvent.click(screen.getByTestId("location-prompt-trigger"));

    await waitFor(() => screen.getByTestId("location-prompt-fallback"));
    expect(screen.getByText(/Não encontramos uma cidade próxima/i)).toBeInTheDocument();
  });
});

describe("LocationRegionalPrompt — backend offline / 502 (fix 2026-05-21)", () => {
  it("BFF responde 502 → mostra 'tente novamente' (NÃO 'fora de cobertura')", async () => {
    setupGeolocationSuccess(-23.117, -46.55);
    global.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ ok: false, error: "backend_error" }), {
          status: 502,
        })
    ) as unknown as typeof fetch;

    render(<LocationRegionalPrompt regionalEnabled stateName="São Paulo" stateCode="SP" />);
    fireEvent.click(screen.getByTestId("location-prompt-trigger"));

    await waitFor(() => screen.getByTestId("location-prompt-fallback"));
    expect(screen.getByText(/tente de novo/i)).toBeInTheDocument();
    expect(screen.queryByText(/Não encontramos uma cidade próxima/i)).toBeNull();
    expect(screen.getByTestId("location-prompt-retry-cta")).toBeInTheDocument();
  });

  it("clique em 'Tentar novamente' refaz o fluxo de geo", async () => {
    setupGeolocationSuccess(-23.117, -46.55);
    let attempt = 0;
    global.fetch = vi.fn(async () => {
      attempt += 1;
      if (attempt === 1) {
        return new Response(JSON.stringify({ ok: false, error: "backend_error" }), {
          status: 502,
        });
      }
      return new Response(
        JSON.stringify({
          ok: true,
          data: {
            city: { slug: "atibaia-sp", name: "Atibaia", state: "SP" },
            state: { code: "SP", slug: "sp" },
            region: {
              slug: "atibaia-sp",
              name: "Região de Atibaia",
              href: "/carros-usados/regiao/atibaia-sp",
            },
            confidence: "high",
            distanceKm: 3.2,
          },
        }),
        { status: 200 }
      );
    }) as unknown as typeof fetch;

    render(<LocationRegionalPrompt regionalEnabled stateName="São Paulo" stateCode="SP" />);
    fireEvent.click(screen.getByTestId("location-prompt-trigger"));

    await waitFor(() => screen.getByTestId("location-prompt-retry-cta"));
    fireEvent.click(screen.getByTestId("location-prompt-retry-cta"));

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/carros-usados/regiao/atibaia-sp");
    });
  });

  it("BFF responde 200 com data:null → ainda mostra 'fora de cobertura' (mensagem distinta)", async () => {
    setupGeolocationSuccess(0, 0);
    global.fetch = vi.fn(
      async () => new Response(JSON.stringify({ ok: true, data: null }), { status: 200 })
    ) as unknown as typeof fetch;

    render(<LocationRegionalPrompt regionalEnabled stateName="São Paulo" stateCode="SP" />);
    fireEvent.click(screen.getByTestId("location-prompt-trigger"));

    await waitFor(() => screen.getByTestId("location-prompt-fallback"));
    expect(screen.getByText(/Não encontramos uma cidade próxima/i)).toBeInTheDocument();
    expect(screen.queryByText(/tente de novo/i)).toBeNull();
  });
});

describe("LocationRegionalPrompt — auto-navegação pós-consentimento (fix 2026-05-19)", () => {
  function mockResolvedAtibaia() {
    setupGeolocationSuccess(-23.117, -46.55);
    global.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            ok: true,
            data: {
              city: { slug: "atibaia-sp", name: "Atibaia", state: "SP" },
              state: { code: "SP", slug: "sp" },
              region: {
                slug: "atibaia-sp",
                name: "Região de Atibaia",
                href: "/carros-usados/regiao/atibaia-sp",
              },
              confidence: "high",
              distanceKm: 3.2,
            },
          }),
          { status: 200 }
        )
    ) as unknown as typeof fetch;
  }

  it("regionalEnabled=true → navega para /carros-usados/regiao/{slug} automaticamente", async () => {
    mockResolvedAtibaia();

    render(<LocationRegionalPrompt regionalEnabled stateName="São Paulo" stateCode="SP" />);
    fireEvent.click(screen.getByTestId("location-prompt-trigger"));

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/carros-usados/regiao/atibaia-sp");
    });
    expect(pushMock).toHaveBeenCalledTimes(1);
  });

  it("regionalEnabled=true + region=null → constrói /carros-usados/regiao/{citySlug} (fix 2026-05-21)", async () => {
    setupGeolocationSuccess(-23.117, -46.55);
    global.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            ok: true,
            data: {
              city: { slug: "atibaia-sp", name: "Atibaia", state: "SP" },
              state: { code: "SP", slug: "sp" },
              // Backend resolveu a cidade mas não consolidou a região (rollout
              // incompleto). Frontend deve construir a URL regional pelo slug.
              region: null,
              confidence: "medium",
              distanceKm: 3.2,
            },
          }),
          { status: 200 }
        )
    ) as unknown as typeof fetch;

    render(<LocationRegionalPrompt regionalEnabled stateName="São Paulo" stateCode="SP" />);
    fireEvent.click(screen.getByTestId("location-prompt-trigger"));

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/carros-usados/regiao/atibaia-sp");
    });
  });

  it("regionalEnabled=false → navega para /carros-em/{slug} (fallback cidade)", async () => {
    mockResolvedAtibaia();

    render(<LocationRegionalPrompt regionalEnabled={false} stateName="São Paulo" stateCode="SP" />);
    fireEvent.click(screen.getByTestId("location-prompt-trigger"));

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/carros-em/atibaia-sp");
    });
  });

  it("navegação dispara apenas uma vez mesmo em re-render (proteção navigatedRef)", async () => {
    mockResolvedAtibaia();

    const { rerender } = render(
      <LocationRegionalPrompt regionalEnabled stateName="São Paulo" stateCode="SP" />
    );
    fireEvent.click(screen.getByTestId("location-prompt-trigger"));

    await waitFor(() => expect(pushMock).toHaveBeenCalled());

    // Força re-render — não pode disparar push de novo.
    rerender(<LocationRegionalPrompt regionalEnabled stateName="São Paulo" stateCode="SP" />);

    expect(pushMock).toHaveBeenCalledTimes(1);
  });

  it("persiste cidade no cookie antes de navegar (prefs salvas mesmo sem 2º clique)", async () => {
    mockResolvedAtibaia();

    render(<LocationRegionalPrompt regionalEnabled stateName="São Paulo" stateCode="SP" />);
    fireEvent.click(screen.getByTestId("location-prompt-trigger"));

    await waitFor(() => expect(pushMock).toHaveBeenCalled());

    expect(document.cookie).toContain("cnc_city=");
    expect(document.cookie).toContain("cnc_territorial_prefs_v1=");
    // Coordenadas NÃO devem vazar pelo cookie.
    expect(document.cookie.toLowerCase()).not.toContain("23.117");
    expect(document.cookie.toLowerCase()).not.toContain("latitude");
  });
});
