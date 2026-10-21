import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { LocalSeoLandingModel } from "@/lib/seo/local-seo-data";
import { BelowFipeCatalogSeo } from "./BelowFipeCatalogSeo";

function fixture(overrides: Partial<LocalSeoLandingModel> = {}): LocalSeoLandingModel {
  return {
    variant: "baratos",
    slug: "atibaia-sp",
    cityName: "Atibaia",
    state: "SP",
    totalAds: 0,
    catalogTotalAds: 0,
    isEmptyCity: true,
    isEmptyVariant: true,
    avgPrice: null,
    minPrice: null,
    maxPrice: null,
    topBrands: [],
    belowFipeCount: 0,
    paragraphs: ["Ainda não há veículos publicados em Atibaia."],
    paths: {
      em: "/carros-em/atibaia-sp",
      baratos: "/carros-baratos-em/atibaia-sp",
      automaticos: "/carros-automaticos-em/atibaia-sp",
    },
    comprarHref: "/comprar?city_slug=atibaia-sp&below_fipe=true",
    ...overrides,
  } as LocalSeoLandingModel;
}

describe("BelowFipeCatalogSeo — texto coerente com a vitrine", () => {
  it("não afirma estoque zero quando a API de busca tem um carro visível", () => {
    const html = renderToStaticMarkup(
      <BelowFipeCatalogSeo model={fixture()} cityName="Atibaia" catalogTotal={1} />
    );
    expect(html).toContain("Sobre os carros abaixo da FIPE em Atibaia");
    expect(html).toContain("Compare carros baratos em Atibaia");
    expect(html).not.toContain("Ainda não há veículos publicados");
  });

  it("mantém parágrafos territoriais e estatísticas quando as fontes concordam", () => {
    const html = renderToStaticMarkup(
      <BelowFipeCatalogSeo
        model={fixture({
          totalAds: 10,
          isEmptyCity: false,
          isEmptyVariant: false,
          avgPrice: 77000,
          paragraphs: ["Há dez ofertas verificadas em Atibaia."],
        })}
        cityName="Atibaia"
        catalogTotal={10}
      />
    );
    expect(html).toContain("Há dez ofertas verificadas em Atibaia.");
    expect(html).toContain("Anúncios ativos");
    expect(html).toContain("10");
  });

  it("omite contagens divergentes entre inventário SEO e catálogo", () => {
    const html = renderToStaticMarkup(
      <BelowFipeCatalogSeo
        model={fixture({
          totalAds: 10,
          isEmptyCity: false,
          paragraphs: ["Há exatamente 10 anúncios abaixo da FIPE."],
        })}
        cityName="Atibaia"
        catalogTotal={9}
      />
    );
    expect(html).toContain("Compare carros baratos em Atibaia");
    expect(html).not.toContain("Há exatamente 10 anúncios");
    expect(html).not.toContain("Anúncios ativos");
  });

  it("não publica números antigos quando a vitrine está vazia", () => {
    const html = renderToStaticMarkup(
      <BelowFipeCatalogSeo
        model={fixture({ totalAds: 10, isEmptyCity: false, paragraphs: ["Há 10 carros."] })}
        cityName="Atibaia"
        catalogTotal={0}
      />
    );
    expect(html).not.toContain("Há 10 carros.");
    expect(html).not.toContain("Anúncios ativos");
  });
});
