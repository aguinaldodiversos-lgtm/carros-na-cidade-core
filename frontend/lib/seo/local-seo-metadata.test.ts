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

describe("buildLocalSeoMetadata — Fase 1: canonical de transição", () => {
  it("variant 'em' canonicaliza para si mesma (/carros-em/[slug])", () => {
    const meta = buildLocalSeoMetadata(buildModel("em"));
    expect(meta.alternates?.canonical).toBe(
      "https://carrosnacidade.com/carros-em/atibaia-sp"
    );
  });

  it("variant 'baratos' canonicaliza para si mesma (/carros-baratos-em/[slug])", () => {
    const meta = buildLocalSeoMetadata(buildModel("baratos"));
    expect(meta.alternates?.canonical).toBe(
      "https://carrosnacidade.com/carros-baratos-em/atibaia-sp"
    );
  });

  it("variant 'automaticos' canonicaliza para /carros-em/[slug] (indexável da intenção mais próxima)", () => {
    const meta = buildLocalSeoMetadata(buildModel("automaticos"));
    expect(meta.alternates?.canonical).toBe(
      "https://carrosnacidade.com/carros-em/atibaia-sp"
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

  it("variant 'automaticos' permanece noindex,follow", () => {
    const robots = buildLocalSeoMetadata(buildModel("automaticos")).robots;
    expect(robots).toMatchObject({ index: false, follow: true });
  });

  it("openGraph.url espelha a canonical de transição", () => {
    expect(buildLocalSeoMetadata(buildModel("em")).openGraph?.url).toBe(
      "https://carrosnacidade.com/carros-em/atibaia-sp"
    );
    expect(buildLocalSeoMetadata(buildModel("baratos")).openGraph?.url).toBe(
      "https://carrosnacidade.com/carros-baratos-em/atibaia-sp"
    );
  });

  it("canonical é URL LIMPA — nunca contém query string (sort/limit/page/utm/filtros)", () => {
    const variants = ["em", "baratos", "automaticos"] as const;
    for (const v of variants) {
      const canonical = buildLocalSeoMetadata(buildModel(v)).alternates?.canonical;
      expect(String(canonical)).not.toContain("?");
      expect(String(canonical)).not.toMatch(/sort|limit|page|utm/i);
    }
  });
});

describe("buildLocalSeoMetadata — title NÃO duplica o sufixo do site", () => {
  it("variant 'em' não termina com '| Carros na Cidade' (template do RootLayout adiciona)", () => {
    const meta = buildLocalSeoMetadata(buildModel("em"));
    expect(String(meta.title)).not.toMatch(/\|\s*Carros na Cidade\s*$/);
    // Conteúdo essencial preservado
    expect(String(meta.title)).toContain("Atibaia");
    expect(String(meta.title)).toContain("anúncios");
  });

  it("variant 'baratos' não termina com '| Carros na Cidade'", () => {
    const meta = buildLocalSeoMetadata(buildModel("baratos"));
    expect(String(meta.title)).not.toMatch(/\|\s*Carros na Cidade\s*$/);
    expect(String(meta.title)).toContain("baratos");
  });

  it("variant 'automaticos' não termina com '| Carros na Cidade'", () => {
    const meta = buildLocalSeoMetadata(buildModel("automaticos"));
    expect(String(meta.title)).not.toMatch(/\|\s*Carros na Cidade\s*$/);
    expect(String(meta.title)).toContain("automáticos");
  });
});

describe("buildLocalSeoJsonLd — url alinhada à canonical de transição", () => {
  it("variant 'em' devolve url self (/carros-em/[slug]) no JSON-LD", () => {
    const jsonLd = buildLocalSeoJsonLd(buildModel("em")) as { url?: string };
    expect(jsonLd.url).toBe("https://carrosnacidade.com/carros-em/atibaia-sp");
  });

  it("variant 'baratos' devolve url self (/carros-baratos-em/[slug]) no JSON-LD", () => {
    const jsonLd = buildLocalSeoJsonLd(buildModel("baratos")) as { url?: string };
    expect(jsonLd.url).toBe(
      "https://carrosnacidade.com/carros-baratos-em/atibaia-sp"
    );
  });

  it("variant 'automaticos' devolve url /carros-em/[slug] no JSON-LD", () => {
    const jsonLd = buildLocalSeoJsonLd(buildModel("automaticos")) as { url?: string };
    expect(jsonLd.url).toBe("https://carrosnacidade.com/carros-em/atibaia-sp");
  });
});
