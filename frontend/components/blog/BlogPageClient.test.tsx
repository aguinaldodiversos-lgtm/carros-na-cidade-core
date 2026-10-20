// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { BlogCategory, BlogPageContent } from "@/lib/blog/blog-page";
import { BlogPageClient } from "./BlogPageClient";

const ids = [
  ["compra", "Compra"],
  ["venda", "Venda"],
  ["manutencao", "Manutenção"],
  ["mercado", "Mercado"],
  ["financiamento", "Financiamento"],
  ["cidades", "Cidades"],
] as const;

const categories: BlogCategory[] = ids.map(([id, label]) => ({
  id,
  label,
  href: `/blog/atibaia-sp/categoria/${id}`,
}));

function makeContent(): BlogPageContent {
  return {
    citySlug: "atibaia-sp",
    cityName: "Atibaia",
    cityState: "SP",
    cityLabel: "Atibaia - SP",
    heroBanner: {
      title: "Blog automotivo",
      subtitle: "Dicas sobre veículos",
      image: "/images/imagem_banner_blog.png",
    },
    bottomBanner: {
      title: "Encontre seu carro",
      subtitle: "Confira veículos",
      image: "/images/imagem_banner_blog.png",
      ctaHref: "/comprar",
    },
    categories,
    featuredPosts: [],
    trendingPosts: [],
    popularPosts: [],
  };
}

afterEach(() => cleanup());

describe("BlogPageClient — atalhos com padrão visual da Home", () => {
  it("mantém as seis categorias e seus destinos originais", () => {
    render(<BlogPageClient content={makeContent()} />);

    const nav = screen.getByRole("navigation", { name: "Categorias do blog" });
    const links = within(nav).getAllByRole("link");

    expect(links).toHaveLength(6);
    expect(links.map((link) => link.textContent?.trim())).toEqual(ids.map(([, label]) => label));
    expect(links.map((link) => link.getAttribute("href"))).toEqual(
      categories.map((category) => category.href)
    );
  });

  it("usa círculos azuis, ícones brancos e tamanhos responsivos da Home", () => {
    render(<BlogPageClient content={makeContent()} />);

    const nav = screen.getByRole("navigation", { name: "Categorias do blog" });
    for (const link of within(nav).getAllByRole("link")) {
      const circle = link.querySelector("span.rounded-full");
      expect(circle).not.toBeNull();
      expect(circle).toHaveClass(
        "bg-blue-600",
        "text-white",
        "h-14",
        "w-14",
        "sm:h-16",
        "sm:w-16",
        "hover:bg-blue-700",
        "active:scale-95"
      );

      const glyph = circle?.querySelector("svg");
      expect(glyph).not.toBeNull();
      expect(glyph).toHaveClass("h-6", "w-6", "sm:h-7", "sm:w-7");
    }
    expect(nav).toHaveClass("overflow-x-auto", "md:grid-cols-6");
  });

  it("preserva as cores dos badges nos artigos", () => {
    const content = makeContent();
    content.featuredPosts = [
      {
        id: "post-manutencao",
        slug: "troca-de-pneus",
        title: "Quando trocar os pneus",
        excerpt: "Dicas de manutenção",
        coverImage: "/images/blog/manutencao-pneus.jpg",
        publishedAt: "2026-10-20",
        readTime: "4 min",
        category: "Manutenção",
        categoryId: "manutencao",
        cityLabel: "Atibaia - SP",
      },
    ];
    render(<BlogPageClient content={content} />);

    const article = screen.getByRole("article");
    expect(within(article).getByText("Manutenção")).toHaveClass("bg-[#F59A1A]", "text-white");
  });
});
