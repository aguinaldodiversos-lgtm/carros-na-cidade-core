// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("@/components/ads/AdGrid", () => ({
  AdGrid: () => <div data-testid="ad-grid-stub" />,
}));

import { RegionPageView } from "./region-page-view";

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
];

afterEach(() => {
  cleanup();
});

describe("RegionPageView — link da Estadual usa URL canônica /comprar/estado/[uf]", () => {
  it("breadcrumb aponta para /comprar/estado/sp (lowercase) — não /comprar?state=SP", () => {
    render(
      <RegionPageView
        base={ATIBAIA_BASE}
        members={ATIBAIA_MEMBERS}
        ads={[]}
        radiusKm={80}
      />
    );
    // Breadcrumb tem o UF visível como label.
    const stateLink = screen.getByRole("link", { name: "SP" });
    expect(stateLink.getAttribute("href")).toBe("/comprar/estado/sp");
  });

  it("footer 'Ver catálogo de [UF]' aponta para /comprar/estado/[uf]", () => {
    render(
      <RegionPageView
        base={ATIBAIA_BASE}
        members={ATIBAIA_MEMBERS}
        ads={[]}
        radiusKm={80}
      />
    );
    const footerLink = screen.getByRole("link", { name: /Ver catálogo de SP/i });
    expect(footerLink.getAttribute("href")).toBe("/comprar/estado/sp");
  });

  it("fallback CTA 'Ver anúncios em [UF]' aponta para /comprar/estado/[uf]", () => {
    render(
      <RegionPageView
        base={ATIBAIA_BASE}
        members={[]}
        ads={[]}
        radiusKm={80}
      />
    );
    const fallbackLink = screen.getByRole("link", { name: /Ver anúncios em SP/i });
    expect(fallbackLink.getAttribute("href")).toBe("/comprar/estado/sp");
  });

  it("converte UF para lowercase mesmo quando vem em maiúsculo do payload", () => {
    render(
      <RegionPageView
        base={{ ...ATIBAIA_BASE, state: "MG" }}
        members={[]}
        ads={[]}
        radiusKm={80}
      />
    );
    const link = screen.getByRole("link", { name: /Ver anúncios em MG/i });
    expect(link.getAttribute("href")).toBe("/comprar/estado/mg");
  });

  it("nenhum link aponta para /comprar?state= (URL não-canônica banida)", () => {
    const { container } = render(
      <RegionPageView
        base={ATIBAIA_BASE}
        members={ATIBAIA_MEMBERS}
        ads={[]}
        radiusKm={80}
      />
    );
    const allLinks = container.querySelectorAll("a[href]");
    for (const link of allLinks) {
      const href = link.getAttribute("href") || "";
      expect(href).not.toMatch(/\/comprar\?state=/);
    }
  });
});

describe("RegionPageView — invariantes de Fase A→C", () => {
  it("link 'Voltar para [Cidade]' aponta para a canônica /carros-em/[slug]", () => {
    render(
      <RegionPageView
        base={ATIBAIA_BASE}
        members={ATIBAIA_MEMBERS}
        ads={[]}
        radiusKm={80}
      />
    );
    const cityLink = screen.getByRole("link", { name: /Voltar para Atibaia/i });
    expect(cityLink.getAttribute("href")).toBe("/carros-em/atibaia-sp");
  });

  it("chips de cidades vizinhas linkam para /carros-em/[slug-vizinha]", () => {
    render(
      <RegionPageView
        base={ATIBAIA_BASE}
        members={ATIBAIA_MEMBERS}
        ads={[]}
        radiusKm={80}
      />
    );
    const memberLink = screen.getByRole("link", { name: /Bragança Paulista/i });
    expect(memberLink.getAttribute("href")).toBe("/carros-em/braganca-paulista-sp");
  });
});
