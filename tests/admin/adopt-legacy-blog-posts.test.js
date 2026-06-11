import { describe, it, expect } from "vitest";
import {
  LEGACY_BLOG_POSTS,
  buildAdoptionPlan,
  validateLegacyDataset,
  VALID_CATEGORIES,
  ADOPTION_TAG,
} from "../../src/modules/admin/blog/legacy-blog-seed.js";

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

describe("legacy-blog-seed · integridade do dataset", () => {
  it("não tem problemas estruturais", () => {
    expect(validateLegacyDataset()).toEqual([]);
  });

  it("cobre as 13 matérias legadas", () => {
    expect(LEGACY_BLOG_POSTS).toHaveLength(13);
  });

  it("slugs são canônicos e únicos", () => {
    const slugs = LEGACY_BLOG_POSTS.map((p) => p.slug);
    for (const slug of slugs) expect(slug).toMatch(SLUG_RE);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("categorias estão entre as 6 válidas do CMS", () => {
    for (const p of LEGACY_BLOG_POSTS) {
      expect(VALID_CATEGORIES.has(p.category)).toBe(true);
    }
  });

  it("excerpt ≤ 240 e content ≥ 300 caracteres", () => {
    for (const p of LEGACY_BLOG_POSTS) {
      expect(p.excerpt.length).toBeLessThanOrEqual(240);
      expect(p.content.trim().length).toBeGreaterThanOrEqual(300);
    }
  });

  it("conteúdo tem CTA suave para /comprar", () => {
    for (const p of LEGACY_BLOG_POSTS) {
      expect(p.content).toContain("(/comprar)");
    }
  });

  it("não usa esquemas perigosos em links do conteúdo", () => {
    for (const p of LEGACY_BLOG_POSTS) {
      expect(p.content).not.toMatch(/\]\(\s*(javascript|data|file|vbscript):/i);
    }
  });

  it("imagens de capa apontam para /images/blog", () => {
    for (const p of LEGACY_BLOG_POSTS) {
      expect(p.coverImage.startsWith("/images/blog/")).toBe(true);
    }
  });

  it("expõe o marcador de adoção", () => {
    expect(ADOPTION_TAG).toBe("adotado-4.2.1");
  });
});

describe("legacy-blog-seed · buildAdoptionPlan", () => {
  it("banco vazio → todos 'insert'", () => {
    const { plan, counts } = buildAdoptionPlan(LEGACY_BLOG_POSTS, new Map());
    expect(counts.insert).toBe(LEGACY_BLOG_POSTS.length);
    expect(counts.update).toBe(0);
    expect(counts["skip-exists"]).toBe(0);
    expect(plan.every((p) => p.action === "insert")).toBe(true);
  });

  it("idempotência: tudo já CMS → todos 'skip-exists' (sem --force)", () => {
    const existing = new Map(
      LEGACY_BLOG_POSTS.map((p, i) => [
        p.slug,
        { id: i + 1, slug: p.slug, source: "cms", version: 1, status: "published" },
      ])
    );
    const { counts } = buildAdoptionPlan(LEGACY_BLOG_POSTS, existing);
    expect(counts["skip-exists"]).toBe(LEGACY_BLOG_POSTS.length);
    expect(counts.insert).toBe(0);
    expect(counts.update).toBe(0);
  });

  it("--force re-adota posts CMS → 'update' com o id existente", () => {
    const existing = new Map(
      LEGACY_BLOG_POSTS.map((p, i) => [
        p.slug,
        { id: i + 10, slug: p.slug, source: "cms", version: 3, status: "published" },
      ])
    );
    const { plan, counts } = buildAdoptionPlan(LEGACY_BLOG_POSTS, existing, { force: true });
    expect(counts.update).toBe(LEGACY_BLOG_POSTS.length);
    expect(plan[0].existingId).toBe(10);
  });

  it("slug pertencente ao motor SEO → 'skip-conflict' (não sobrescreve)", () => {
    const target = LEGACY_BLOG_POSTS[0];
    const existing = new Map([
      [target.slug, { id: 99, slug: target.slug, source: "seo", version: 1, status: "published" }],
    ]);
    const { plan, counts } = buildAdoptionPlan(LEGACY_BLOG_POSTS, existing);
    expect(counts["skip-conflict"]).toBe(1);
    expect(counts.insert).toBe(LEGACY_BLOG_POSTS.length - 1);
    expect(plan.find((p) => p.slug === target.slug)?.action).toBe("skip-conflict");
  });

  it("cenário misto: novo + CMS existente + conflito SEO", () => {
    const existing = new Map([
      [
        LEGACY_BLOG_POSTS[1].slug,
        { id: 2, slug: LEGACY_BLOG_POSTS[1].slug, source: "cms", version: 1, status: "draft" },
      ],
      [
        LEGACY_BLOG_POSTS[2].slug,
        { id: 3, slug: LEGACY_BLOG_POSTS[2].slug, source: "seo", version: 1, status: "published" },
      ],
    ]);
    const { counts } = buildAdoptionPlan(LEGACY_BLOG_POSTS, existing);
    expect(counts.insert).toBe(LEGACY_BLOG_POSTS.length - 2);
    expect(counts["skip-exists"]).toBe(1);
    expect(counts["skip-conflict"]).toBe(1);
  });

  it("aceita existingBySlug como objeto simples (além de Map)", () => {
    const obj = {
      [LEGACY_BLOG_POSTS[0].slug]: {
        id: 1,
        slug: LEGACY_BLOG_POSTS[0].slug,
        source: "cms",
        version: 1,
      },
    };
    const { counts } = buildAdoptionPlan(LEGACY_BLOG_POSTS, obj);
    expect(counts["skip-exists"]).toBe(1);
  });
});
