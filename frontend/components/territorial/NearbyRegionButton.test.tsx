// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

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

import { NearbyRegionButton } from "./NearbyRegionButton";

const originalFetch = global.fetch;

function geoSuccess() {
  Object.defineProperty(window.navigator, "geolocation", {
    configurable: true,
    value: {
      getCurrentPosition: vi.fn((success) =>
        success({
          coords: {
            latitude: -23.117,
            longitude: -46.55,
            accuracy: 10,
            altitude: null,
            altitudeAccuracy: null,
            heading: null,
            speed: null,
          },
          timestamp: Date.now(),
        })
      ),
    },
  });
}

function geoDenied() {
  Object.defineProperty(window.navigator, "geolocation", {
    configurable: true,
    value: {
      getCurrentPosition: vi.fn((_s, error) =>
        error({
          code: 1,
          PERMISSION_DENIED: 1,
          POSITION_UNAVAILABLE: 2,
          TIMEOUT: 3,
          message: "denied",
        })
      ),
    },
  });
}

beforeEach(() => {
  pushMock.mockClear();
});

afterEach(() => {
  cleanup();
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("NearbyRegionButton — UI por contexto", () => {
  it("context='estadual' mostra copy 'Quer ver ofertas perto de você?'", () => {
    render(<NearbyRegionButton regionalEnabled context="estadual" stateUf="SP" />);
    expect(screen.getByText(/Quer ver ofertas perto de você/i)).toBeTruthy();
  });

  it("context='regional' mostra copy 'Está em outra região?'", () => {
    render(<NearbyRegionButton regionalEnabled context="regional" stateUf="SP" />);
    expect(screen.getByText(/Está em outra região/i)).toBeTruthy();
  });

  it("context='cidade' mostra copy 'Quer ver veículos próximos de você?'", () => {
    render(<NearbyRegionButton regionalEnabled context="cidade" stateUf="SP" />);
    expect(screen.getByText(/veículos próximos de você/i)).toBeTruthy();
  });

  it("context='catalogo' mostra copy genérico", () => {
    render(<NearbyRegionButton regionalEnabled context="catalogo" stateUf="SP" />);
    expect(screen.getByText(/Quer ver carros perto de você/i)).toBeTruthy();
  });

  it("variant='compact' não mostra subtítulo (one-liner)", () => {
    render(
      <NearbyRegionButton
        regionalEnabled
        context="regional"
        variant="compact"
        stateUf="SP"
      />
    );
    const container = screen.getByTestId("nearby-region-button");
    expect(container.getAttribute("data-variant")).toBe("compact");
    expect(screen.queryByText(/Use sua localização/i)).toBeNull();
  });

  it("variant='default' mostra título + subtítulo + botão", () => {
    render(
      <NearbyRegionButton
        regionalEnabled
        context="estadual"
        variant="default"
        stateUf="SP"
      />
    );
    const container = screen.getByTestId("nearby-region-button");
    expect(container.getAttribute("data-variant")).toBe("default");
    expect(screen.getByText(/Use sua localização/i)).toBeTruthy();
  });
});

describe("NearbyRegionButton — comportamento de geo", () => {
  it("sucesso → navega para Regional (briefing: nunca para Cidade ou Estado)", async () => {
    geoSuccess();
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

    render(<NearbyRegionButton regionalEnabled context="cidade" stateUf="SP" />);
    fireEvent.click(screen.getByTestId("nearby-region-trigger"));

    await waitFor(() =>
      expect(pushMock).toHaveBeenCalledWith("/carros-usados/regiao/atibaia-sp")
    );
    expect(pushMock).not.toHaveBeenCalledWith(
      expect.stringMatching(/^\/carros-em\//)
    );
    expect(pushMock).not.toHaveBeenCalledWith(
      expect.stringMatching(/^\/carros-usados\/[a-z]{2}$/)
    );
  });

  it("permissão negada → fallback com mensagem manual", async () => {
    geoDenied();
    render(<NearbyRegionButton regionalEnabled context="cidade" stateUf="SP" />);
    fireEvent.click(screen.getByTestId("nearby-region-trigger"));

    await waitFor(() => screen.getByTestId("nearby-region-fallback"));
    expect(
      screen.getByText(/Não foi possível acessar sua localização/i)
    ).toBeTruthy();
    expect(screen.queryByTestId("nearby-region-retry")).toBeNull();
    expect(screen.getByTestId("nearby-region-manual")).toBeTruthy();
  });

  it("backend 502 → fallback com botão 'Tentar novamente'", async () => {
    geoSuccess();
    global.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ ok: false, error: "backend_error" }), {
          status: 502,
        })
    ) as unknown as typeof fetch;

    render(<NearbyRegionButton regionalEnabled context="cidade" stateUf="SP" />);
    fireEvent.click(screen.getByTestId("nearby-region-trigger"));

    await waitFor(() => screen.getByTestId("nearby-region-fallback"));
    expect(
      screen.getByText(/Não conseguimos encontrar sua região automaticamente/i)
    ).toBeTruthy();
    expect(screen.getByTestId("nearby-region-retry")).toBeTruthy();
  });

  it("fallback manual aponta para a Estadual do stateUf passado", async () => {
    geoDenied();
    render(<NearbyRegionButton regionalEnabled context="cidade" stateUf="SP" />);
    fireEvent.click(screen.getByTestId("nearby-region-trigger"));

    await waitFor(() => screen.getByTestId("nearby-region-manual"));
    const manual = screen.getByTestId("nearby-region-manual");
    expect(manual.getAttribute("href")).toBe("/carros-usados/sp");
  });
});
