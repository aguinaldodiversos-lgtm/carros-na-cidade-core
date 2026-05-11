import { describe, expect, it, vi } from "vitest";

vi.mock("./site", () => ({
  toAbsoluteUrl: (path: string) =>
    path.startsWith("http") ? path : `https://example.test${path.startsWith("/") ? path : `/${path}`}`,
}));

import {
  buildRegionBreadcrumbJsonLd,
  buildRegionCollectionPageJsonLd,
  buildRegionItemListJsonLd,
  buildRegionPlaceJsonLd,
  buildRegionStructuredDataBlocks,
  type RegionStructuredDataInput,
} from "./region-structured-data";

const ATIBAIA: RegionStructuredDataInput = {
  base: { slug: "atibaia-sp", name: "Atibaia", state: "sp" },
  members: [
    { slug: "braganca-paulista-sp", name: "Bragança Paulista", state: "sp" },
    { slug: "jarinu-sp", name: "Jarinu", state: "sp" },
  ],
  totalAds: 142,
  radiusKm: 80,
  sampleAds: [
    { slug: "ad-1", title: "Honda Civic 2020", brand: "Honda", model: "Civic", year: 2020 },
    { slug: "ad-2", brand: "Toyota", model: "Corolla", year: 2019 },
    { slug: "ad-3", title: "" },
  ],
};

describe("buildRegionPlaceJsonLd", () => {
  it("descreve a cidade-base com address e UF normalizado para uppercase", () => {
    const json = buildRegionPlaceJsonLd(ATIBAIA);
    expect(json["@type"]).toBe("Place");
    expect(json.name).toBe("Atibaia e região");
    expect(json.address.addressLocality).toBe("Atibaia");
    expect(json.address.addressRegion).toBe("SP");
    expect(json.address.addressCountry).toBe("BR");
    expect(json.containedInPlace.name).toBe("SP");
  });

  it("não inventa coordenadas (lat/long) — Google penaliza fake geo data", () => {
    const json = buildRegionPlaceJsonLd(ATIBAIA);
    expect((json as unknown as Record<string, unknown>).geo).toBeUndefined();
    expect((json as unknown as Record<string, unknown>).latitude).toBeUndefined();
    expect((json as unknown as Record<string, unknown>).longitude).toBeUndefined();
  });
});

describe("buildRegionBreadcrumbJsonLd", () => {
  it("monta a hierarquia Início → UF → Cidade-base → Região", () => {
    const json = buildRegionBreadcrumbJsonLd(ATIBAIA);
    expect(json["@type"]).toBe("BreadcrumbList");
    const items = json.itemListElement;
    expect(items).toHaveLength(4);
    expect(items[0]).toMatchObject({ position: 1, name: "Início" });
    expect(items[1]).toMatchObject({
      position: 2,
      name: "SP",
      item: "https://example.test/comprar/estado/sp",
    });
    expect(items[2]).toMatchObject({
      position: 3,
      name: "Atibaia",
      item: "https://example.test/carros-em/atibaia-sp",
    });
    expect(items[3]).toMatchObject({
      position: 4,
      name: "Região de Atibaia",
      item: "https://example.test/carros-usados/regiao/atibaia-sp",
    });
  });
});

describe("buildRegionItemListJsonLd", () => {
  it("limita a 12 itens e numera com position 1..N", () => {
    const many = {
      ...ATIBAIA,
      sampleAds: Array.from({ length: 30 }, (_, i) => ({
        title: `Anúncio ${i + 1}`,
      })),
    };
    const json = buildRegionItemListJsonLd(many);
    expect(json.numberOfItems).toBe(12);
    expect(json.itemListElement[0].position).toBe(1);
    expect(json.itemListElement[11].position).toBe(12);
  });

  it("usa título do anúncio quando disponível, fallback brand+model+year quando não", () => {
    const json = buildRegionItemListJsonLd(ATIBAIA);
    expect(json.itemListElement[0].name).toBe("Honda Civic 2020");
    expect(json.itemListElement[1].name).toBe("Toyota Corolla 2019");
    expect(json.itemListElement[2].name).toBe("Veículo 3");
  });

  it("aceita lista vazia sem quebrar (anúncios podem não existir ainda)", () => {
    const empty = { ...ATIBAIA, sampleAds: [] };
    const json = buildRegionItemListJsonLd(empty);
    expect(json.numberOfItems).toBe(0);
    expect(json.itemListElement).toEqual([]);
  });
});

describe("buildRegionCollectionPageJsonLd", () => {
  it("aponta url para a regional canônica (não para a cidade)", () => {
    const json = buildRegionCollectionPageJsonLd(ATIBAIA);
    expect(json.url).toBe("https://example.test/carros-usados/regiao/atibaia-sp");
  });

  it("description menciona total real (não a amostra) e raio", () => {
    const json = buildRegionCollectionPageJsonLd(ATIBAIA);
    expect(json.description).toContain("142 carros");
    expect(json.description).toContain("80 km");
    expect(json.description).toContain("SP");
  });

  it("description sem contagem quando totalAds === 0 (não inventar número)", () => {
    const empty = { ...ATIBAIA, totalAds: 0, sampleAds: [] };
    const json = buildRegionCollectionPageJsonLd(empty);
    expect(json.description).not.toMatch(/\b0\s+carros?\b/i);
    expect(json.description).toContain("80 km");
  });

  it("inclui Place em `about` e ItemList em `mainEntity`", () => {
    const json = buildRegionCollectionPageJsonLd(ATIBAIA);
    expect((json.about as { "@type": string })["@type"]).toBe("Place");
    expect((json.mainEntity as { "@type": string })["@type"]).toBe("ItemList");
  });
});

describe("buildRegionStructuredDataBlocks", () => {
  it("retorna 4 blocos na ordem CollectionPage, BreadcrumbList, ItemList, Place", () => {
    const blocks = buildRegionStructuredDataBlocks(ATIBAIA);
    expect(blocks).toHaveLength(4);
    expect(blocks[0]["@type"]).toBe("CollectionPage");
    expect(blocks[1]["@type"]).toBe("BreadcrumbList");
    expect(blocks[2]["@type"]).toBe("ItemList");
    expect(blocks[3]["@type"]).toBe("Place");
  });

  it("todos os blocos têm @context schema.org", () => {
    const blocks = buildRegionStructuredDataBlocks(ATIBAIA);
    for (const b of blocks) {
      expect(b["@context"]).toBe("https://schema.org");
    }
  });

  it("é JSON serializável (sem cycles, sem functions)", () => {
    const blocks = buildRegionStructuredDataBlocks(ATIBAIA);
    for (const b of blocks) {
      expect(() => JSON.stringify(b)).not.toThrow();
      const round = JSON.parse(JSON.stringify(b));
      expect(round["@type"]).toBe(b["@type"]);
    }
  });
});
