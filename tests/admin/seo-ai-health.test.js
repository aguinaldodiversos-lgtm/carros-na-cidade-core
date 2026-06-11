import { describe, it, expect } from "vitest";
import {
  analyzeAds,
  analyzeBlogPosts,
  buildAiHealthSummary,
  countByKind,
} from "../../src/modules/admin/seo/seo-ai-audit.js";

describe("seo-ai-audit · countByKind", () => {
  it("agrega por kind", () => {
    expect(countByKind([{ kind: "a" }, { kind: "a" }, { kind: "b" }, { kind: null }])).toEqual({
      a: 2,
      b: 1,
    });
  });
});

describe("seo-ai-audit · analyzeAds.low_score", () => {
  it("conta anúncios com score < 50", () => {
    const r = analyzeAds([
      { id: 1, title: "x", status: "paused" }, // muito incompleto → score baixo
      {
        id: 2,
        title: "Chevrolet Onix 2024",
        brand: "Chevrolet",
        model: "Onix",
        version: "1.0",
        year: 2024,
        price: 80000,
        city: "Atibaia",
        state: "SP",
        mileage: 1000,
        fuel_type: "Flex",
        transmission: "Manual",
        color: "Preto",
        images: ["a", "b", "c"],
        description: "x".repeat(200),
        fipe_price: 90000,
        whatsapp: "11999",
        advertiser_name: "Loja",
        status: "active",
        updated_at: new Date().toISOString(),
      },
    ]);
    expect(r.low_score).toBe(1);
    expect(r.ready_80_plus).toBe(1);
  });
});

describe("seo-ai-audit · buildAiHealthSummary (§15)", () => {
  it("monta o relatório com ads, blog e territorial", () => {
    const adsAnalysis = analyzeAds([
      { id: 1, status: "active", title: "x", price: 0, city: null, images: [] },
    ]);
    const blogAnalysis = analyzeBlogPosts([
      {
        id: 1,
        slug: "p",
        status: "published",
        content: "curto",
        meta_description: null,
        excerpt: null,
      },
    ]);
    const publicationRows = [
      { cluster_type: "city_home", is_indexable: true },
      { cluster_type: "city_home", is_indexable: false },
      { cluster_type: "city_below_fipe", is_indexable: true },
    ];

    const summary = buildAiHealthSummary({ adsAnalysis, blogAnalysis, publicationRows });

    expect(summary.ads.without_price).toBe(1);
    expect(summary.ads.without_city).toBe(1);
    expect(summary.ads.without_image).toBe(1);
    expect(summary.blog.without_meta_description).toBe(1);
    expect(summary.blog.short_content).toBe(1);
    expect(summary.territorial.city_home).toEqual({ indexable: 1, noindex: 1 });
    expect(summary.territorial.city_below_fipe).toEqual({ indexable: 1, noindex: 0 });
  });

  it("entradas vazias não quebram", () => {
    const summary = buildAiHealthSummary({});
    expect(summary.ads.total).toBe(0);
    expect(summary.territorial).toEqual({});
  });
});
