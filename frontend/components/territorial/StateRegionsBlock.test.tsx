// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

import { StateRegionsBlock } from "./StateRegionsBlock";
import type { StateRegionSummary } from "@/lib/territory/fetch-state-regions";

function buildRegion(overrides: Partial<StateRegionSummary> = {}): StateRegionSummary {
  return {
    slug: "atibaia-sp",
    name: "Região de Atibaia",
    baseCitySlug: "atibaia-sp",
    baseCityName: "Atibaia",
    href: "/carros-usados/regiao/atibaia-sp",
    cityNames: ["Atibaia", "Itatiba", "Jarinu"],
    citySlugs: ["atibaia-sp", "itatiba-sp", "jarinu-sp"],
    adsCount: 12,
    featuredCount: 2,
    radiusKm: 80,
    ...overrides,
  };
}

afterEach(() => cleanup());

describe("StateRegionsBlock — supressão", () => {
  it("regions=[] → não renderiza nada (sem caixa promissora vazia)", () => {
    const { container } = render(
      <StateRegionsBlock stateName="São Paulo" regions={[]} />
    );
    expect(container.innerHTML).toBe("");
  });
});

describe("StateRegionsBlock — renderização básica", () => {
  it("renderiza título com nome do estado", () => {
    render(<StateRegionsBlock stateName="São Paulo" regions={[buildRegion()]} />);
    expect(screen.getByText(/Explore carros por região em São Paulo/i)).toBeInTheDocument();
  });

  it("renderiza um card por região (com limite default 8)", () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      buildRegion({ slug: `regiao-${i}-sp`, baseCitySlug: `regiao-${i}-sp`, baseCityName: `Região ${i}`, name: `Região de Região ${i}`, href: `/carros-usados/regiao/regiao-${i}-sp` })
    );
    render(<StateRegionsBlock stateName="São Paulo" regions={many} />);
    const cards = screen.getAllByTestId(/^state-region-card-/);
    expect(cards).toHaveLength(8);
  });

  it("respeita maxCards quando passado", () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      buildRegion({ slug: `r-${i}-sp`, baseCitySlug: `r-${i}-sp`, baseCityName: `R${i}`, name: `Região de R${i}`, href: `/x/${i}` })
    );
    render(<StateRegionsBlock stateName="São Paulo" regions={many} maxCards={4} />);
    expect(screen.getAllByTestId(/^state-region-card-/)).toHaveLength(4);
  });
});

describe("StateRegionsBlock — conteúdo dos cards", () => {
  it("card tem nome da região + cidades preview + contagem de ofertas", () => {
    render(<StateRegionsBlock stateName="São Paulo" regions={[buildRegion()]} />);

    const card = screen.getByTestId("state-region-card-atibaia-sp");
    const inCard = within(card);
    expect(inCard.getByText("Região de Atibaia")).toBeInTheDocument();
    expect(inCard.getByText(/Atibaia, Itatiba, Jarinu/i)).toBeInTheDocument();
    expect(inCard.getByText(/12 ofertas/i)).toBeInTheDocument();
    expect(inCard.getByText(/2 em destaque/i)).toBeInTheDocument();
  });

  it("oculta linha de destaque quando featuredCount=0", () => {
    render(
      <StateRegionsBlock
        stateName="São Paulo"
        regions={[buildRegion({ adsCount: 5, featuredCount: 0 })]}
      />
    );
    expect(screen.queryByText(/em destaque/i)).not.toBeInTheDocument();
    expect(screen.getByText(/5 ofertas/i)).toBeInTheDocument();
  });

  it("mostra fallback 'Ver ofertas da região' quando adsCount=0", () => {
    render(
      <StateRegionsBlock
        stateName="São Paulo"
        regions={[buildRegion({ adsCount: 0, featuredCount: 0 })]}
      />
    );
    expect(screen.getByText(/Ver ofertas da região/i)).toBeInTheDocument();
  });

  it("trunca cityNames longos com 'e mais N'", () => {
    render(
      <StateRegionsBlock
        stateName="São Paulo"
        regions={[
          buildRegion({
            cityNames: ["A", "B", "C", "D", "E", "F"],
          }),
        ]}
      />
    );
    expect(screen.getByText(/A, B, C e mais 3/i)).toBeInTheDocument();
  });
});

describe("StateRegionsBlock — segurança dos links", () => {
  it("href aponta para /carros-usados/regiao/[slug] (não Brasil)", () => {
    render(<StateRegionsBlock stateName="São Paulo" regions={[buildRegion()]} />);
    const link = screen.getByTestId("state-region-card-atibaia-sp");
    expect(link.getAttribute("href")).toBe("/carros-usados/regiao/atibaia-sp");
  });

  it("nenhum link aponta para /comprar?state= ou texto 'Brasil'", () => {
    const { container } = render(
      <StateRegionsBlock stateName="São Paulo" regions={[buildRegion()]} />
    );
    expect(container.innerHTML.toLowerCase()).not.toContain("brasil");
    for (const link of container.querySelectorAll("a[href]")) {
      const href = link.getAttribute("href") || "";
      expect(href).not.toContain("/comprar?state=");
    }
  });
});
