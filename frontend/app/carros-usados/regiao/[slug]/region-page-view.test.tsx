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
        totalAds={0}
      />
    );
    // Breadcrumb tem o UF visível como label.
    const stateLink = screen.getByRole("link", { name: "SP" });
    expect(stateLink.getAttribute("href")).toBe("/comprar/estado/sp");
  });

  it("footer 'Ampliar para [UF]' aponta para /comprar/estado/[uf]", () => {
    render(
      <RegionPageView
        base={ATIBAIA_BASE}
        members={ATIBAIA_MEMBERS}
        ads={[]}
        radiusKm={80}
        totalAds={0}
      />
    );
    const footerLink = screen.getByTestId("regional-state-cta");
    expect(footerLink.getAttribute("href")).toBe("/comprar/estado/sp");
    expect(footerLink.textContent).toMatch(/Ampliar para SP/i);
  });

  it("fallback CTA 'Ver anúncios em [UF]' aponta para /comprar/estado/[uf]", () => {
    render(
      <RegionPageView
        base={ATIBAIA_BASE}
        members={[]}
        ads={[]}
        radiusKm={80}
        totalAds={0}
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
        totalAds={0}
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
        totalAds={0}
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
  it("link 'Ver somente [Cidade]' aponta para a canônica /carros-em/[slug]", () => {
    render(
      <RegionPageView
        base={ATIBAIA_BASE}
        members={ATIBAIA_MEMBERS}
        ads={[]}
        radiusKm={80}
        totalAds={0}
      />
    );
    const cityLink = screen.getByTestId("regional-city-cta");
    expect(cityLink.getAttribute("href")).toBe("/carros-em/atibaia-sp");
    expect(cityLink.textContent).toMatch(/Ver somente Atibaia/i);
  });

  it("chips de cidades vizinhas linkam para /carros-em/[slug-vizinha]", () => {
    render(
      <RegionPageView
        base={ATIBAIA_BASE}
        members={ATIBAIA_MEMBERS}
        ads={[]}
        radiusKm={80}
        totalAds={0}
      />
    );
    const memberLink = screen.getByRole("link", { name: /Bragança Paulista/i });
    expect(memberLink.getAttribute("href")).toBe("/carros-em/braganca-paulista-sp");
  });
});

describe("RegionPageView — PR 2: vitrine principal + FAQ", () => {
  it("renderiza a seção de FAQ regional (com as 4 perguntas-chave)", () => {
    render(
      <RegionPageView
        base={ATIBAIA_BASE}
        members={ATIBAIA_MEMBERS}
        ads={[]}
        radiusKm={80}
        totalAds={0}
      />
    );
    expect(screen.getByTestId("regional-faq")).toBeInTheDocument();
    expect(screen.getByText(/Vale a pena buscar carros na Região de Atibaia/i)).toBeInTheDocument();
    expect(screen.getByText(/Quais cidades fazem parte da Região de Atibaia/i)).toBeInTheDocument();
    expect(screen.getByText(/Posso ver somente anúncios de Atibaia/i)).toBeInTheDocument();
    expect(screen.getByText(/Como anunciar para compradores da Região/i)).toBeInTheDocument();
  });

  it("CTA primário 'Anunciar na região' está presente como primary filled", () => {
    render(
      <RegionPageView
        base={ATIBAIA_BASE}
        members={ATIBAIA_MEMBERS}
        ads={[]}
        radiusKm={80}
        totalAds={0}
      />
    );
    const anunciar = screen.getByTestId("regional-anunciar-cta");
    expect(anunciar).toBeInTheDocument();
    expect(anunciar.getAttribute("href")).toContain("/anunciar");
    expect(anunciar.getAttribute("href")).toContain("city_slug=atibaia-sp");
  });

  it("ordem dos CTAs: Anunciar (primary) > Ver somente cidade > Ampliar para estado", () => {
    render(
      <RegionPageView
        base={ATIBAIA_BASE}
        members={ATIBAIA_MEMBERS}
        ads={[]}
        radiusKm={80}
        totalAds={0}
      />
    );
    const anunciar = screen.getByTestId("regional-anunciar-cta");
    const city = screen.getByTestId("regional-city-cta");
    const state = screen.getByTestId("regional-state-cta");
    // DOM order matters for the user scanning hierarchy:
    expect(anunciar.compareDocumentPosition(city) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(city.compareDocumentPosition(state) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("link genérico 'Buscar outra cidade' foi removido (CTAs focados em Anunciar/Cidade/Estado)", () => {
    render(
      <RegionPageView
        base={ATIBAIA_BASE}
        members={ATIBAIA_MEMBERS}
        ads={[]}
        radiusKm={80}
        totalAds={0}
      />
    );
    expect(screen.queryByText(/Buscar outra cidade/i)).not.toBeInTheDocument();
  });
});
