import { describe, expect, it } from "vitest";

import { buildNationalDirectory, EMPTY_NATIONAL_DIRECTORY } from "@/lib/buy/national-directory";

/**
 * A vitrine nacional só pode listar o que a REGRA TERRITORIAL considera
 * existente: cidade com pelo menos um anúncio ativo. Estes testes travam a
 * regra na derivação, para que a página não ofereça um link que o gate do
 * middleware vai barrar com 404.
 */
describe("buildNationalDirectory — regra territorial", () => {
  it("lista apenas cidades com anúncio ativo", () => {
    const d = buildNationalDirectory({
      "atibaia-sp": 19,
      "braganca-paulista-sp": 4,
      "altaneira-ce": 0,
    });

    expect(d.cities.map((c) => c.slug)).toEqual(["atibaia-sp", "braganca-paulista-sp"]);
    expect(d.cities.some((c) => c.slug === "altaneira-ce")).toBe(false);
  });

  it("cidade sem anúncio ativo também não cria estado", () => {
    const d = buildNationalDirectory({ "altaneira-ce": 0, "atibaia-sp": 5 });
    expect(d.states.map((s) => s.uf)).toEqual(["SP"]);
  });

  it("catálogo vazio produz diretório vazio — nunca uma cidade padrão", () => {
    const d = buildNationalDirectory({});
    expect(d.cities).toEqual([]);
    expect(d.states).toEqual([]);
    expect(d.totalActiveAds).toBe(0);
    expect(d.ok).toBe(true);
  });

  it("backend indisponível é distinguível de catálogo vazio", () => {
    const d = buildNationalDirectory(null);
    expect(d).toEqual(EMPTY_NATIONAL_DIRECTORY);
    expect(d.ok).toBe(false);
  });

  it("descarta slug que não é cidade brasileira válida", () => {
    const d = buildNationalDirectory({ "xpto-zz": 10, "atibaia-sp": 1 });
    expect(d.cities.map((c) => c.slug)).toEqual(["atibaia-sp"]);
  });
});

describe("buildNationalDirectory — links e agregação", () => {
  it("todo link de cidade é a canônica /carros-em/[slug]", () => {
    const d = buildNationalDirectory({ "atibaia-sp": 19, "curitiba-pr": 2 });

    expect(d.cities.map((c) => c.href)).toEqual(["/carros-em/atibaia-sp", "/carros-em/curitiba-pr"]);
    for (const city of d.cities) {
      expect(city.href).not.toContain("/comprar");
      expect(city.href).not.toContain("city_slug=");
    }
  });

  it("agrega por UF somando o estoque das cidades", () => {
    const d = buildNationalDirectory({
      "atibaia-sp": 19,
      "braganca-paulista-sp": 4,
      "curitiba-pr": 30,
    });

    expect(d.states).toEqual([
      { uf: "PR", name: "Paraná", activeAds: 30, cities: 1, href: "/carros-usados/pr" },
      { uf: "SP", name: "São Paulo", activeAds: 23, cities: 2, href: "/carros-usados/sp" },
    ]);
  });

  it("ordena por estoque; empate resolve por nome (ordem estável)", () => {
    const d = buildNationalDirectory({ "curitiba-pr": 5, "atibaia-sp": 5, "campinas-sp": 5 });
    expect(d.cities.map((c) => c.slug)).toEqual(["atibaia-sp", "campinas-sp", "curitiba-pr"]);
  });

  it("respeita o teto de cidades sem afetar os totais", () => {
    const d = buildNationalDirectory(
      { "atibaia-sp": 9, "campinas-sp": 8, "curitiba-pr": 7 },
      2
    );

    expect(d.cities).toHaveLength(2);
    expect(d.totalCities).toBe(3);
    expect(d.totalActiveAds).toBe(24);
  });

  it("nenhuma cidade é privilegiada — quem tem mais estoque lidera", () => {
    const comAtibaiaNaFrente = buildNationalDirectory({ "atibaia-sp": 50, "curitiba-pr": 2 });
    const comCuritibaNaFrente = buildNationalDirectory({ "atibaia-sp": 2, "curitiba-pr": 50 });

    expect(comAtibaiaNaFrente.cities[0].slug).toBe("atibaia-sp");
    expect(comCuritibaNaFrente.cities[0].slug).toBe("curitiba-pr");
  });
});
