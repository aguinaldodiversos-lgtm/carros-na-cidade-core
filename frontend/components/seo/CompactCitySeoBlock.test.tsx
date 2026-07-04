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
  minPrice: 28000,
  maxPrice: 189000,
  belowFipeCount: 3,
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

  it("cidade COM inventário: intro data-driven (nº, preço médio, marca líder) + stats + data", () => {
    render(<CompactCitySeoBlock model={modelBase} />);
    // Intro única por cidade — depende dos dados (não passa em find-replace).
    const intro = screen.getByText(/Há 12 carros à venda em Atibaia - SP/i);
    expect(intro.textContent).toMatch(/preço médio de/i);
    expect(intro.textContent).toMatch(/Volkswagen é a marca mais anunciada/i);
    // Tabela de estatísticas locais reais.
    expect(screen.getByText(/Anúncios ativos/i)).toBeTruthy();
    expect(screen.getByText(/Faixa de preço/i)).toBeTruthy();
    expect(screen.getByText(/Abaixo da FIPE/i)).toBeTruthy();
    // Sinal de frescor.
    expect(screen.getByText(/Dados atualizados em/i)).toBeTruthy();
    // NÃO usa o texto genérico quando há dados.
    expect(screen.queryByText(/Encontre carros usados e seminovos/i)).toBeNull();
  });

  it("cidade SEM inventário: mantém parágrafo genérico e NÃO inventa estatística", () => {
    const empty: LocalSeoLandingModel = {
      ...modelBase,
      totalAds: 0,
      catalogTotalAds: 0,
      isEmptyCity: true,
      isEmptyVariant: true,
      avgPrice: null,
      minPrice: null,
      maxPrice: null,
      belowFipeCount: 0,
    };
    render(<CompactCitySeoBlock model={empty} />);
    expect(screen.getByText(/Encontre carros usados e seminovos/i)).toBeTruthy();
    expect(screen.queryByText(/Dados atualizados em/i)).toBeNull();
    expect(screen.queryByText(/Anúncios ativos/i)).toBeNull();
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
