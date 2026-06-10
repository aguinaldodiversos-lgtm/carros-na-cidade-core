import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/env/backend-api", () => ({
  getBackendApiBaseUrl: vi.fn(() => "https://api.test"),
  getInternalBackendApiBaseUrl: vi.fn(() => ""),
}));

const ssrResilientFetch = vi.fn();
vi.mock("@/lib/net/ssr-resilient-fetch", () => ({
  ssrResilientFetch: (...args: unknown[]) => ssrResilientFetch(...args),
}));

import {
  buildCmsPostMetadata,
  cmsPostToBlogPost,
  fetchPublishedBlogPost,
  fetchPublishedBlogPosts,
  type CmsBlogPost,
} from "./blog-cms";

function cmsPost(overrides: Partial<CmsBlogPost> = {}): CmsBlogPost {
  return {
    id: 42,
    title: "Como comprar um carro usado com segurança",
    slug: "como-comprar-carro-usado-com-seguranca",
    excerpt: "Veja cuidados essenciais antes de negociar um veículo usado.",
    content: "Conteúdo do post…",
    cover_image_url: "https://cdn.test/capa.webp",
    cover_image_alt: "Pessoa inspecionando carro usado",
    category: "compra",
    tags: ["usados"],
    published_at: "2026-06-10T12:00:00.000Z",
    updated_at: "2026-06-10T13:00:00.000Z",
    meta_title: null,
    meta_description: null,
    canonical_url: null,
    og_image_url: null,
    is_indexable: true,
    reading_time_minutes: 4,
    ...overrides,
  };
}

beforeEach(() => {
  ssrResilientFetch.mockReset();
});

describe("blog-cms · cmsPostToBlogPost", () => {
  it("mapeia para o shape dos cards legados", () => {
    const card = cmsPostToBlogPost(cmsPost(), "São Paulo - SP");
    expect(card).toMatchObject({
      id: "cms-42",
      slug: "como-comprar-carro-usado-com-seguranca",
      title: "Como comprar um carro usado com segurança",
      coverImage: "https://cdn.test/capa.webp",
      publishedAt: "2026-06-10",
      readTime: "4 min de leitura",
      category: "Compra",
      categoryId: "compra",
      cityLabel: "São Paulo - SP",
    });
  });

  it("usa placeholder quando não há capa", () => {
    const card = cmsPostToBlogPost(cmsPost({ cover_image_url: null }), "X");
    expect(card.coverImage).toBe("/images/vehicle-placeholder.svg");
  });
});

describe("blog-cms · buildCmsPostMetadata", () => {
  it("fallback de meta title/description a partir de title/excerpt + canonical global", () => {
    const meta = buildCmsPostMetadata(cmsPost(), "/blog/como-comprar-carro-usado-com-seguranca");
    expect(meta.title).toContain("Como comprar um carro usado com segurança");
    expect(meta.description).toBe("Veja cuidados essenciais antes de negociar um veículo usado.");
    expect(meta.alternates?.canonical).toBe("/blog/como-comprar-carro-usado-com-seguranca");
    expect(meta.robots).toMatchObject({ index: true, follow: true });
  });

  it("meta_title/meta_description do banco têm prioridade", () => {
    const meta = buildCmsPostMetadata(
      cmsPost({ meta_title: "Título SEO custom", meta_description: "Descrição SEO custom" }),
      "/blog/x"
    );
    expect(meta.title).toBe("Título SEO custom | Blog Carros na Cidade");
    expect(meta.description).toBe("Descrição SEO custom");
  });

  it("is_indexable=false → noindex/follow", () => {
    const meta = buildCmsPostMetadata(cmsPost({ is_indexable: false }), "/blog/x");
    expect(meta.robots).toMatchObject({ index: false, follow: true });
  });

  it("canonical_url do banco vence o path padrão", () => {
    const meta = buildCmsPostMetadata(
      cmsPost({ canonical_url: "https://www.carrosnacidade.com/blog/original" }),
      "/blog/copia"
    );
    expect(meta.alternates?.canonical).toBe("https://www.carrosnacidade.com/blog/original");
  });
});

describe("blog-cms · fetchPublishedBlogPost", () => {
  it("slug com formato inválido não chama a API (não é post)", async () => {
    const out = await fetchPublishedBlogPost("São Paulo");
    expect(out).toBe(null);
    expect(ssrResilientFetch).not.toHaveBeenCalled();
  });

  it("404 do backend → null (post não publicado é invisível)", async () => {
    ssrResilientFetch.mockResolvedValue({ ok: false, status: 404 });
    const out = await fetchPublishedBlogPost("rascunho-secreto");
    expect(out).toBe(null);
  });

  it("post publicado retorna o DTO", async () => {
    ssrResilientFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: cmsPost() }),
    });
    const out = await fetchPublishedBlogPost("como-comprar-carro-usado-com-seguranca");
    expect(out?.id).toBe(42);
    const url = String(ssrResilientFetch.mock.calls[0][0]);
    expect(url).toBe(
      "https://api.test/api/public/blog/posts/como-comprar-carro-usado-com-seguranca"
    );
  });
});

describe("blog-cms · fetchPublishedBlogPosts", () => {
  it("lista posts com filtros na query", async () => {
    ssrResilientFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: [cmsPost()], total: 1 }),
    });
    const out = await fetchPublishedBlogPosts({ category: "compra", limit: 6 });
    expect(out.total).toBe(1);
    expect(out.posts).toHaveLength(1);
    const url = String(ssrResilientFetch.mock.calls[0][0]);
    expect(url).toContain("/api/public/blog/posts?");
    expect(url).toContain("limit=6");
    expect(url).toContain("category=compra");
  });

  it("falha de rede degrada para lista vazia", async () => {
    ssrResilientFetch.mockRejectedValue(new Error("offline"));
    const out = await fetchPublishedBlogPosts();
    expect(out).toEqual({ posts: [], total: 0 });
  });
});
