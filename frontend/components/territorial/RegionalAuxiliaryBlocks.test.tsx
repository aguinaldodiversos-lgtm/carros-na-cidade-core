// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { RegionalAuxiliaryBlocks } from "./RegionalAuxiliaryBlocks";

const ATIBAIA_BASE = {
  id: 100,
  slug: "atibaia-sp",
  name: "Atibaia",
  state: "SP",
};

const ATIBAIA_MEMBERS = [
  {
    city_id: 200,
    slug: "braganca-paulista-sp",
    name: "Bragança Paulista",
    state: "SP",
    layer: 1,
    distance_km: 22.1,
  },
  {
    city_id: 201,
    slug: "jarinu-sp",
    name: "Jarinu",
    state: "SP",
    layer: 1,
    distance_km: 18.4,
  },
];

const CITY_COUNTS = [
  { slug: "atibaia-sp", name: "Atibaia", count: 4, distance_km: 0, is_base: true },
  {
    slug: "braganca-paulista-sp",
    name: "Bragança Paulista",
    count: 2,
    distance_km: 22.1,
    is_base: false,
  },
];

const TOP_BRANDS = [
  { brand: "Toyota", count: 3 },
  { brand: "Honda", count: 2 },
];

afterEach(() => {
  cleanup();
});

describe("RegionalAuxiliaryBlocks — cidades incluídas", () => {
  it("renderiza chip da cidade-base com label 'base'", () => {
    render(
      <RegionalAuxiliaryBlocks
        base={ATIBAIA_BASE}
        members={ATIBAIA_MEMBERS}
        radiusKm={80}
        cityCounts={CITY_COUNTS}
      />
    );
    const block = screen.getByTestId("regional-cities-block");
    expect(block.textContent).toContain("Atibaia");
    expect(block.textContent?.toLowerCase()).toContain("base");
  });

  it("renderiza chips de cidades vizinhas com link para /carros-em/[slug]", () => {
    render(
      <RegionalAuxiliaryBlocks
        base={ATIBAIA_BASE}
        members={ATIBAIA_MEMBERS}
        radiusKm={80}
        cityCounts={CITY_COUNTS}
      />
    );
    const chip = screen.getByTestId("regional-city-chip-braganca-paulista-sp");
    expect(chip.getAttribute("href")).toBe("/carros-em/braganca-paulista-sp");
  });

  it("suprime o bloco de cidades quando memberCount=0 (região só com cidade-base)", () => {
    render(
      <RegionalAuxiliaryBlocks
        base={ATIBAIA_BASE}
        members={[]}
        radiusKm={80}
      />
    );
    expect(screen.queryByTestId("regional-cities-block")).toBeNull();
  });
});

describe("RegionalAuxiliaryBlocks — marcas frequentes", () => {
  it("renderiza chips de top brands com link para /carros-em/[slug]?brand=...", () => {
    render(
      <RegionalAuxiliaryBlocks
        base={ATIBAIA_BASE}
        members={ATIBAIA_MEMBERS}
        radiusKm={80}
        topBrands={TOP_BRANDS}
      />
    );
    const block = screen.getByTestId("regional-top-brands");
    expect(block.textContent).toContain("Toyota");
    expect(block.textContent).toContain("Honda");

    const toyotaLink = screen.getByRole("link", { name: /Toyota/i });
    expect(toyotaLink.getAttribute("href")).toBe(
      "/carros-em/atibaia-sp?brand=Toyota"
    );
  });

  it("suprime o bloco de marcas quando topBrands está vazio", () => {
    render(
      <RegionalAuxiliaryBlocks
        base={ATIBAIA_BASE}
        members={ATIBAIA_MEMBERS}
        radiusKm={80}
        topBrands={[]}
      />
    );
    expect(screen.queryByTestId("regional-top-brands")).toBeNull();
  });
});

describe("RegionalAuxiliaryBlocks — SEO blocks", () => {
  it("renderiza os 3 artigos SEO com nome da cidade e raio", () => {
    render(
      <RegionalAuxiliaryBlocks
        base={ATIBAIA_BASE}
        members={ATIBAIA_MEMBERS}
        radiusKm={80}
      />
    );
    const block = screen.getByTestId("regional-seo-blocks");
    expect(block.textContent).toContain("Atibaia");
    expect(block.textContent).toContain("80 km");
    expect(block.textContent?.toLowerCase()).toContain("região");
  });

  it("link de 'Ver apenas [cidade]' aponta para /carros-em/[slug]", () => {
    render(
      <RegionalAuxiliaryBlocks
        base={ATIBAIA_BASE}
        members={ATIBAIA_MEMBERS}
        radiusKm={80}
      />
    );
    const cityLink = screen.getByRole("link", { name: /Ver apenas Atibaia/i });
    expect(cityLink.getAttribute("href")).toBe("/carros-em/atibaia-sp");
  });

  it("link de 'Ver catálogo de [UF]' aponta para /comprar/estado/[uf]", () => {
    render(
      <RegionalAuxiliaryBlocks
        base={ATIBAIA_BASE}
        members={ATIBAIA_MEMBERS}
        radiusKm={80}
      />
    );
    const stateLink = screen.getByRole("link", { name: /Ver catálogo de SP/i });
    expect(stateLink.getAttribute("href")).toBe("/comprar/estado/sp");
  });
});

describe("RegionalAuxiliaryBlocks — invariantes territoriais", () => {
  it("nunca emite link para /comprar/cidade/ (rota legada não-canônica)", () => {
    const { container } = render(
      <RegionalAuxiliaryBlocks
        base={ATIBAIA_BASE}
        members={ATIBAIA_MEMBERS}
        radiusKm={80}
        cityCounts={CITY_COUNTS}
        topBrands={TOP_BRANDS}
      />
    );
    const allLinks = container.querySelectorAll("a[href]");
    for (const link of allLinks) {
      expect(link.getAttribute("href")).not.toContain("/comprar/cidade/");
    }
  });
});
