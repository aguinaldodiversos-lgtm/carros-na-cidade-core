// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

// AppRouter mock — a variante "sem cidade conhecida" delega para
// NearbyRegionButton que usa useRouter via hook.
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

beforeEach(() => {
  Object.defineProperty(window, "localStorage", {
    value: memoryStorage,
    configurable: true,
    writable: true,
  });
  memoryStorage.clear();
  pushMock.mockClear();
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

describe("StateLocationPrompt — sem cidade conhecida (delega ao NearbyRegionButton)", () => {
  it("renderiza CTA 'Ver carros perto de mim' (do NearbyRegionButton)", () => {
    renderPrompt();
    const cta = screen.getByTestId("nearby-region-trigger");
    expect(cta.textContent).toMatch(/Ver carros perto de mim/i);
  });

  it("usa context='estadual' (copy específico)", () => {
    renderPrompt();
    expect(screen.getByText(/Quer ver ofertas perto de você/i)).toBeTruthy();
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

    // Atalho Regional substitui o CTA de geo — NearbyRegionButton não aparece.
    expect(screen.queryByTestId("nearby-region-trigger")).toBeNull();
  });

  it("cidade de OUTRA UF não dispara o atalho — segue fluxo geo padrão", () => {
    memoryStorage.setItem(
      CITY_STORAGE_KEY,
      JSON.stringify({ slug: "belo-horizonte-mg", name: "Belo Horizonte", state: "MG" })
    );

    renderPrompt("SP");
    expect(screen.queryByTestId("state-location-known-city-cta")).toBeNull();
    expect(screen.getByTestId("nearby-region-trigger")).toBeTruthy();
  });
});

describe("StateLocationPrompt — geo via NearbyRegionButton", () => {
  it("clique no CTA do NearbyRegionButton chama navigator.geolocation", () => {
    const geoMock = vi.fn();
    Object.defineProperty(global.navigator, "geolocation", {
      value: { getCurrentPosition: geoMock },
      configurable: true,
    });

    renderPrompt();
    fireEvent.click(screen.getByTestId("nearby-region-trigger"));
    expect(geoMock).toHaveBeenCalledTimes(1);
  });

  it("permissão negada vira fallback com mensagem 'manualmente'", async () => {
    Object.defineProperty(global.navigator, "geolocation", {
      value: {
        getCurrentPosition: (_s: unknown, error: (e: GeolocationPositionError) => void) => {
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
    fireEvent.click(screen.getByTestId("nearby-region-trigger"));
    expect(screen.getByTestId("nearby-region-fallback")).toBeTruthy();
    expect(screen.getByText(/escolha sua cidade ou região manualmente/i)).toBeTruthy();
  });

  it("browser sem geolocation cai no fallback 'navegador não permite'", () => {
    Object.defineProperty(global.navigator, "geolocation", {
      value: undefined,
      configurable: true,
    });

    renderPrompt();
    fireEvent.click(screen.getByTestId("nearby-region-trigger"));
    expect(screen.getByText(/seu navegador não permite localização/i)).toBeTruthy();
  });
});
