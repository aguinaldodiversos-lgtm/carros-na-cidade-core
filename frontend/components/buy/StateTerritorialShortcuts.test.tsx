// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

import { StateTerritorialShortcuts } from "./StateTerritorialShortcuts";

afterEach(() => cleanup());

describe("StateTerritorialShortcuts — Estado → Regional (briefing 2026-05-21)", () => {
  it("CTA primário de cada card aponta para a Página Regional", () => {
    render(<StateTerritorialShortcuts uf="sp" />);

    const regionLink = screen.getByTestId("state-shortcut-region-atibaia-sp");
    expect(regionLink.getAttribute("href")).toBe("/carros-usados/regiao/atibaia-sp");
    expect(regionLink.textContent).toMatch(/Ver ofertas na região de Atibaia/i);
  });

  it("link secundário discreto aponta para a Página Cidade", () => {
    render(<StateTerritorialShortcuts uf="sp" />);

    const cityLink = screen.getByTestId("state-shortcut-city-atibaia-sp");
    expect(cityLink.getAttribute("href")).toBe("/carros-em/atibaia-sp");
    expect(cityLink.textContent).toMatch(/Carros em Atibaia/i);
  });

  it("nenhum card primário vai direto para /carros-em/[slug]", () => {
    const { container } = render(<StateTerritorialShortcuts uf="sp" />);
    const primaryLinks = container.querySelectorAll(
      '[data-testid^="state-shortcut-region-"]'
    );
    expect(primaryLinks.length).toBeGreaterThan(0);
    for (const link of primaryLinks) {
      expect(link.getAttribute("href")).toMatch(/^\/carros-usados\/regiao\//);
    }
  });
});

describe("StateTerritorialShortcuts — sub-bloco contextual (briefing item 12)", () => {
  it("sem nearbyCities renderiza só 'Principais cidades em [estado]'", () => {
    render(<StateTerritorialShortcuts uf="sp" />);

    expect(screen.queryByTestId("state-shortcuts-nearby")).toBeNull();
    const fallback = screen.getByTestId("state-shortcuts-fallback");
    expect(within(fallback).getByText(/Principais cidades em/i)).toBeTruthy();
  });

  it("com nearbyCities renderiza primeiro 'Cidades próximas de [cidade]'", () => {
    render(
      <StateTerritorialShortcuts
        uf="sp"
        activeCityName="Atibaia"
        nearbyCities={[
          { slug: "atibaia-sp", name: "Atibaia" },
          { slug: "braganca-paulista-sp", name: "Bragança Paulista" },
          { slug: "jarinu-sp", name: "Jarinu" },
        ]}
      />
    );

    const nearby = screen.getByTestId("state-shortcuts-nearby");
    expect(within(nearby).getByText(/Cidades próximas de/i)).toBeTruthy();
    expect(within(nearby).getByTestId("state-shortcut-region-atibaia-sp")).toBeTruthy();
    expect(within(nearby).getByTestId("state-shortcut-region-braganca-paulista-sp")).toBeTruthy();
    expect(within(nearby).getByTestId("state-shortcut-region-jarinu-sp")).toBeTruthy();
  });

  it("com contexto, fallback vira 'Outras cidades em [estado]' e remove duplicatas", () => {
    render(
      <StateTerritorialShortcuts
        uf="sp"
        activeCityName="Atibaia"
        nearbyCities={[
          { slug: "atibaia-sp", name: "Atibaia" },
          { slug: "campinas-sp", name: "Campinas" },
        ]}
      />
    );

    const fallback = screen.getByTestId("state-shortcuts-fallback");
    expect(within(fallback).getByText(/Outras cidades em/i)).toBeTruthy();
    // Atibaia e Campinas estão no nearby → não devem reaparecer no fallback
    expect(within(fallback).queryByTestId("state-shortcut-region-atibaia-sp")).toBeNull();
    expect(within(fallback).queryByTestId("state-shortcut-region-campinas-sp")).toBeNull();
    // Outras cidades curadas permanecem
    expect(within(fallback).getByTestId("state-shortcut-region-sao-paulo-sp")).toBeTruthy();
  });

  it("contexto sem cidades válidas (vazio) cai no fallback simples", () => {
    render(
      <StateTerritorialShortcuts uf="sp" activeCityName="Atibaia" nearbyCities={[]} />
    );

    expect(screen.queryByTestId("state-shortcuts-nearby")).toBeNull();
    const fallback = screen.getByTestId("state-shortcuts-fallback");
    expect(within(fallback).getByText(/Principais cidades em/i)).toBeTruthy();
  });

  it("UF sem curadoria + sem contexto = render zero", () => {
    const { container } = render(<StateTerritorialShortcuts uf="zz" />);
    expect(container.innerHTML).toBe("");
  });
});
