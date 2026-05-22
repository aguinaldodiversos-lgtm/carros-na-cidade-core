// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

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
});

afterEach(() => {
  cleanup();
  memoryStorage.clear();
});

function renderPrompt(uf = "SP") {
  return render(<StateLocationPrompt stateUf={uf} />);
}

describe("StateLocationPrompt — sem cidade conhecida", () => {
  it("retorna null (catálogo já mostra o NearbyRegionButton acima do grid)", () => {
    const { container } = renderPrompt("SP");
    expect(container.innerHTML).toBe("");
    expect(screen.queryByTestId("state-location-prompt")).toBeNull();
  });

  it("cidade de OUTRA UF no localStorage também retorna null", () => {
    memoryStorage.setItem(
      CITY_STORAGE_KEY,
      JSON.stringify({ slug: "belo-horizonte-mg", name: "Belo Horizonte", state: "MG" })
    );
    const { container } = renderPrompt("SP");
    expect(container.innerHTML).toBe("");
  });
});

describe("StateLocationPrompt — cidade conhecida (mesma UF)", () => {
  it("atalho Regional direto quando localStorage tem cidade do mesmo estado", () => {
    memoryStorage.setItem(
      CITY_STORAGE_KEY,
      JSON.stringify({ slug: "atibaia-sp", name: "Atibaia", state: "SP" })
    );

    renderPrompt("SP");
    const cta = screen.getByTestId("state-location-known-city-cta");
    expect(cta.getAttribute("href")).toBe("/carros-usados/regiao/atibaia-sp");
    expect(cta.textContent).toMatch(/Ver ofertas na região de Atibaia/);
  });

  it("microcopy menciona que a região está pronta", () => {
    memoryStorage.setItem(
      CITY_STORAGE_KEY,
      JSON.stringify({ slug: "atibaia-sp", name: "Atibaia", state: "SP" })
    );
    renderPrompt("SP");
    expect(screen.getByText(/Sua região está pronta/i)).toBeTruthy();
  });
});
