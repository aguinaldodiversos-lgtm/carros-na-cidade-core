import { describe, expect, it } from "vitest";

import { buildLocalSeoMetadata } from "@/lib/seo/local-seo-metadata";
import type { LocalSeoLandingModel } from "@/lib/seo/local-seo-data";

/**
 * Contrato da URL canônica territorial `/carros-em/[slug]`.
 *
 * Duas cidades em todos os casos que envolvem território: um teste com uma
 * cidade só não distingue "preserva o slug" de "devolve atibaia-sp fixo", e
 * destino territorial fixo é a regressão mais cara possível aqui — significaria
 * servir o estoque de uma cidade sob a URL de outra.
 */

const SITE = "https://carrosnacidade.com";

function buildModel(
  slug: string,
  cityName: string,
  overrides: Partial<LocalSeoLandingModel> = {}
): LocalSeoLandingModel {
  return {
    variant: "em",
    slug,
    cityName,
    state: "SP",
    region: null,
    totalAds: 12,
    catalogTotalAds: 12,
    avgPrice: 45000,
    minPrice: 20000,
    maxPrice: 90000,
    belowFipeCount: 2,
    topBrands: [{ brand: "Honda", total: 4 }],
    sampleAds: [],
    isEmptyVariant: false,
    isEmptyCity: false,
    comprarHref: `/carros-em/${slug}`,
    hubHref: `/cidade/${slug}`,
    paths: {
      em: `/carros-em/${slug}`,
      baratos: `/carros-baratos-em/${slug}`,
      automaticos: `/carros-automaticos-em/${slug}`,
    },
    ...overrides,
  } as LocalSeoLandingModel;
}

const ATIBAIA = buildModel("atibaia-sp", "Atibaia");
const BRAGANCA = buildModel("braganca-paulista-sp", "Bragança Paulista");

describe("URL limpa — a vitrine canônica da cidade", () => {
  it("é index,follow com canonical autorreferente", () => {
    const md = buildLocalSeoMetadata(ATIBAIA, {});

    expect(md.robots).toMatchObject({ index: true, follow: true });
    expect(md.alternates?.canonical).toBe(`${SITE}/carros-em/atibaia-sp`);
  });

  it("cada cidade canonicaliza para si mesma", () => {
    expect(buildLocalSeoMetadata(ATIBAIA, {}).alternates?.canonical).toBe(
      `${SITE}/carros-em/atibaia-sp`
    );
    expect(buildLocalSeoMetadata(BRAGANCA, {}).alternates?.canonical).toBe(
      `${SITE}/carros-em/braganca-paulista-sp`
    );
  });

  it("Atibaia nunca canonicaliza para Bragança, e vice-versa", () => {
    const atibaia = String(buildLocalSeoMetadata(ATIBAIA, {}).alternates?.canonical);
    const braganca = String(buildLocalSeoMetadata(BRAGANCA, {}).alternates?.canonical);

    expect(atibaia).not.toContain("braganca");
    expect(braganca).not.toContain("atibaia");
  });

  it("a canonical não carrega query nenhuma", () => {
    const canonical = String(buildLocalSeoMetadata(ATIBAIA, {}).alternates?.canonical);
    expect(canonical).not.toContain("?");
    expect(canonical).not.toContain("city_slug");
    expect(canonical).not.toContain("sort");
  });

  it("sem searchParams (chamada legada) o comportamento é o da URL limpa", () => {
    const md = buildLocalSeoMetadata(ATIBAIA);
    expect(md.robots).toMatchObject({ index: true });
    expect(md.alternates?.canonical).toBe(`${SITE}/carros-em/atibaia-sp`);
  });
});

