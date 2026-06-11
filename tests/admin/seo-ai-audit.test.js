import { describe, it, expect } from "vitest";
import {
  analyzeAds,
  analyzeBlogPosts,
  summarizeProblems,
} from "../../src/modules/admin/seo/seo-ai-audit.js";

function ad(overrides = {}) {
  return {
    id: 1,
    slug: "onix-2024",
    title: "Chevrolet Onix 2024",
    brand: "Chevrolet",
    model: "Onix",
    year: 2024,
    price: 80000,
    city: "Atibaia",
    state: "SP",
    images: ["a", "b", "c"],
    description: "x".repeat(150),
    status: "active",
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("seo-ai-audit · analyzeAds", () => {
  it("anúncio sem preço/cidade/imagem gera problemas de alta severidade", () => {
    const r = analyzeAds([ad({ price: 0, city: null, city_name: null, images: [] })]);
    const kinds = r.problems.map((p) => p.kind);
    expect(kinds).toContain("ad_without_price");
    expect(kinds).toContain("ad_without_city");
    expect(kinds).toContain("ad_without_image");
  });

  it("anúncio completo não gera problemas altos e conta como ready", () => {
    const r = analyzeAds([
      ad({
        description: "x".repeat(200),
        images: ["a", "b", "c", "d"],
        fipe_price: 90000,
        whatsapp: "11999",
        advertiser_name: "Loja",
        version: "1.0",
        mileage: 1000,
        fuel_type: "Flex",
        transmission: "Manual",
        color: "Preto",
      }),
    ]);
    expect(r.problems.filter((p) => p.severity === "high")).toHaveLength(0);
    expect(r.avg_score).toBeGreaterThanOrEqual(80);
    expect(r.ready_80_plus).toBe(1);
  });

  it("poucas fotos vira aviso de baixa severidade", () => {
    const r = analyzeAds([ad({ images: ["a"] })]);
    expect(r.problems.map((p) => p.kind)).toContain("ad_few_images");
  });
});

describe("seo-ai-audit · analyzeBlogPosts", () => {
  function post(overrides = {}) {
    return {
      id: 1,
      slug: "como-comprar",
      status: "published",
      content: "x".repeat(400),
      excerpt: "Resumo útil.",
      meta_description: "Meta description boa.",
      cover_image_url: "/images/blog/x.jpg",
      ...overrides,
    };
  }

  it("publicado sem meta description nem excerpt → problema", () => {
    const r = analyzeBlogPosts([post({ meta_description: null, excerpt: null })]);
    expect(r.problems.map((p) => p.kind)).toContain("post_without_meta_description");
  });

  it("publicado com conteúdo curto → problema", () => {
    const r = analyzeBlogPosts([post({ content: "curto" })]);
    expect(r.problems.map((p) => p.kind)).toContain("post_short_content");
  });

  it("draft não é cobrado por meta/conteúdo", () => {
    const r = analyzeBlogPosts([
      post({ status: "draft", meta_description: null, excerpt: null, content: "x" }),
    ]);
    expect(r.problems.map((p) => p.kind)).not.toContain("post_without_meta_description");
    expect(r.problems.map((p) => p.kind)).not.toContain("post_short_content");
  });

  it("slug duplicado → problema de alta severidade", () => {
    const r = analyzeBlogPosts([post({ id: 1 }), post({ id: 2 })]);
    const dup = r.problems.find((p) => p.kind === "post_duplicate_slug");
    expect(dup).toBeTruthy();
    expect(dup.severity).toBe("high");
  });

  it("slug inválido → problema", () => {
    const r = analyzeBlogPosts([post({ slug: "Slug Inválido!" })]);
    expect(r.problems.map((p) => p.kind)).toContain("post_invalid_slug");
  });

  it("post bom não gera problemas", () => {
    const r = analyzeBlogPosts([post()]);
    expect(r.problems).toHaveLength(0);
    expect(r.published).toBe(1);
  });
});

describe("seo-ai-audit · summarizeProblems", () => {
  it("agrega por severidade", () => {
    const s = summarizeProblems(
      [{ severity: "high" }, { severity: "low" }],
      [{ severity: "high" }, { severity: "medium" }]
    );
    expect(s).toEqual({ total: 4, high: 2, medium: 1, low: 1 });
  });
});
