// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  }),
}));

// next/image em ambiente de teste — renderiza um <img> simples para
// evitar todo o pipeline do next que requer config de Next runtime.
// Filtramos props específicos do next/image que React não conhece
// (priority, unoptimized, fill) para evitar warnings em jsdom.
vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    const {
      alt,
      src,
      // Props que NÃO devem ir para o DOM:
      priority: _priority,
      unoptimized: _unoptimized,
      fill: _fill,
      ...rest
    } = props;
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img alt={String(alt ?? "")} src={String(src ?? "")} {...rest} />;
  },
}));

import { HomeHero } from "./HomeHero";

afterEach(() => {
  cleanup();
});

describe("HomeHero — regra dual de render (Fase 4.1.2)", () => {
  it("modo arte pronta: imagem dentro de <a>, SEM H1 sobreposto e SEM gradient/overlay", () => {
    render(
      <HomeHero
        stateName="São Paulo"
        banners={[
          {
            position: 1,
            title: "Texto que NÃO deve aparecer",
            subtitle: "Subtítulo que NÃO deve aparecer",
            cta_label: "CTA que NÃO deve aparecer",
            cta_url: "/anunciar",
            image_desktop_url: "https://cdn.example.com/banner.webp",
            image_mobile_url: null,
            image_alt: "Banner de anunciar veículo grátis",
          },
        ]}
      />
    );

    // O slide foi renderizado como Link (anchor) para /anunciar.
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/anunciar");

    // Imagem renderizada com o alt definido pelo admin.
    const img = screen.getByAltText("Banner de anunciar veículo grátis");
    expect(img).toBeTruthy();

    // CRITÉRIO PRINCIPAL: nenhum H1 e nenhum dos textos opcionais devem
    // aparecer visualmente.
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    expect(screen.queryByText(/Texto que NÃO deve aparecer/i)).toBeNull();
    expect(screen.queryByText(/Subtítulo que NÃO deve aparecer/i)).toBeNull();
    expect(screen.queryByText(/CTA que NÃO deve aparecer/i)).toBeNull();
  });

  it("modo fallback textual: sem imagem, renderiza H1 e CTA pílula", () => {
    render(
      <HomeHero
        stateName="São Paulo"
        banners={[
          {
            position: 1,
            title: "Compre carros usados",
            subtitle: "Ofertas verificadas",
            cta_label: "Ver ofertas",
            cta_url: "/comprar",
            image_desktop_url: null,
            image_mobile_url: null,
            image_alt: null,
          },
        ]}
      />
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Compre carros usados");
    expect(screen.getByText("Ver ofertas")).toBeTruthy();
  });

  it("sem banners do admin: cai no fallback hardcoded com microcopy regional", () => {
    render(<HomeHero stateName="São Paulo" />);
    // Conteúdo do fallback hardcoded.
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.textContent).toMatch(/Carros usados/i);
  });

  it("carrossel 2 banners ambos com imagem: dois links, nenhum H1", () => {
    render(
      <HomeHero
        stateName="São Paulo"
        banners={[
          {
            position: 1,
            title: null,
            subtitle: null,
            cta_label: null,
            cta_url: "/comprar",
            image_desktop_url: "https://cdn.example.com/b1.webp",
            image_mobile_url: null,
            image_alt: "Comprar",
          },
          {
            position: 2,
            title: null,
            subtitle: null,
            cta_label: null,
            cta_url: "/anunciar",
            image_desktop_url: "https://cdn.example.com/b2.webp",
            image_mobile_url: null,
            image_alt: "Anunciar grátis",
          },
        ]}
      />
    );
    const links = screen.getAllByRole("link");
    // Os 2 slides são <Link>. Os 2 botões de dot também são role=button,
    // então buscamos apenas pelos hrefs dos slides.
    const slideLinks = links.filter((el) => {
      const href = el.getAttribute("href") || "";
      return href === "/comprar" || href === "/anunciar";
    });
    expect(slideLinks).toHaveLength(2);
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
  });

  it("href externo recebe target=_blank + rel=noopener", () => {
    render(
      <HomeHero
        stateName="São Paulo"
        banners={[
          {
            position: 1,
            title: null,
            subtitle: null,
            cta_label: null,
            cta_url: "https://parceiro.example.com/promo",
            image_desktop_url: "https://cdn.example.com/banner.webp",
            image_mobile_url: null,
            image_alt: "Promo parceiro",
          },
        ]}
      />
    );
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel")).toMatch(/noopener/);
  });

  it("usa image_mobile_url quando configurada (renderiza dois Image)", () => {
    render(
      <HomeHero
        stateName="São Paulo"
        banners={[
          {
            position: 1,
            title: null,
            subtitle: null,
            cta_label: null,
            cta_url: "/comprar",
            image_desktop_url: "https://cdn.example.com/desktop.webp",
            image_mobile_url: "https://cdn.example.com/mobile.webp",
            image_alt: "Banner responsivo",
          },
        ]}
      />
    );
    // Duas <img> com mesmo alt: uma desktop, uma mobile.
    const imgs = screen.getAllByAltText("Banner responsivo");
    expect(imgs.length).toBe(2);
    const srcs = imgs.map((i) => i.getAttribute("src"));
    expect(srcs).toContain("https://cdn.example.com/desktop.webp");
    expect(srcs).toContain("https://cdn.example.com/mobile.webp");
  });
});
