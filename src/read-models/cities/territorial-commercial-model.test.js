import { describe, it, expect } from "vitest";

import { matchModelRowsBySlug, aggregateMatchedRows } from "./territorial-cluster.logic.js";
import { buildModelEntries } from "../seo/territorial-inventory-sitemap.service.js";
import { getSeoThreshold, SEO_SURFACE } from "./city-thresholds.js";

/**
 * Linhas de agregação espelhando o inventário ativo real de Atibaia
 * (auditoria 2026-08-07): quatro descrições FIPE, um único Onix.
 */
const ONIX_ROWS = [
  {
    brand: "GM - Chevrolet",
    model: "ONIX SEDAN Plus LT 1.0 12V Flex 4p Mec.",
    total: 2,
    sum_price: 160000,
    min_price: 78000,
    max_price: 82000,
    min_year: 2022,
    max_year: 2023,
    last_updated: "2026-08-05T10:00:00.000Z",
  },
  {
    brand: "GM - Chevrolet",
    model: "ONIX HATCH LT 1.0 12V Flex 5p Mec.",
    total: 2,
    sum_price: 140000,
    min_price: 68000,
    max_price: 72000,
    min_year: 2021,
    max_year: 2022,
    last_updated: "2026-08-06T10:00:00.000Z",
  },
  {
    brand: "GM - Chevrolet",
    model: "ONIX SEDAN Plus LTZ 1.0 12V TB Flex Aut.",
    total: 1,
    sum_price: 89000,
    min_price: 89000,
    max_price: 89000,
    min_year: 2024,
    max_year: 2024,
    last_updated: "2026-08-01T10:00:00.000Z",
  },
  {
    brand: "GM - Chevrolet",
    model: "ONIX HATCH 1.0 12V Flex 5p Mec.",
    total: 1,
    sum_price: 62000,
    min_price: 62000,
    max_price: 62000,
    min_year: 2020,
    max_year: 2020,
    last_updated: "2026-07-28T10:00:00.000Z",
  },
];

describe("matchModelRowsBySlug — resolução por modelo comercial", () => {
  it("/modelo/onix agrega as QUATRO descrições FIPE", () => {
    const matched = matchModelRowsBySlug(ONIX_ROWS, "onix");
    expect(matched.taxonomy).toBe("commercial");
    expect(matched.rows.length).toBe(4);
    expect(matched.commercialLabel).toBe("Onix");
  });

  it("o agregado soma o estoque inteiro da entidade", () => {
    const matched = matchModelRowsBySlug(ONIX_ROWS, "onix");
    const agg = aggregateMatchedRows(matched.rows, {
      labelKey: "model",
      slug: "onix",
      labelOverride: matched.commercialLabel,
    });

    expect(agg.activeCount).toBe(6);
    expect(agg.stats.minPrice).toBe(62000);
    expect(agg.stats.maxPrice).toBe(89000);
    expect(agg.stats.minYear).toBe(2020);
    expect(agg.stats.maxYear).toBe(2024);
    // Rótulo é a ENTIDADE, não a descrição FIPE da variação mais volumosa.
    expect(agg.label).toBe("Onix");
  });

  it("cruza o limiar de indexação que nenhuma versão isolada cruzava", () => {
    const threshold = getSeoThreshold(SEO_SURFACE.MODEL);
    const matched = matchModelRowsBySlug(ONIX_ROWS, "onix");
    const agg = aggregateMatchedRows(matched.rows, {
      labelKey: "model",
      slug: "onix",
      labelOverride: matched.commercialLabel,
    });

    expect(agg.activeCount).toBeGreaterThanOrEqual(threshold);
    for (const row of ONIX_ROWS) expect(row.total).toBeLessThan(threshold);
  });

  it("URL antiga (descrição FIPE) ainda resolve, mas como recorte pequeno", () => {
    // Compatibilidade: URLs já rastreadas não viram 404. Elas resolvem para o
    // recorte de 2 anúncios, que fica abaixo do limiar → noindex + fora do
    // sitemap. Sem duplicata no índice.
    const matched = matchModelRowsBySlug(ONIX_ROWS, "onix-hatch-lt-1-0-12v-flex-5p-mec");
    expect(matched.taxonomy).toBe("fipe");
    expect(matched.rows.length).toBe(1);

    const agg = aggregateMatchedRows(matched.rows, { labelKey: "model", slug: "x" });
    expect(agg.activeCount).toBe(2);
    expect(agg.activeCount).toBeLessThan(getSeoThreshold(SEO_SURFACE.MODEL));
  });

  it("slug inexistente não casa nada", () => {
    const matched = matchModelRowsBySlug(ONIX_ROWS, "corolla");
    expect(matched.taxonomy).toBe("none");
    expect(matched.rows).toEqual([]);
  });

  it('não colapsa "gol" e "golf"', () => {
    const rows = [
      { brand: "VW - VolksWagen", model: "Gol 1.0 Flex 12V 5p", total: 3 },
      { brand: "VW - VolksWagen", model: "Golf 1.4 TSI Flex 16V 5p Aut.", total: 3 },
    ];
    expect(matchModelRowsBySlug(rows, "gol").rows.map((r) => r.model)).toEqual([
      "Gol 1.0 Flex 12V 5p",
    ]);
    expect(matchModelRowsBySlug(rows, "golf").rows.map((r) => r.model)).toEqual([
      "Golf 1.4 TSI Flex 16V 5p Aut.",
    ]);
  });
});

