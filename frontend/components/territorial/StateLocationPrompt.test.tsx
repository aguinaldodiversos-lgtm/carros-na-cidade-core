// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { StateLocationPrompt } from "./StateLocationPrompt";

beforeEach(() => {
  // Stub navigator.geolocation com sucesso por default — testes específicos
  // sobrescrevem para denial/erro.
  Object.defineProperty(global.navigator, "geolocation", {
    value: {
      getCurrentPosition: vi.fn((success) => {
        success({ coords: { latitude: -23.0, longitude: -46.0 } });
      }),
    },
    configurable: true,
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("StateLocationPrompt — CTAs visíveis", () => {
  it("renderiza CTA primário 'Ver ofertas perto de mim'", () => {
    render(<StateLocationPrompt />);
    const cta = screen.getByTestId("state-location-geo-cta");
    expect(cta).toBeTruthy();
    expect(cta.textContent).toMatch(/Ver ofertas perto de mim/i);
  });

  it("renderiza CTA secundário 'Escolher cidade ou região'", () => {
    render(<StateLocationPrompt />);
    const cta = screen.getByTestId("state-location-manual-cta");
    expect(cta).toBeTruthy();
    expect(cta.textContent).toMatch(/Escolher cidade ou região/i);
  });
});

describe("StateLocationPrompt — flow de geolocalização", () => {
  it("clique em 'Ver ofertas perto de mim' chama navigator.geolocation", () => {
    const geoMock = vi.fn();
    Object.defineProperty(global.navigator, "geolocation", {
      value: { getCurrentPosition: geoMock },
      configurable: true,
    });

    render(<StateLocationPrompt />);
    fireEvent.click(screen.getByTestId("state-location-geo-cta"));
    expect(geoMock).toHaveBeenCalledTimes(1);
  });

  it("após permitir, troca mensagem para 'Localização detectada'", () => {
    Object.defineProperty(global.navigator, "geolocation", {
      value: {
        getCurrentPosition: (success: (p: GeolocationPosition) => void) => {
          success({
            coords: {
              latitude: -23,
              longitude: -46,
              accuracy: 0,
              altitude: null,
              altitudeAccuracy: null,
              heading: null,
              speed: null,
              toJSON: () => ({}),
            } as GeolocationCoordinates,
            timestamp: Date.now(),
            toJSON: () => ({}),
          } as GeolocationPosition);
        },
      },
      configurable: true,
    });

    render(<StateLocationPrompt />);
    fireEvent.click(screen.getByTestId("state-location-geo-cta"));
    expect(screen.getByRole("status").textContent).toMatch(
      /Localização detectada/i
    );
  });

  it("após negar, troca mensagem para 'Escolha sua cidade ou região'", () => {
    Object.defineProperty(global.navigator, "geolocation", {
      value: {
        getCurrentPosition: (
          _success: (p: GeolocationPosition) => void,
          error: (e: GeolocationPositionError) => void
        ) => {
          error({
            code: 1,
            message: "denied",
            PERMISSION_DENIED: 1,
            POSITION_UNAVAILABLE: 2,
            TIMEOUT: 3,
          });
        },
      },
      configurable: true,
    });

    render(<StateLocationPrompt />);
    fireEvent.click(screen.getByTestId("state-location-geo-cta"));
    expect(screen.getByRole("status").textContent).toMatch(
      /Escolha sua cidade/i
    );
  });

  it("'Escolher cidade ou região' não chama geolocation — apenas troca a mensagem", () => {
    const geoMock = vi.fn();
    Object.defineProperty(global.navigator, "geolocation", {
      value: { getCurrentPosition: geoMock },
      configurable: true,
    });

    render(<StateLocationPrompt />);
    fireEvent.click(screen.getByTestId("state-location-manual-cta"));
    expect(geoMock).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toMatch(
      /Escolha sua cidade/i
    );
  });
});

describe("StateLocationPrompt — fallback sem suporte a geolocalização", () => {
  it("browser sem navigator.geolocation cai no fallback 'Escolha sua cidade'", () => {
    Object.defineProperty(global.navigator, "geolocation", {
      value: undefined,
      configurable: true,
    });

    render(<StateLocationPrompt />);
    fireEvent.click(screen.getByTestId("state-location-geo-cta"));
    expect(screen.getByRole("status").textContent).toMatch(
      /Escolha sua cidade/i
    );
  });
});
