/**
 * Facetas de inventário do rodapé.
 *
 * O rodapé é chrome GLOBAL (toda página). Antes era hardcoded: 6 cidades com
 * ZERO anúncios e 5 modelos dos quais só um existia. Nenhum link para Atibaia,
 * a única cidade com estoque — o Search Console reportava "Nenhuma página de
 * referência detectada" para /carros-em/atibaia-sp.
 *
 * O invariante mais importante aqui é o dos SLUGS: eles são gerados pelas
 * mesmas funções que o resolver de `/cidade/{c}/marca/{b}/modelo/{m}` usa para
 * casar a URL com o valor real de `ads.brand`/`ads.model`. É isso que garante,
 * por construção, que nenhum link do rodapé leve a página com "0 anúncios".
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.fn();

vi.mock("../../src/infrastructure/database/db.js", () => ({
  pool: { query: (...args) => queryMock(...args) },
}));

vi.mock("../../src/shared/logger.js", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const {
  buildShortModelLabel,
  getFooterInventoryFacets,
  getTopCitiesByInventory,
  getTopModelsForCity,
} = await import("../../src/read-models/cities/inventory-facets.service.js");

const { canonicalBrandSlug, brandModelSlug } = await import("../../src/shared/utils/slugify.js");

beforeEach(() => {
  queryMock.mockReset();
});

describe("buildShortModelLabel — encurta sem corromper", () => {
  it("corta a ficha técnica FIPE", () => {
    expect(buildShortModelLabel("Hyundai", "HB20 Sense Plus 1.0 Flex 12V Mec.")).toBe(
      "Hyundai HB20 Sense Plus"
    );
  });

  it("normaliza prefixo de grupo FIPE na marca", () => {
    expect(buildShortModelLabel("GM - Chevrolet", "Onix Plus 1.0")).toBe("Chevrolet Onix Plus");
    expect(buildShortModelLabel("VW - VolksWagen", "Polo Track 1.0")).toBe("Volkswagen Polo Track");
  });

  it("preserva modelo curto por inteiro", () => {
    expect(buildShortModelLabel("Fiat", "Argo")).toBe("Fiat Argo");
  });

  it("nunca devolve rótulo só com a marca — o primeiro token sempre entra", () => {
    // "1.0" é token de ficha técnica, mas se for o PRIMEIRO do modelo não pode
    // zerar o rótulo (viraria "Fiat" sozinho, indistinguível de outro modelo).
    expect(buildShortModelLabel("Fiat", "1.0 Flex")).toBe("Fiat 1.0");
  });

  it("teto de 3 tokens de modelo", () => {
    expect(buildShortModelLabel("Jeep", "Compass Longitude Serie S Plus")).toBe(
      "Jeep Compass Longitude Serie"
    );
  });
});

describe("getTopModelsForCity — slugs que casam com o resolver", () => {
  it("gera brandSlug/modelSlug pelas MESMAS funções do resolver", async () => {
    queryMock.mockResolvedValue({
      rows: [
        { brand: "Hyundai", model: "HB20 Sense Plus 1.0 Flex 12V Mec.", total: 2 },
        { brand: "GM - Chevrolet", model: "Onix Plus 1.0 Turbo", total: 1 },
      ],
      rowCount: 2,
    });

    const models = await getTopModelsForCity("atibaia-sp", 6);

    expect(models[0].brandSlug).toBe(canonicalBrandSlug("Hyundai"));
    expect(models[0].modelSlug).toBe(brandModelSlug("HB20 Sense Plus 1.0 Flex 12V Mec."));
    // O caso que produzia "0 anúncios": prefixo de grupo tem de sumir do slug.
    expect(models[1].brandSlug).toBe("chevrolet");
    expect(models[1].brand).toBe("Chevrolet");
  });

  it("descarta linha cujo slug sairia vazio (link quebrado)", async () => {
    queryMock.mockResolvedValue({
      rows: [
        { brand: "  ", model: "  ", total: 3 },
        { brand: "Fiat", model: "Argo", total: 1 },
      ],
      rowCount: 2,
    });

    const models = await getTopModelsForCity("atibaia-sp", 6);
    expect(models).toHaveLength(1);
    expect(models[0].brandSlug).toBe("fiat");
  });

  it("slug de cidade vazio → lista vazia sem tocar o banco", async () => {
    expect(await getTopModelsForCity("  ", 6)).toEqual([]);
    expect(queryMock).not.toHaveBeenCalled();
  });
});

describe("getTopCitiesByInventory — nome real, nunca derivado do slug", () => {
  it("usa name/state da tabela cities (acento preservado)", async () => {
    queryMock.mockResolvedValue({
      rows: [
        { slug: "sao-paulo-sp", name: "São Paulo", state: "SP", total: 9 },
        { slug: "atibaia-sp", name: "Atibaia", state: "SP", total: 19 },
      ],
      rowCount: 2,
    });

    const cities = await getTopCitiesByInventory(6);
    expect(cities[0].name).toBe("São Paulo");
  });

  it("descarta linha sem slug ou sem nome", async () => {
    queryMock.mockResolvedValue({
      rows: [
        { slug: "", name: "Sem Slug", state: "SP", total: 5 },
        { slug: "atibaia-sp", name: "", state: "SP", total: 4 },
        { slug: "atibaia-sp", name: "Atibaia", state: "SP", total: 19 },
      ],
      rowCount: 3,
    });

    const cities = await getTopCitiesByInventory(6);
    expect(cities).toHaveLength(1);
    expect(cities[0].slug).toBe("atibaia-sp");
  });
});

describe("getFooterInventoryFacets — degrade nunca derruba o rodapé", () => {
  it("modelos vêm da cidade de MAIOR estoque", async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [
          { slug: "atibaia-sp", name: "Atibaia", state: "SP", total: 19 },
          { slug: "braganca-paulista-sp", name: "Bragança Paulista", state: "SP", total: 3 },
        ],
        rowCount: 2,
      })
      .mockResolvedValueOnce({
        rows: [{ brand: "Hyundai", model: "HB20 Sense Plus 1.0", total: 2 }],
        rowCount: 1,
      });

    const out = await getFooterInventoryFacets({});

    expect(out.modelsCity).toEqual({ slug: "atibaia-sp", name: "Atibaia", state: "SP" });
    expect(queryMock.mock.calls[1][1][0]).toBe("atibaia-sp");
  });

  it("falha nas cidades → tudo vazio, sem lançar", async () => {
    queryMock.mockRejectedValue(new Error("connection lost"));
    const out = await getFooterInventoryFacets({});
    expect(out).toEqual({ cities: [], models: [], modelsCity: null });
  });

  it("falha só nos modelos → cidades sobrevivem", async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [{ slug: "atibaia-sp", name: "Atibaia", state: "SP", total: 19 }],
        rowCount: 1,
      })
      .mockRejectedValueOnce(new Error("timeout"));

    const out = await getFooterInventoryFacets({});
    expect(out.cities).toHaveLength(1);
    expect(out.models).toEqual([]);
  });

  it("catálogo sem estoque → nem consulta modelos", async () => {
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const out = await getFooterInventoryFacets({});
    expect(out).toEqual({ cities: [], models: [], modelsCity: null });
    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it("falha LOGA — degrade mudo foi o que custou semanas no incidente dos sitemaps", async () => {
    const { logger } = await import("../../src/shared/logger.js");
    queryMock.mockRejectedValue(new Error("connection lost"));
    await getFooterInventoryFacets({});
    expect(logger.error).toHaveBeenCalled();
  });
});
