import { describe, it, expect } from "vitest";
import { buildBlogSitemapEntries } from "./blog-sitemap";
import type { CmsBlogPost } from "@/lib/blog/blog-cms";

function post(overrides: Partial<CmsBlogPost> = {}): CmsBlogPost {
  return {
    id: 1,
    title: "Post",
    slug: "como-comprar-carro-usado",
    excerpt: null,
    content: null,
    cover_image_url: null,
    cover_image_alt: null,
    category: null,
    tags: [],
    published_at: "2026-06-01T10:00:00.000Z",
    updated_at: "2026-06-10T12:00:00.000Z",
    meta_title: null,
    meta_description: null,
    canonical_url: null,
    og_image_url: null,
    is_indexable: true,
    reading_time_minutes: 4,
    ...overrides,
  };
}

describe("buildBlogSitemapEntries", () => {
  it("mapeia post publicado para /blog/<slug> com lastmod=updated_at", () => {
    const [e] = buildBlogSitemapEntries([post()]);
    expect(e.loc).toBe("/blog/como-comprar-carro-usado");
    expect(e.lastmod).toBe("2026-06-10T12:00:00.000Z");
    expect(e.changefreq).toBe("weekly");
    expect(e.priority).toBe(0.6);
  });

  it("cai para published_at quando updated_at ausente", () => {
    const [e] = buildBlogSitemapEntries([post({ updated_at: null })]);
    expect(e.lastmod).toBe("2026-06-01T10:00:00.000Z");
  });

  it("exclui posts não-indexáveis (publicado mas noindex)", () => {
    const out = buildBlogSitemapEntries([post({ is_indexable: false })]);
    expect(out).toHaveLength(0);
  });

  it("exclui slug inválido", () => {
    const out = buildBlogSitemapEntries([post({ slug: "Slug Inválido" })]);
    expect(out).toHaveLength(0);
  });

  it("entrada vazia/não-array → []", () => {
    expect(buildBlogSitemapEntries([])).toEqual([]);
    // @ts-expect-error teste defensivo
    expect(buildBlogSitemapEntries(null)).toEqual([]);
  });
});
