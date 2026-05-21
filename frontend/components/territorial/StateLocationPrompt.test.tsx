// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { StateLocationPrompt } from "./StateLocationPrompt";
import { CITY_STORAGE_KEY } from "@/lib/city/city-constants";

const memoryStore: Record<string, string> = {};
const memoryStorage: Storage = {
  get length() {
    return Object.keys(memoryStore).length;
  },
  clear: () => {
    for (const k of Object.keys(memoryStore)) delete memoryStore[k];
  },
  getItem: (k: string) => (k in memoryStore ? memoryStore[k] : null),
  key: (i: number) => Object.keys(memoryStore)[i] ?? null,
  removeItem: (k: string) => {
    delete memoryStore[k];
  },
  setItem: (k: string, v: string) => {
    memoryStore[k] = String(v);
  },
};

// jsdom em alguns setups não popula `window.localStorage` (depende da
// versão / opts da config). Stub mínimo in-memory garante que os
// testes rodem isolados e que `localStorage.clear()` exista.
beforeEach(() => {
  Object.defineProperty(window, "localStorage", {
    value: memoryStorage,
    configurable: true,
    writable: true,
  });
  memoryStorage.clear();
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
  memoryStorage.clear();
});

function renderPrompt(uf = "SP") {
  return render(<StateLocationPrompt stateUf={uf} />);
}

describe("StateLocationPrompt — sem cidade conhecida", () => {
  it("renderiza CTA primário 'Ver ofertas perto de mim'", () => {
    renderPrompt();
    const cta = screen.getByTestId("state-location-geo-cta");
    expect(cta.textContent).toMatch(/Ver ofertas perto de mim/i);
  });

  it("renderiza CTA secundário com texto Regional-first", () => {
    renderPrompt();
    const cta = screen.getByTestId("state-location-manual-cta");
    expect(cta.textContent).toMatch(/Escolher cidade para ver ofertas na região/i);
  });
});

describe("StateLocationPrompt — cidade conhecida (mesma UF)", () => {
  it("atalho Regional direto quando localStorage já tem cidade do mesmo estado", () => {
    memoryStorage.setItem(
      CITY_STORAGE_KEY,
      JSON.stringify({ slug: "atibaia-sp", name: "Atibaia", state: "SP" })
    );

    renderPrompt("SP");
    const cta = screen.getByTestId("state-location-known-city-cta");
    expect(cta).toBeTruthy();
    expect(cta.getAttribute("href")).toBe("/carros-usados/regiao/atibaia-sp");
    expect(cta.textContent).toMatch(/Ver ofertas na região de Atibaia/);

    // Quando há atalho Regional direto, os CTAs de geo NÃO devem aparecer.
    expect(screen.queryByTestId("state-location-geo-cta")).toBeNull();
    expect(screen.queryByTestId("state-location-manual-cta")).toBeNull();
  });

  it("cidade de OUTRA UF não dispara o atalho — segue fluxo geo padrão", () => {
    memoryStorage.setItem(
      CITY_STORAGE_KEY,
      JSON.stringify({ slug: "belo-horizonte-mg", name: "Belo Horizonte", state: "MG" })
    );

    renderPrompt("SP");
    expect(screen.queryByTestId("state-location-known-city-cta")).toBeNull();
    expect(screen.getByTestId("state-location-geo-cta")).toBeTruthy();
  });
});

describe("StateLocationPrompt — flow de geolocalização", () => {
  it("clique em 'Ver ofertas perto de mim' chama navigator.geolocation", () => {
    const geoMock = vi.fn();
    Object.defineProperty(global.navigator, "geolocation", {
      value: { getCurrentPosition: geoMock },
      configurable: true,
    });

    renderPrompt();
    fireEvent.click(screen.getByTestId("state-location-geo-cta"));
    expect(geoMock).toHaveBeenCalledTimes(1);
  });

  it("após permitir, troca mensagem mencionando região", () => {
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

    renderPrompt();
    fireEvent.click(screen.getByTestId("state-location-geo-cta"));
    expect(screen.getByRole("status").textContent).toMatch(/Localização detectada/i);
    expect(screen.getByRole("status").textContent).toMatch(/região/i);
  });

  it("após negar, troca mensagem orientando escolher cidade na região", () => {
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

    renderPrompt();
    fireEvent.click(screen.getByTestId("state-location-geo-cta"));
    expect(screen.getByRole("status").textContent).toMatch(/Escolha uma cidade/i);
    expect(screen.getByRole("status").textContent).toMatch(/região/i);
  });

  it("'Escolher cidade…' não chama geolocation — apenas troca a mensagem", () => {
    const geoMock = vi.fn();
    Object.defineProperty(global.navigator, "geolocation", {
      value: { getCurrentPosition: geoMock },
      configurable: true,
    });

    renderPrompt();
    fireEvent.click(screen.getByTestId("state-location-manual-cta"));
    expect(geoMock).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toMatch(/Escolha uma cidade/i);
  });
});

describe("StateLocationPrompt — fallback sem suporte a geolocalização", () => {
  it("browser sem navigator.geolocation cai no fallback Regional-first", () => {
    Object.defineProperty(global.navigator, "geolocation", {
      value: undefined,
      configurable: true,
    });

    renderPrompt();
    fireEvent.click(screen.getByTestId("state-location-geo-cta"));
    expect(screen.getByRole("status").textContent).toMatch(/Escolha uma cidade/i);
  });
});
