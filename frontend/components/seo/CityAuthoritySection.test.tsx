// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

import { CityAuthoritySection } from "./CityAuthoritySection";
import type { CitySeoOverview } from "@/lib/seo/city-seo-overview";

/**
 * Fixtures de DUAS cidades. Atibaia é o caso com inventário real; Bragança é
 * o controle de independência territorial — a mesma implementação, dados
 * próprios. Nenhum teste aqui pode passar por acidente de hardcode.
 */

const ATIBAIA: CitySeoOverview = {
  city: { id: 1, slug: "atibaia-sp", name: "Atibaia", state: "SP" },
  inventory: {
    activeAds: 27,
    activeDealers: 1,
    belowFipeCount: 6,
    automaticCount: 11,
    manualCount: 16,
    minYear: 2019,
    maxYear: 2025,
    updatedAt: "2026-08-05T12:00:00.000Z",
  },
  priceStats: {
    minPrice: 58500,
    maxPrice: 139900,
    medianPrice: 72500,
    avgPrice: 81200,
    sampleSize: 27,
    minSample: 5,
    publishable: true,
  },
  brands: [
    { slug: "fiat", label: "Fiat", activeAds: 7, minPrice: 58500, qualified: true, path: "/cidade/atibaia-sp/marca/fiat", lastUpdated: null },
    { slug: "chevrolet", label: "Chevrolet", activeAds: 6, minPrice: 62000, qualified: true, path: "/cidade/atibaia-sp/marca/chevrolet", lastUpdated: null },
    { slug: "jeep", label: "Jeep", activeAds: 1, minPrice: 99000, qualified: false, path: "/cidade/atibaia-sp/marca/jeep", lastUpdated: null },
  ],
  models: [
    {
      slug: "onix", label: "Onix", source: "derived", brandSlug: "chevrolet", brandLabel: "Chevrolet",
      activeAds: 6, minPrice: 62000, maxPrice: 89000, minYear: 2020, maxYear: 2024,
      fipeVersions: ["ONIX HATCH LT 1.0 12V Flex 5p Mec.", "ONIX SEDAN Plus LT 1.0 12V Flex 4p Mec."],
      qualified: true, path: "/cidade/atibaia-sp/marca/chevrolet/modelo/onix", lastUpdated: null,
    },
    {
      slug: "pulse", label: "Pulse", source: "derived", brandSlug: "fiat", brandLabel: "Fiat",
      activeAds: 2, minPrice: 93900, maxPrice: 103900, minYear: 2024, maxYear: 2025,
      fipeVersions: ["PULSE DRIVE 1.3 8V Flex Aut."],
      qualified: false, path: "/cidade/atibaia-sp/marca/fiat/modelo/pulse", lastUpdated: null,
    },
  ],
  unresolvedModelAds: 0,
  facets: { bodyTypes: [], fuelTypes: [], transmissions: [] },
  dealers: [{ slug: "ittmotors-122", name: "Ittmotors", activeAds: 27, minPrice: 58500, path: "/lojas/ittmotors-122" }],
  nearbyCities: [],
  thresholds: { city: 3, brand: 3, model: 3, bodyType: 4, transmission: 4, priceRange: 4 },
  generatedAt: "2026-08-07T00:00:00.000Z",
};

const BRAGANCA: CitySeoOverview = {
  ...ATIBAIA,
  city: { id: 2, slug: "braganca-paulista-sp", name: "Bragança Paulista", state: "SP" },
  inventory: {
    activeAds: 9, activeDealers: 2, belowFipeCount: 0, automaticCount: 4, manualCount: 5,
    minYear: 2018, maxYear: 2023, updatedAt: "2026-08-01T12:00:00.000Z",
  },
  priceStats: { minPrice: 41000, maxPrice: 96000, medianPrice: 55000, avgPrice: 58000, sampleSize: 9, minSample: 5, publishable: true },
  brands: [
    { slug: "toyota", label: "Toyota", activeAds: 5, minPrice: 41000, qualified: true, path: "/cidade/braganca-paulista-sp/marca/toyota", lastUpdated: null },
  ],
  models: [],
  dealers: [{ slug: "auto-braganca", name: "Auto Bragança", activeAds: 9, minPrice: 41000, path: "/lojas/auto-braganca" }],
  nearbyCities: [
    { slug: "atibaia-sp", name: "Atibaia", state: "SP", distanceKm: 22, activeAds: 27, qualified: true, path: "/carros-em/atibaia-sp" },
  ],
};

afterEach(() => cleanup());

describe("CityAuthoritySection — mercado local", () => {
  it("exibe a contagem real, nunca um número escrito à mão", () => {
    render(<CityAuthoritySection overview={ATIBAIA} />);
    expect(screen.getByText(/Há 27 veículos anunciados em Atibaia/)).toBeTruthy();
    expect(screen.getByText(/de 3 marcas diferentes/)).toBeTruthy();
  });

  it("publica faixa e mediana quando a amostra sustenta", () => {
    render(<CityAuthoritySection overview={ATIBAIA} />);
    const text = document.body.textContent || "";
    expect(text).toMatch(/mediana de/i);
    expect(screen.getByText("Preço mediano")).toBeTruthy();
  });

  it("OMITE preço quando a estatística não é publicável", () => {
    const thin: CitySeoOverview = {
      ...ATIBAIA,
      inventory: { ...ATIBAIA.inventory, activeAds: 2 },
      priceStats: { ...ATIBAIA.priceStats, sampleSize: 2, publishable: false },
    };
    render(<CityAuthoritySection overview={thin} />);
    expect(screen.queryByText("Preço mediano")).toBeNull();
    expect(document.body.textContent).not.toMatch(/mediana de/i);
  });

  it("cidade sem estoque não renderiza o módulo de mercado", () => {
    const empty: CitySeoOverview = {
      ...ATIBAIA,
      inventory: { ...ATIBAIA.inventory, activeAds: 0 },
      priceStats: { ...ATIBAIA.priceStats, publishable: false },
    };
    render(<CityAuthoritySection overview={empty} />);
    expect(screen.queryByText(/O mercado de carros usados/)).toBeNull();
  });

  it("não afirma média de preço (mediana é a estatística publicada)", () => {
    render(<CityAuthoritySection overview={ATIBAIA} />);
    expect(document.body.textContent).not.toMatch(/preço médio|média de/i);
  });
});

