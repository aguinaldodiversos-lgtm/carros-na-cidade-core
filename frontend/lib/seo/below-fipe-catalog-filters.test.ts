import { describe, expect, it } from "vitest";
import { normalizeCityFilters } from "@/lib/buy/territory-variant";
import { enforceBelowFipeCatalogFilters } from "./below-fipe-catalog-filters";

describe("catálogo de carros baratos — escopo obrigatório", () => {
  it("ignora tentativas de remover abaixo-FIPE ou incluir municípios próximos", () => {
    const params = {
      below_fipe: "false",
      raio: "25",
      brand: "Fiat",
      sort: "price_asc",
    };
    const safe = enforceBelowFipeCatalogFilters(params);
    const filters = normalizeCityFilters("atibaia-sp", safe);
    expect(params.below_fipe).toBe("false");
    expect(params.raio).toBe("25");
    expect(filters).toMatchObject({
      city_slug: "atibaia-sp",
      below_fipe: true,
      raio: 0,
      brand: "Fiat",
      sort: "price_asc",
    });
  });

  it("também impõe o recorte em URL limpa sem query", () => {
    const filters = normalizeCityFilters("atibaia-sp", enforceBelowFipeCatalogFilters({}));
    expect(filters.below_fipe).toBe(true);
    expect(filters.raio).toBe(0);
    expect(filters.city_slug).toBe("atibaia-sp");
  });

  it("não muda parâmetros adicionais nem o objeto do chamador", () => {
    const original = { q: "onix", page: "2", below_fipe: "false" };
    const safe = enforceBelowFipeCatalogFilters(original);
    expect(safe).toMatchObject({ q: "onix", page: "2", below_fipe: "true", raio: "0" });
    expect(original.below_fipe).toBe("false");
  });
});
