// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { CompactCitySeoBlock } from "./CompactCitySeoBlock";
import type { LocalSeoLandingModel } from "@/lib/seo/local-seo-data";

const modelBase: LocalSeoLandingModel = {
  variant: "em",
  slug: "atibaia-sp",
  cityName: "Atibaia",
  state: "SP",
  region: null,
  totalAds: 12,
  catalogTotalAds: 12,
  avgPrice: 65000,
  topBrands: [
    { brand: "Volkswagen", total: 5 },
    { brand: "Toyota", total: 4 },
    { brand: "Chevrolet", total: 3 },
  ],
  sampleAds: [],
  isEmptyVariant: false,
  isEmptyCity: false,
  comprarHref: "/comprar/cidade/atibaia-sp",
  hubHref: "/cidade/atibaia-sp",
  paths: {
    em: "/carros-em/atibaia-sp",
    baratos: "/carros-baratos-em/atibaia-sp",
    automaticos: "/carros-automaticos-em/atibaia-sp",
  },
  h1: "Carros usados em Atibaia",
  paragraphs: [],
};

afterEach(() => cleanup());

describe("CompactCitySeoBlock", () => {
  it("renderiza h2 com o nome da cidade", () => {
    render(<CompactCitySeoBlock model={modelBase} />);
    const h2 = screen.getByRole("heading", { level: 2 });
    expect(h2.textContent).toBe("Sobre carros usados em Atibaia");
  });

  it("renderiza 1 parágrafo curto com palavras-chave SEO", () => {
    render(<CompactCitySeoBlock model={modelBase} />);
    const text = screen.getByText(/Encontre carros usados e seminovos/i);
    expect(text).toBeTruthy();
    expect(text.textContent).toMatch(/Atibaia/);
    expect(text.textContent).toMatch(/lojas e particulares/i);
    expect(text.textContent).toMatch(/abaixo da FIPE/i);
  });

  it("renderiza até 6 marcas frequentes como links discretos", () => {
    render(<CompactCitySeoBlock model={modelBase} />);
    const vw = screen.getByRole("link", { name: /Volkswagen/i });
    expect(vw.getAttribute("href")).toBe("/carros-em/atibaia-sp?brand=Volkswagen");
  });

  it("não renderiza CTAs grandes, cards, ou 'Continue explorando'", () => {
    render(<CompactCitySeoBlock model={modelBase} />);
    expect(screen.queryByText(/Continue explorando/i)).toBeNull();
    expect(screen.queryByText(/Destaques em Atibaia/i)).toBeNull();
    // Sem CTA para estado/regional — esses caminhos ficam no PublicFooter.
    expect(screen.queryByText(/Ver catálogo de SP/i)).toBeNull();
    expect(screen.queryByText(/Ver carros na região/i)).toBeNull();
  });

  it("não exibe marcas frequentes quando topBrands está vazio", () => {
    const empty = { ...modelBase, topBrands: [] };
    render(<CompactCitySeoBlock model={empty} />);
    expect(screen.queryByText(/Marcas frequentes/i)).toBeNull();
  });
});
