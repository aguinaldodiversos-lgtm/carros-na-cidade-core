import { describe, expect, it } from "vitest";

import { buildHomeContentCards, HOME_CONTENT_CARD_LIMIT } from "@/lib/home/home-content-cards";
import type { CmsBlogPost } from "@/lib/blog/blog-cms";

/**
 * Cards de conteúdo da Home — SEO Fase 4.1A, achado P1-4.
 *
 * A seção trazia seis `href` hardcoded (`/blog/compra-usado`,
 * `/blog/tabela-fipe`, `/blog/financiamento`, `/blog/checklist`,
 * `/blog/vender-rapido`, `/blog/carro-cidade`). Medido em produção em
 * 2026-08-31: os SEIS respondem 404, e nenhum deles existe entre os 13 posts
 * publicados em `blog_posts`.
 */

const DEAD_SLUGS = [
  "compra-usado",
  "tabela-fipe",
  "financiamento",
  "checklist",
  "vender-rapido",
  "carro-cidade",
];

function post(overrides: Partial<CmsBlogPost>): CmsBlogPost {
  return {
    id: 1,
    title: "Título",
    slug: "post-a",
    excerpt: null,
    content: null,
    cover_image_url: null,
    cover_image_alt: null,
    category: null,
    tags: [],
    published_at: "2026-08-01T00:00:00.000Z",
    updated_at: null,
    meta_title: null,
    meta_description: null,
    canonical_url: null,
    og_image_url: null,
    is_indexable: true,
    reading_time_minutes: null,
    ...overrides,
  };
}

describe("cards de conteúdo da Home", () => {
  it("usa os posts publicados, na ordem recebida do backend", () => {
    const cards = buildHomeContentCards([
      post({ id: 1, slug: "post-a", title: "A" }),
      post({ id: 2, slug: "post-b", title: "B" }),
      post({ id: 3, slug: "post-c", title: "C" }),
    ]);

    expect(cards.map((c) => c.href)).toEqual(["/blog/post-a", "/blog/post-b", "/blog/post-c"]);
    expect(cards.map((c) => c.title)).toEqual(["A", "B", "C"]);
  });

  it("aponta para a CANÔNICA global do post, sem segmento de cidade", () => {
    const [card] = buildHomeContentCards([post({ slug: "ipva-2025-entenda-tudo" })]);

    expect(card.href).toBe("/blog/ipva-2025-entenda-tudo");
    // A Home não tem cidade garantida — supor uma foi o achado P1-2.
    expect(card.href).not.toMatch(/\/blog\/[a-z-]+-[a-z]{2}\//);
  });

  it("NUNCA emite os seis slugs mortos", () => {
    const cards = buildHomeContentCards([
      post({ id: 1, slug: "post-real-a" }),
      post({ id: 2, slug: "post-real-b" }),
    ]);
    const hrefs = cards.map((c) => c.href).join(" ");

    for (const dead of DEAD_SLUGS) {
      expect(hrefs).not.toContain(`/blog/${dead}`);
    }
  });

  it("zero posts → zero cards (a seção some, não cai no hardcoded)", () => {
    expect(buildHomeContentCards([])).toEqual([]);
    expect(buildHomeContentCards(null)).toEqual([]);
    expect(buildHomeContentCards(undefined)).toEqual([]);
  });

  it("menos posts que o limite → menos cards", () => {
    expect(buildHomeContentCards([post({ slug: "unico" })])).toHaveLength(1);
  });

  it("respeita o limite da grade", () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      post({ id: i + 1, slug: `post-${i + 1}`, title: `T${i + 1}` })
    );
    expect(buildHomeContentCards(many)).toHaveLength(HOME_CONTENT_CARD_LIMIT);
  });

  it("descarta post com slug inválido — card sem destino navegável não entra", () => {
    const cards = buildHomeContentCards([
      post({ id: 1, slug: "Slug Com Espaço" }),
      post({ id: 2, slug: "/barra" }),
      post({ id: 3, slug: "" }),
      post({ id: 4, slug: "valido-mesmo" }),
    ]);

    expect(cards.map((c) => c.href)).toEqual(["/blog/valido-mesmo"]);
  });

  it("descarta post sem título", () => {
    const cards = buildHomeContentCards([
      post({ id: 1, slug: "sem-titulo", title: "   " }),
      post({ id: 2, slug: "com-titulo", title: "Ok" }),
    ]);

    expect(cards.map((c) => c.href)).toEqual(["/blog/com-titulo"]);
  });

  it("preserva a categoria para o ícone", () => {
    const [card] = buildHomeContentCards([post({ slug: "x", category: "financiamento" })]);
    expect(card.categoryId).toBe("financiamento");
  });
});
