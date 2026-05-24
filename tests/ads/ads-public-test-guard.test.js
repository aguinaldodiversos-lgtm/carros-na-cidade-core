import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  buildAdsSearchQuery,
  DIRTY_AD_FIELDS_SQL,
  DIRTY_ADVERTISER_FIELDS_SQL,
} from "../../src/modules/ads/filters/ads-filter.builder.js";

function normalize(sql) {
  return String(sql || "")
    .replace(/\s+/g, " ")
    .trim();
}

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const ORIGINAL_FILTER = process.env.PUBLIC_TEST_AD_FILTER;

afterEach(() => {
  process.env.NODE_ENV = ORIGINAL_NODE_ENV;
  if (ORIGINAL_FILTER === undefined) delete process.env.PUBLIC_TEST_AD_FILTER;
  else process.env.PUBLIC_TEST_AD_FILTER = ORIGINAL_FILTER;
});

describe("DIRTY_TEST_AD_GUARD — fix 2026-05-24 + extensão briefing P0 2026-05-25", () => {
  beforeEach(() => {
    process.env.NODE_ENV = "production";
    delete process.env.PUBLIC_TEST_AD_FILTER;
  });

  it("adiciona NOT (... ILIKE ...) ao WHERE em NODE_ENV=production", () => {
    const { dataQuery } = buildAdsSearchQuery({});
    const sql = normalize(dataQuery);

    expect(sql).toContain("ILIKE '%test%'");
    expect(sql).toContain("ILIKE '%teste%'");
    expect(sql).toContain("ILIKE '%seed%'");
    expect(sql).toContain("ILIKE '%deploy%'");
    expect(sql).toContain("ILIKE '%worker%'");
    expect(sql).toContain("ILIKE '%alerta%'");
    expect(sql).toContain("ILIKE '%fake%'");
    // Cobre slug:
    expect(sql).toContain("ILIKE 'test-%'");
    // Cobre brand (briefing P0 2026-05-25 — antes só title/model/slug):
    expect(sql).toContain("a.brand");
  });

  it("filtra advertiser fields via JOIN (adv.name, adv.company_name) — fix briefing P0 2026-05-25", () => {
    const { dataQuery } = buildAdsSearchQuery({});
    const sql = normalize(dataQuery);

    // Word-boundary com \m...\M evita FP em nomes compostos como
    // "Autotest Performance" ou "Atestado Veículos".
    expect(sql).toContain("adv.name");
    expect(sql).toContain("adv.company_name");
    expect(sql).toContain("\\mteste\\M");
    expect(sql).toContain("\\mfake\\M");
    expect(sql).toContain("\\mdummy\\M");
    expect(sql).toContain("\\mdeploy\\M");
  });

  it("REGRESSION GUARD: NÃO referencia colunas como a.seller_name (vitimou prod em 2026-05-24)", () => {
    const { dataQuery } = buildAdsSearchQuery({});
    const sql = normalize(dataQuery);
    // Patterns DEVEM usar `adv.name` (JOIN), nunca `a.seller_name`/
    // `a.dealer_name`/`a.dealership_name` (não existem em ads).
    expect(sql).not.toContain("a.seller_name");
    expect(sql).not.toContain("a.dealer_name");
    expect(sql).not.toContain("a.dealership_name");
  });

  it("countQuery DEVE ter LEFT JOIN advertisers — caso contrário SQL quebra (fix briefing P0 2026-05-25)", () => {
    const { countQuery } = buildAdsSearchQuery({});
    const sql = normalize(countQuery);
    expect(sql).toContain("LEFT JOIN advertisers adv");
    expect(sql).toContain("ON adv.id = a.advertiser_id");
  });

  it("DIRTY_AD_FIELDS_SQL é exportado e só toca a.* (safe sem JOIN advertisers)", () => {
    const sql = normalize(DIRTY_AD_FIELDS_SQL);
    expect(sql).toContain("a.title");
    expect(sql).toContain("a.model");
    expect(sql).toContain("a.slug");
    expect(sql).not.toContain("adv.");
    expect(sql).not.toContain("u.");
  });

  it("DIRTY_ADVERTISER_FIELDS_SQL é exportado e só toca adv.* (requer JOIN advertisers)", () => {
    const sql = normalize(DIRTY_ADVERTISER_FIELDS_SQL);
    expect(sql).toContain("adv.name");
    expect(sql).toContain("adv.company_name");
    expect(sql).not.toContain("a.title");
    expect(sql).not.toContain("a.model");
  });

  it("respeita PUBLIC_TEST_AD_FILTER=disabled para diagnóstico", () => {
    process.env.PUBLIC_TEST_AD_FILTER = "disabled";
    const { dataQuery } = buildAdsSearchQuery({});
    const sql = normalize(dataQuery);
    expect(sql).not.toContain("ILIKE '%test%'");
  });

  it("respeita PUBLIC_TEST_AD_FILTER=enabled mesmo fora de production", () => {
    process.env.NODE_ENV = "test";
    process.env.PUBLIC_TEST_AD_FILTER = "enabled";
    const { dataQuery } = buildAdsSearchQuery({});
    const sql = normalize(dataQuery);
    expect(sql).toContain("ILIKE '%test%'");
  });

  it("não aplica o guard em ambiente de teste por padrão", () => {
    process.env.NODE_ENV = "test";
    delete process.env.PUBLIC_TEST_AD_FILTER;
    const { dataQuery } = buildAdsSearchQuery({});
    const sql = normalize(dataQuery);
    expect(sql).not.toContain("ILIKE '%test%'");
  });
});