describe("ordenação e filtros desindexam e consolidam na URL limpa", () => {
  it.each([
    ["sort", { sort: "price_asc" }],
    ["raio", { raio: "25" }],
    ["seller_kind", { seller_kind: "dealer" }],
    ["opportunity", { opportunity: "true" }],
    ["priority_tier", { priority_tier: "4" }],
    ["brand", { brand: "Honda" }],
    ["price_min", { price_min: "20000" }],
    ["transmission", { transmission: "automatico" }],
  ])("%s → noindex,follow + canonical limpa", (_nome, searchParams) => {
    const md = buildLocalSeoMetadata(ATIBAIA, searchParams as Record<string, string>);

    expect(md.robots).toMatchObject({ index: false, follow: true });
    expect(md.alternates?.canonical).toBe(`${SITE}/carros-em/atibaia-sp`);
  });

  /**
   * Regressão direta: `generateMetadata` de `/carros-em/[slug]` IGNORAVA
   * searchParams. Toda variante com filtro respondia `index,follow` com
   * canonical autorreferente — uma página indexável por valor de filtro, todas
   * com o mesmo conteúdo recortado.
   */
  it("a query realmente chega na decisão (antes era ignorada)", () => {
    const limpa = buildLocalSeoMetadata(ATIBAIA, {});
    const comFiltro = buildLocalSeoMetadata(ATIBAIA, { raio: "25" });

    expect(limpa.robots).not.toEqual(comFiltro.robots);
  });

  it("sort=relevance é a ordenação padrão — não desindexa", () => {
    const md = buildLocalSeoMetadata(ATIBAIA, { sort: "relevance" });
    expect(md.robots).toMatchObject({ index: true, follow: true });
  });
});

describe("paginação — página 2+ é página própria", () => {
  it("page=2 é indexável com canonical autorreferente incluindo a página", () => {
    const md = buildLocalSeoMetadata(ATIBAIA, { page: "2" });

    expect(md.robots).toMatchObject({ index: true, follow: true });
    expect(md.alternates?.canonical).toBe(`${SITE}/carros-em/atibaia-sp?page=2`);
  });

  it("a paginação preserva a cidade", () => {
    expect(buildLocalSeoMetadata(BRAGANCA, { page: "3" }).alternates?.canonical).toBe(
      `${SITE}/carros-em/braganca-paulista-sp?page=3`
    );
  });

  it("page=1 é a URL limpa — nunca canonical com ?page=1", () => {
    expect(buildLocalSeoMetadata(ATIBAIA, { page: "1" }).alternates?.canonical).toBe(
      `${SITE}/carros-em/atibaia-sp`
    );
  });

  it.each(["0", "-2", "abc"])("page=%s cai na URL limpa", (page) => {
    expect(buildLocalSeoMetadata(ATIBAIA, { page }).alternates?.canonical).toBe(
      `${SITE}/carros-em/atibaia-sp`
    );
  });

  it("filtro + página: o filtro manda, canonical volta para a limpa", () => {
    const md = buildLocalSeoMetadata(ATIBAIA, { brand: "Honda", page: "2" });

    expect(md.robots).toMatchObject({ index: false });
    expect(md.alternates?.canonical).toBe(`${SITE}/carros-em/atibaia-sp`);
  });
});

describe("tracking não altera robots", () => {
  it.each(["utm_source", "utm_medium", "utm_campaign", "gclid", "fbclid"])(
    "%s mantém index e canonicaliza para a URL limpa",
    (param) => {
      const md = buildLocalSeoMetadata(ATIBAIA, { [param]: "x" });

      expect(md.robots).toMatchObject({ index: true, follow: true });
      expect(md.alternates?.canonical).toBe(`${SITE}/carros-em/atibaia-sp`);
    }
  );
});

describe("gate de estoque continua valendo — é o outro eixo da decisão", () => {
  it("cidade abaixo do limiar é noindex mesmo com a URL limpa", () => {
    const magra = buildModel("atibaia-sp", "Atibaia", { totalAds: 1 });
    expect(buildLocalSeoMetadata(magra, {}).robots).toMatchObject({ index: false, follow: true });
  });

  it("cidade sem estoque é noindex — conteúdo emprestado não indexa", () => {
    const vazia = buildModel("altaneira-ce", "Altaneira", {
      totalAds: 0,
      isEmptyCity: true,
      state: "CE",
    });
    expect(buildLocalSeoMetadata(vazia, {}).robots).toMatchObject({ index: false });
  });

  it("os dois eixos precisam valer juntos: estoque OK + query suja → noindex", () => {
    expect(buildLocalSeoMetadata(ATIBAIA, { sort: "price_asc" }).robots).toMatchObject({
      index: false,
    });
  });
});