describe("CityAuthoritySection — qualificação de entidades", () => {
  it("marca qualificada vira âncora canônica de marca", () => {
    render(<CityAuthoritySection overview={ATIBAIA} />);
    const link = screen.getByRole("link", { name: /Fiat/ });
    expect(link.getAttribute("href")).toBe("/cidade/atibaia-sp/marca/fiat");
  });

  it("marca ABAIXO do limiar aparece como texto, nunca como link", () => {
    render(<CityAuthoritySection overview={ATIBAIA} />);
    expect(screen.queryByRole("link", { name: /Jeep/ })).toBeNull();
    // Continua VISÍVEL (com a contagem) — o usuário vê que há estoque da
    // marca; só não gastamos um link numa página que responderia noindex.
    expect(screen.getAllByText(/Jeep/).length).toBeGreaterThan(0);
  });

  it("modelo comercial qualificado vira âncora; abaixo do limiar não", () => {
    render(<CityAuthoritySection overview={ATIBAIA} />);
    const onix = screen.getByRole("link", { name: /Chevrolet Onix/ });
    expect(onix.getAttribute("href")).toBe("/cidade/atibaia-sp/marca/chevrolet/modelo/onix");
    expect(screen.queryByRole("link", { name: /Fiat Pulse/ })).toBeNull();
  });

  it("nenhum link da malha aponta para URL com parâmetro de filtro", () => {
    render(<CityAuthoritySection overview={ATIBAIA} />);
    for (const link of screen.getAllByRole("link")) {
      expect(link.getAttribute("href")).not.toMatch(/\?/);
    }
  });

  it("usa o modelo COMERCIAL como rótulo, não a descrição FIPE", () => {
    render(<CityAuthoritySection overview={ATIBAIA} />);
    const onix = screen.getByRole("link", { name: /Chevrolet Onix/ });
    expect(onix.textContent).not.toMatch(/12V|Flex|Mec\.|SEDAN|HATCH/);
  });
});

describe("CityAuthoritySection — lojas", () => {
  it("linka o lojista com estoque para a página pública dele", () => {
    render(<CityAuthoritySection overview={ATIBAIA} />);
    const link = screen.getByRole("link", { name: /Ittmotors/ });
    expect(link.getAttribute("href")).toBe("/lojas/ittmotors-122");
  });

  it("não expõe telefone, e-mail ou endereço", () => {
    render(<CityAuthoritySection overview={ATIBAIA} />);
    const text = document.body.textContent || "";
    expect(text).not.toMatch(/@|\(\d{2}\)|whatsapp/i);
  });
});

describe("CityAuthoritySection — cidades próximas", () => {
  it("não renderiza a seção quando nenhuma vizinha tem estoque", () => {
    render(<CityAuthoritySection overview={ATIBAIA} />);
    expect(screen.queryByText(/cidades próximas de/i)).toBeNull();
  });

  it("separa explicitamente a vizinhança da contagem da cidade", () => {
    render(<CityAuthoritySection overview={BRAGANCA} />);
    const section = screen.getByRole("heading", { name: /cidades próximas de Bragança Paulista/i })
      .closest("section")!;
    expect(within(section).getByText(/não entram no total de/i)).toBeTruthy();
    expect(within(section).getByRole("link", { name: /Atibaia/ }).getAttribute("href")).toBe(
      "/carros-em/atibaia-sp"
    );
  });
});

describe("independência territorial", () => {
  it("Bragança renderiza os números de Bragança, não os de Atibaia", () => {
    render(<CityAuthoritySection overview={BRAGANCA} />);
    const text = document.body.textContent || "";
    expect(text).toMatch(/Há 9 veículos anunciados em Bragança Paulista/);
    expect(text).not.toMatch(/27 veículos anunciados em Bragança/);
    expect(screen.getByRole("link", { name: /Toyota/ }).getAttribute("href")).toBe(
      "/cidade/braganca-paulista-sp/marca/toyota"
    );
  });

  it("nenhum link de Bragança aponta para uma rota de Atibaia (exceto a vizinhança declarada)", () => {
    render(<CityAuthoritySection overview={BRAGANCA} />);
    const brandAndModelLinks = screen
      .getAllByRole("link")
      .map((l) => l.getAttribute("href") || "")
      .filter((href) => href.startsWith("/cidade/") || href.startsWith("/lojas/"));

    expect(brandAndModelLinks.length).toBeGreaterThan(0);
    for (const href of brandAndModelLinks) {
      expect(href).not.toContain("atibaia");
    }
  });

  it("Bragança sem modelos comerciais não renderiza a seção de modelos", () => {
    render(<CityAuthoritySection overview={BRAGANCA} />);
    expect(screen.queryByText(/Modelos mais anunciados/i)).toBeNull();
  });
});
