import { describe, expect, it } from "vitest";
import { buildLocalSeoJsonLd, buildLocalSeoMetadata } from "./local-seo-metadata";
import type { LocalSeoLandingModel } from "./local-seo-data";

function buildModel(variant: LocalSeoLandingModel["variant"]): LocalSeoLandingModel {
  return {
    variant,
    slug: "atibaia-sp",
    cityName: "Atibaia",
    state: "SP",
    region: null,
    totalAds: 12,
    catalogTotalAds: 30,
    avgPrice: 45000,
    topBrands: [{ brand: "Honda", total: 4 }],
    sampleAds: [
      {
        id: 1,
        title: "Honda Civic 2018",
        slug: "honda-civic-2018",
        brand: "Honda",
        model: "Civic",
        year: 2018,
        price: 60000,
        image_url: "/images/sample.jpg",
      },
    ],
    isEmptyVariant: false,
    isEmptyCity: false,
    comprarHref: "/comprar?city_slug=atibaia-sp",
    hubHref: "/cidade/atibaia-sp",
    paths: {
      em: "/carros-em/atibaia-sp",
      baratos: "/carros-baratos-em/atibaia-sp",
      automaticos: "/carros-automaticos-em/atibaia-sp",
    },
    h1: "Carros em Atibaia (SP)",
    paragraphs: [],
  } as unknown as LocalSeoLandingModel;
}

describe("buildLocalSeoMetadata — política de canonical de transição", () => {
  it("variant 'em' canonicaliza para /comprar/cidade/[slug]", () => {
    const meta = buildLocalSeoMetadata(buildModel("em"));
    expect(meta.alternates?.canonical).toBe(
      "https://carrosnacidade.com/comprar/cidade/atibaia-sp"
    );
  });

  it("variant 'baratos' canonicaliza para /cidade/[slug]/abaixo-da-fipe", () => {
    const meta = buildLocalSeoMetadata(buildModel("baratos"));
    expect(meta.alternates?.canonical).toBe(
      "https://carrosnacidade.com/cidade/atibaia-sp/abaixo-da-fipe"
    );
  });

  it("variant 'automaticos' canonicaliza para /comprar/cidade/[slug]", () => {
    const meta = buildLocalSeoMetadata(buildModel("automaticos"));
    expect(meta.alternates?.canonical).toBe(
      "https://carrosnacidade.com/comprar/cidade/atibaia-sp"
    );
  });

  it("variant 'em' e 'baratos' permanecem indexáveis", () => {
    expect(buildLocalSeoMetadata(buildModel("em")).robots).toMatchObject({
      index: true,
      follow: true,
    });
    expect(buildLocalSeoMetadata(buildModel("baratos")).robots).toMatchObject({
      index: true,
      follow: true,
    });
  });

  it("variant 'automaticos' recebe noindex,follow", () => {
    const robots = buildLocalSeoMetadata(buildModel("automaticos")).robots;
    expect(robots).toMatchObject({ index: false, follow: true });
  });

  it("openGraph.url também aponta para a canônica de transição", () => {
    const meta = buildLocalSeoMetadata(buildModel("em"));
    expect(meta.openGraph?.url).toBe(
      "https://carrosnacidade.com/comprar/cidade/atibaia-sp"
    );
  });
});

describe("buildLocalSeoJsonLd — url alinhada à canonical de transição", () => {
  it("variant 'em' devolve url /comprar/cidade/[slug] no JSON-LD", () => {
    const jsonLd = buildLocalSeoJsonLd(buildModel("em")) as { url?: string };
    expect(jsonLd.url).toBe("https://carrosnacidade.com/comprar/cidade/atibaia-sp");
  });

  it("variant 'baratos' devolve url /cidade/[slug]/abaixo-da-fipe no JSON-LD", () => {
    const jsonLd = buildLocalSeoJsonLd(buildModel("baratos")) as { url?: string };
    expect(jsonLd.url).toBe(
      "https://carrosnacidade.com/cidade/atibaia-sp/abaixo-da-fipe"
    );
  });
});
