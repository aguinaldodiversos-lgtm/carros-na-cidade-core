import { describe, expect, it } from "vitest";

import { applyCmsPostsToHubContent } from "@/lib/blog/blog-hub";
import type { BlogPageContent, BlogPost } from "@/lib/blog/blog-page";

function makeContent(): BlogPageContent {
  return {
    citySlug: "sao-paulo-sp",
    cityName: "São Paulo",
    cityState: "SP",
    cityLabel: "São Paulo - SP",
    heroBanner: { title: "hero", subtitle: "sub", image: "/img.png" },
    bottomBanner: { title: "bottom", subtitle: "sub", image: "/img.png" },
    categories: [],
    featuredPosts: [
      {
        id: "fallback-1",
        slug: "fallback-slug",
        title: "FALLBACK Card",
        excerpt: "x",
        coverImage: "/f.png",
        publishedAt: "2026-01-01",
        readTime: "1 min",
        category: "Compra",
        categoryId: "compra",
        cityLabel: "São Paulo - SP",
      },
    ],
    trendingPosts: [{ id: "t1", title: "FALLBACK trend", image: "/t.png", href: "/x" }],
    popularPosts: [],
  };
}

function makeCmsCards(n: number): BlogPost[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `cms-${i + 1}`,
    slug: `cms-post-${i + 1}`,
    title: `CMS Post ${i + 1}`,
    excerpt: `Resumo ${i + 1}`,
    coverImage: `/cms-${i + 1}.png`,
    publishedAt: "2026-06-15",
    readTime: "5 min de leitura",
    category: "Compra",
    categoryId: "compra" as const,
    cityLabel: "São Paulo - SP",
  }));
}

describe("applyCmsPostsToHubContent", () => {
  it("mantém o fallback intacto quando não há posts do CMS", () => {
    const content = makeContent();
    const result = applyCmsPostsToHubContent(content, [], "sao-paulo-sp");

    expect(result).toEqual(content);
    expect(result.featuredPosts[0].title).toBe("FALLBACK Card");
    expect(result.trendingPosts[0].title).toBe("FALLBACK trend");
  });

  it("substitui o fallback por posts do CMS quando existem (sem duplicar)", () => {
    const content = makeContent();
    const result = applyCmsPostsToHubContent(content, makeCmsCards(13), "sao-paulo-sp");

    const titles = [...result.featuredPosts, ...result.popularPosts].map((p) => p.title);
    // Nenhum card de fallback sobra quando o CMS tem posts.
    expect(titles).not.toContain("FALLBACK Card");
    expect(titles.every((t) => t.startsWith("CMS Post"))).toBe(true);
  });

  it("renderiza TODOS os posts adotados (13), não apenas 9", () => {
    const content = makeContent();
    const result = applyCmsPostsToHubContent(content, makeCmsCards(13), "sao-paulo-sp");

    expect(result.featuredPosts).toHaveLength(6);
    expect(result.popularPosts).toHaveLength(7); // 13 - 6
    const allTitles = new Set(
      [...result.featuredPosts, ...result.popularPosts].map((p) => p.title)
    );
    for (let i = 1; i <= 13; i++) {
      expect(allTitles.has(`CMS Post ${i}`)).toBe(true);
    }
  });

  it("gera trending (máx. 4) com link para /blog/<cidade>/<slug>", () => {
    const content = makeContent();
    const result = applyCmsPostsToHubContent(content, makeCmsCards(13), "sao-paulo-sp");

    expect(result.trendingPosts).toHaveLength(4);
    expect(result.trendingPosts[0].href).toBe("/blog/sao-paulo-sp/cms-post-1");
    expect(result.trendingPosts[0].title).toBe("CMS Post 1");
  });

  it("não muta o objeto content original", () => {
    const content = makeContent();
    const snapshot = JSON.stringify(content);
    applyCmsPostsToHubContent(content, makeCmsCards(3), "sao-paulo-sp");
    expect(JSON.stringify(content)).toBe(snapshot);
  });
});
