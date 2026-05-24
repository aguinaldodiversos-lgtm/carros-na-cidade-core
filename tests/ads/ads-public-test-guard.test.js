import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildAdsSearchQuery } from "../../src/modules/ads/filters/ads-filter.builder.js";

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

describe("DIRTY_TEST_AD_GUARD — fix 2026-05-24", () => {
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
