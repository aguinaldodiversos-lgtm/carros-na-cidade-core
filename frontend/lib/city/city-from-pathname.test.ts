import { describe, expect, it } from "vitest";
import { CITY_SLUG_REGEX, extractCitySlugFromPathname } from "./city-from-pathname";

describe("CITY_SLUG_REGEX", () => {
  it("aceita formato canônico `nome-uf`", () => {
    expect(CITY_SLUG_REGEX.test("atibaia-sp")).toBe(true);
    expect(CITY_SLUG_REGEX.test("sao-paulo-sp")).toBe(true);
    expect(CITY_SLUG_REGEX.test("bom-jesus-dos-perdoes-sp")).toBe(true);
    expect(CITY_SLUG_REGEX.test("rio-de-janeiro-rj")).toBe(true);
  });

  it("rejeita slug sem sufixo de UF", () => {
    expect(CITY_SLUG_REGEX.test("atibaia")).toBe(false);
    expect(CITY_SLUG_REGEX.test("atibaia-")).toBe(false);
  });

  it("rejeita UF inválido", () => {
    expect(CITY_SLUG_REGEX.test("atibaia-spa")).toBe(false);
    expect(CITY_SLUG_REGEX.test("atibaia-s")).toBe(false);
    expect(CITY_SLUG_REGEX.test("atibaia-1p")).toBe(false);
  });

  it("rejeita maiúsculas e acentos", () => {
    expect(CITY_SLUG_REGEX.test("Atibaia-sp")).toBe(false);
    expect(CITY_SLUG_REGEX.test("atibaía-sp")).toBe(false);
  });
});

describe("extractCitySlugFromPathname — rotas territoriais", () => {
  it("extrai slug de /carros-usados/regiao/[slug]", () => {
    expect(extractCitySlugFromPathname("/carros-usados/regiao/atibaia-sp")).toBe("atibaia-sp");
  });

  it("extrai slug de /carros-em/[slug]", () => {
    expect(extractCitySlugFromPathname("/carros-em/sao-paulo-sp")).toBe("sao-paulo-sp");
  });

  it("extrai slug das variantes de carros-(baratos|automaticos)-em", () => {
    expect(extractCitySlugFromPathname("/carros-baratos-em/atibaia-sp")).toBe("atibaia-sp");
    expect(extractCitySlugFromPathname("/carros-automaticos-em/atibaia-sp")).toBe("atibaia-sp");
  });

  it("extrai slug de /comprar/cidade/[slug]", () => {
    expect(extractCitySlugFromPathname("/comprar/cidade/campinas-sp")).toBe("campinas-sp");
  });

  it("extrai slug de /cidade/[slug]", () => {
    expect(extractCitySlugFromPathname("/cidade/campinas-sp")).toBe("campinas-sp");
  });

  it("extrai slug de /simulador-financiamento/[slug] e /tabela-fipe/[slug]", () => {
    expect(extractCitySlugFromPathname("/simulador-financiamento/atibaia-sp")).toBe("atibaia-sp");
    expect(extractCitySlugFromPathname("/tabela-fipe/atibaia-sp")).toBe("atibaia-sp");
  });

  it("extrai slug de /blog/[slug]", () => {
    expect(extractCitySlugFromPathname("/blog/atibaia-sp")).toBe("atibaia-sp");
  });

  it("tolera trailing slash", () => {
    expect(extractCitySlugFromPathname("/carros-em/atibaia-sp/")).toBe("atibaia-sp");
    expect(extractCitySlugFromPathname("/carros-usados/regiao/atibaia-sp/")).toBe("atibaia-sp");
  });
});

describe("extractCitySlugFromPathname — casos que devem retornar null", () => {
  it("rejeita rotas sem prefixo territorial", () => {
    expect(extractCitySlugFromPathname("/")).toBeNull();
    expect(extractCitySlugFromPathname("/comprar")).toBeNull();
    expect(extractCitySlugFromPathname("/comprar/estado/sp")).toBeNull();
    expect(extractCitySlugFromPathname("/anunciar")).toBeNull();
    expect(extractCitySlugFromPathname("/dashboard")).toBeNull();
    expect(extractCitySlugFromPathname("/veiculo/honda-civic-2020")).toBeNull();
  });

  it("rejeita prefixo territorial sem slug", () => {
    expect(extractCitySlugFromPathname("/carros-em/")).toBeNull();
    expect(extractCitySlugFromPathname("/carros-em")).toBeNull();
    expect(extractCitySlugFromPathname("/carros-usados/regiao/")).toBeNull();
    expect(extractCitySlugFromPathname("/carros-usados/regiao")).toBeNull();
  });

  it("rejeita subpaths (slug com segmento adicional)", () => {
    expect(extractCitySlugFromPathname("/carros-em/atibaia-sp/comparar")).toBeNull();
    expect(extractCitySlugFromPathname("/carros-usados/regiao/atibaia-sp/oportunidades")).toBeNull();
  });

  it("rejeita segmento que não casa com o formato canônico", () => {
    expect(extractCitySlugFromPathname("/carros-em/atibaia")).toBeNull();
    expect(extractCitySlugFromPathname("/blog/algum-post-de-blog")).toBeNull();
    expect(extractCitySlugFromPathname("/blog/atibaia")).toBeNull();
  });

  it("rejeita entrada inválida (null/undefined/empty)", () => {
    expect(extractCitySlugFromPathname(null)).toBeNull();
    expect(extractCitySlugFromPathname(undefined)).toBeNull();
    expect(extractCitySlugFromPathname("")).toBeNull();
    expect(extractCitySlugFromPathname("   ")).toBeNull();
  });

  it("defesa: rotas que apenas começam parecido", () => {
    expect(extractCitySlugFromPathname("/carros-em-atibaia-sp")).toBeNull();
    expect(extractCitySlugFromPathname("/carros-emissoes")).toBeNull();
  });
});