describe("buildModelEntries — sitemap por modelo comercial", () => {
  const sitemapRows = ONIX_ROWS.map((row) => ({
    city_slug: "atibaia-sp",
    state: "SP",
    ...row,
  }));

  it("as quatro versões FIPE produzem UMA entrada de sitemap", () => {
    const entries = buildModelEntries(sitemapRows, getSeoThreshold(SEO_SURFACE.MODEL));
    expect(entries.length).toBe(1);
    expect(entries[0].loc).toBe("/cidade/atibaia-sp/marca/chevrolet/modelo/onix");
    // lastmod = o mais recente das quatro.
    expect(entries[0].lastmod).toBe("2026-08-06T10:00:00.000Z");
  });

  it("REGRESSÃO: agrupar pela descrição FIPE crua daria sitemap vazio", () => {
    // Este é o bug que a fase corrige. Cada linha isolada tem 1-2 anúncios;
    // com o limiar de 3, nenhuma entraria. A dedup por `loc` só resolve
    // quando as quatro produzem o MESMO loc — que é o que o modelo comercial
    // garante.
    const threshold = getSeoThreshold(SEO_SURFACE.MODEL);
    for (const row of sitemapRows) expect(row.total).toBeLessThan(threshold);
    expect(buildModelEntries(sitemapRows, threshold).length).toBe(1);
  });

  it("nenhuma entrada de sitemap usa a descrição FIPE como slug", () => {
    const entries = buildModelEntries(sitemapRows, 1);
    for (const entry of entries) {
      expect(entry.loc).not.toMatch(/12v|flex|mec|hatch|sedan/i);
    }
  });

  it("descarta linha cujo modelo comercial não é derivável", () => {
    const entries = buildModelEntries(
      [{ city_slug: "atibaia-sp", state: "SP", brand: "Fiat", model: "1.0 Flex 8V", total: 10 }],
      1
    );
    expect(entries).toEqual([]);
  });

  it("mantém o slug da cidade recebida (sem hardcode territorial)", () => {
    const entries = buildModelEntries(
      sitemapRows.map((r) => ({ ...r, city_slug: "braganca-paulista-sp" })),
      1
    );
    expect(entries[0].loc).toBe("/cidade/braganca-paulista-sp/marca/chevrolet/modelo/onix");
  });
});
