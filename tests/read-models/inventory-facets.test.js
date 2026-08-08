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
  aggregateCommercialModels,
  getFooterInventoryFacets,
  getTopCitiesByInventory,
  getTopModelsForCity,
} = await import("../../src/read-models/cities/inventory-facets.service.js");

const { canonicalBrandSlug } = await import("../../src/shared/utils/slugify.js");
const { SEO_SURFACE, getSeoThreshold } = await import(
  "../../src/read-models/cities/city-thresholds.js"
);

const MODEL_MIN = getSeoThreshold(SEO_SURFACE.MODEL);

beforeEach(() => {
  queryMock.mockReset();
});

describe("aggregateCommercialModels — o rodapé linka a ENTIDADE, não a versão FIPE", () => {
  it("colapsa descrições FIPE do mesmo modelo e soma o estoque", () => {
    const models = aggregateCommercialModels([
      { brand: "GM - Chevrolet", model: "ONIX HATCH LT 1.0 12V Flex 5p Mec.", total: 2 },
      { brand: "GM - Chevrolet", model: "ONIX SEDAN Plus LT 1.0 12V Flex 4p Mec.", total: 2 },
      { brand: "GM - Chevrolet", model: "ONIX HATCH 1.0 12V Flex 5p Mec.", total: 2 },
    ]);

    expect(models).toHaveLength(1);
    expect(models[0].modelSlug).toBe("onix");
    expect(models[0].total).toBe(6);
    expect(models[0].label).toBe("Chevrolet Onix");
    // O caso que produzia "0 anúncios": prefixo de grupo some do slug.
    expect(models[0].brandSlug).toBe(canonicalBrandSlug("GM - Chevrolet"));
  });

  it("NENHUM slug do rodapé carrega ficha técnica FIPE", () => {
    // O rodapé é chrome global: um link para descrição FIPE colocava TODA
    // página do site apontando para um recorte de 1-2 anúncios (noindex).
    const models = aggregateCommercialModels([
      { brand: "Hyundai", model: "HB20 Sense Plus 1.0 Flex 12V Mec.", total: 5 },
      { brand: "VW - VolksWagen", model: "T-Cross 200 TSI 1.0 Flex 12V 5p Aut.", total: 4 },
    ]);

    for (const m of models) {
      expect(m.modelSlug).not.toMatch(/12v|flex|mec|aut|tsi|\d-\d/);
    }
    expect(models.map((m) => m.modelSlug).sort()).toEqual(["hb20", "t-cross"]);
  });

  it("só publica modelo QUALIFICADO — abaixo do limiar o link seria noindex", () => {
    const models = aggregateCommercialModels([
      { brand: "Fiat", model: "ARGO DRIVE 1.0 6V Flex", total: MODEL_MIN },
      { brand: "Fiat", model: "MOBI LIKE 1.0 Fire Flex 5p.", total: MODEL_MIN - 1 },
    ]);
    expect(models.map((m) => m.modelSlug)).toEqual(["argo"]);
  });

  it("descarta linha sem marca ou sem modelo derivável (link morto)", () => {
    expect(
      aggregateCommercialModels([
        { brand: "  ", model: "  ", total: 9 },
        { brand: "Fiat", model: "1.0 Flex 8V", total: 9 },
      ])
    ).toEqual([]);
  });

  it("respeita o limite pedido", () => {
    const rows = ["Argo", "Mobi", "Pulse", "Strada", "Toro"].map((m) => ({
      brand: "Fiat",
      model: `${m} Drive 1.0`,
      total: 10,
    }));
    expect(aggregateCommercialModels(rows, 2)).toHaveLength(2);
  });
});

describe("getTopModelsForCity", () => {
  it("agrega por entidade comercial a partir das linhas do banco", async () => {
    queryMock.mockResolvedValue({
      rows: [
        { brand: "Hyundai", model: "HB20 Sense Plus 1.0 Flex 12V Mec.", total: 4 },
        { brand: "GM - Chevrolet", model: "Onix Plus 1.0 Turbo", total: 3 },
      ],
      rowCount: 2,
    });

    const models = await getTopModelsForCity("atibaia-sp", 6);
    expect(models.map((m) => m.modelSlug)).toEqual(["hb20", "onix"]);
    expect(models[1].brand).toBe("Chevrolet");
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
