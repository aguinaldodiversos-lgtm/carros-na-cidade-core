// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { BrandCityStats } from "./BrandCityStats";
import {
  BRAND_CITY_MIN_INVENTORY,
  getTerritorialInventoryCount,
} from "@/lib/search/territorial-navigation";
import type { TerritorialPagePayload } from "@/lib/search/territorial-public";

const fiatAtibaia: TerritorialPagePayload = {
  city: { id: 1, name: "Atibaia", slug: "atibaia-sp", state: "SP" },
  brand: { name: "Fiat", slug: "fiat" },
  stats: {
    totalAds: 5,
    avgPrice: 58000,
    minPrice: 32000,
    maxPrice: 92000,
    totalBelowFipeAds: 2,
  },
  internalLinks: {
    models: [
      { model: "Argo", total: 2, path: "/cidade/atibaia-sp/marca/fiat/modelo/argo" },
      { model: "Mobi", total: 2, path: "/cidade/atibaia-sp/marca/fiat/modelo/mobi" },
      { model: "Toro", total: 1, path: "/cidade/atibaia-sp/marca/fiat/modelo/toro" },
    ],
  },
  generatedAt: "2026-07-03T12:00:00.000Z",
  sections: { ads: [] },
};

afterEach(() => cleanup());

describe("BrandCityStats — Fiat em Atibaia", () => {
  it("intro data-driven (nº, preço médio, modelos líderes) — falha no find-replace", () => {
    render(<BrandCityStats data={fiatAtibaia} />);
    const intro = screen.getByText(/Há 5 Fiat à venda em Atibaia - SP/i);
    expect(intro.textContent).toMatch(/preço médio de R\$\s?58\.000/);
    expect(intro.textContent).toMatch(/Argo e Mobi são os modelos mais anunciados/i);
  });

  it("tabela de estatísticas da marca (nº, preço médio, faixa, % abaixo da FIPE)", () => {
    render(<BrandCityStats data={fiatAtibaia} />);
    expect(screen.getByText(/Anúncios Fiat/i)).toBeTruthy();
    expect(screen.getByText(/Faixa de preço/i)).toBeTruthy();
    expect(screen.getByText(/R\$\s?32\.000 a R\$\s?92\.000/)).toBeTruthy();
    expect(screen.getByText(/2 \(40%\)/)).toBeTruthy(); // 2 de 5 = 40%
  });

  it("modelos da marca com contagem e link, + 'Dados atualizados em'", () => {
    render(<BrandCityStats data={fiatAtibaia} />);
    const argo = screen.getByRole("link", { name: /Argo/i });
    expect(argo.getAttribute("href")).toBe("/cidade/atibaia-sp/marca/fiat/modelo/argo");
    expect(screen.getByText(/Modelos de Fiat mais anunciados em Atibaia/i)).toBeTruthy();
    expect(screen.getByText(/Dados atualizados em 3 de julho de 2026/i)).toBeTruthy();
  });

  it("gate: marca sem inventário → não renderiza (não inventa estatística)", () => {
    const empty: TerritorialPagePayload = {
      ...fiatAtibaia,
      stats: { totalAds: 0 },
      sections: { ads: [] },
      internalLinks: {},
    };
    const { container } = render(<BrandCityStats data={empty} />);
    expect(container.firstChild).toBeNull();
  });
});

describe("proteção de indexação (limiar de inventário)", () => {
  it("limiar é 3 (MENOS de 3 → noindex)", () => {
    expect(BRAND_CITY_MIN_INVENTORY).toBe(3);
  });

  it("getTerritorialInventoryCount usa stats.totalAds do recorte da marca", () => {
    expect(getTerritorialInventoryCount(fiatAtibaia)).toBe(5);
    expect(getTerritorialInventoryCount({ stats: { totalAds: 2 } })).toBe(2);
    expect(getTerritorialInventoryCount({ seo: { activeCount: 4 } })).toBe(4);
    expect(getTerritorialInventoryCount({})).toBe(0);
  });
});
