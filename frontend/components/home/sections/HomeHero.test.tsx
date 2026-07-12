// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";

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

/**
 * matchMedia mock controlável. Cada teste pode setar
 * `reducedMotionMatches` true/false e o componente respeita.
 *
 * Em jsdom não há `window.matchMedia` por padrão — o mock é instalado
 * dentro de beforeEach para que cada teste fique isolado.
 */
let reducedMotionMatches = false;

beforeEach(() => {
  reducedMotionMatches = false;
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches:
        typeof query === "string" && query.includes("prefers-reduced-motion")
          ? reducedMotionMatches
          : false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
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

  it("modo fallback textual: sem imagem, renderiza título e CTA pílula", () => {
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
    // O título do fallback textual NÃO é mais <h1> (o H1 canônico da Home é o
    // sr-only em app/page.tsx, reestruturação 2026-07-11) — validamos o texto.
    expect(screen.getByText("Compre carros usados")).toBeTruthy();
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    expect(screen.getByText("Ver ofertas")).toBeTruthy();
  });

  it("sem banners do admin: cai no fallback hardcoded com microcopy regional", () => {
    render(<HomeHero stateName="São Paulo" />);
    // Conteúdo do fallback hardcoded — título (não-<h1>) com microcopy regional.
    expect(screen.getByText(/Carros usados/i)).toBeTruthy();
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
  });

  it("carrossel 2 banners ambos com imagem: dois links, nenhum H1", () => {
    const { container } = render(
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
    // Usamos querySelectorAll porque slides inativos têm aria-hidden=true,
    // que esconde o role=link da accessibility tree (e do getByRole). Os
    // 2 <a> existem no DOM mesmo assim.
    const links = Array.from(container.querySelectorAll("a[href]"));
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

describe("HomeHero — proporção e encaixe sem corte (Fase 4.1.3)", () => {
  const artBanner = {
    position: 1 as const,
    title: null,
    subtitle: null,
    cta_label: null,
    cta_url: "/anunciar",
    image_desktop_url: "https://cdn.example.com/banner.webp",
    image_mobile_url: null,
    image_alt: "Banner pronto",
  };

  it("Link do slide usa aspect-[2000/1400] mobile + md:aspect-[2120/640] desktop", () => {
    render(<HomeHero stateName="SP" banners={[artBanner]} />);
    const link = screen.getByRole("link");
    // Mobile: aspect-[2000/1400] (= 10/7), produz ~262px em 375px.
    expect(link.className).toMatch(/aspect-\[2000\/1400\]/);
    // Desktop: aspect-[2120/640] (= 53/16), produz ~386px em 1280px.
    expect(link.className).toMatch(/md:aspect-\[2120\/640\]/);
  });

  it("aspect-ratio mobile NÃO muda quando há image_mobile_url (evita banner gigante)", () => {
    render(
      <HomeHero
        stateName="SP"
        banners={[{ ...artBanner, image_mobile_url: "https://cdn.example.com/m.webp" }]}
      />
    );
    const link = screen.getByRole("link");
    // Mantém o mesmo aspect mobile mesmo com mobile_url — arte mobile é
    // renderizada com object-contain dentro do mesmo container.
    expect(link.className).toMatch(/aspect-\[2000\/1400\]/);
    expect(link.className).not.toMatch(/aspect-\[4\/5\]/);
    expect(link.className).toMatch(/md:aspect-\[2120\/640\]/);
  });

  it("imagem desktop usa object-contain mobile + md:object-cover desktop (Fase 4.1.5)", () => {
    // Sem image_mobile_url, o mesmo <img> serve mobile e desktop:
    //   - Mobile (default): object-contain → arte aparece inteira.
    //   - md+ (≥768): md:object-cover → preenche todo o container 2120/640.
    render(<HomeHero stateName="SP" banners={[artBanner]} />);
    const img = screen.getByAltText("Banner pronto");
    expect(img.className).toMatch(/object-contain/);
    expect(img.className).toMatch(/md:object-cover/);
    // object-center sempre presente para centralizar a arte.
    expect(img.className).toMatch(/object-center/);
  });

  it("quando há image_mobile_url, a Image MOBILE dedicada usa object-contain (sem cover)", () => {
    render(
      <HomeHero
        stateName="SP"
        banners={[{ ...artBanner, image_mobile_url: "https://cdn.example.com/m.webp" }]}
      />
    );
    const imgs = screen.getAllByAltText("Banner pronto");
    // 2 imagens: uma desktop (em hidden md:block) e uma mobile (em md:hidden).
    expect(imgs).toHaveLength(2);
    const mobileImg = imgs.find((i) => i.getAttribute("src")?.endsWith("/m.webp"))!;
    expect(mobileImg.className).toMatch(/object-contain/);
    // Mobile dedicada NÃO usa object-cover — mantém arte mobile inteira.
    expect(mobileImg.className).not.toMatch(/object-cover/);
  });

  it("Link do slide tem background neutro #f3f7ff (sem azul navy escuro)", () => {
    render(<HomeHero stateName="SP" banners={[artBanner]} />);
    const link = screen.getByRole("link");
    expect(link.className).toMatch(/bg-\[#f3f7ff\]/);
  });

  // CRÍTICO Fase 4.1.4: altura idêntica entre modos arte-pronta e
  // fallback textual evita "pulo de layout" ao trocar de slide quando
  // um banner tem imagem e o outro não.
  it("modos arte-pronta e fallback textual usam EXATAMENTE o mesmo aspect-ratio", () => {
    const { container: container1 } = render(<HomeHero stateName="SP" banners={[artBanner]} />);
    const arteLink = container1.querySelector("a[href]") as HTMLElement;
    cleanup();
    const { container: container2 } = render(
      <HomeHero
        stateName="SP"
        banners={[
          {
            position: 1,
            title: "Texto fallback",
            subtitle: null,
            cta_label: "Ver",
            cta_url: "/comprar",
            image_desktop_url: null,
            image_mobile_url: null,
            image_alt: null,
          },
        ]}
      />
    );
    const fallbackContainer = container2.querySelector('[aria-roledescription="slide"]')
      ?.firstElementChild as HTMLElement | null;
    // Tanto arte-pronta quanto fallback compartilham as MESMAS classes
    // críticas de aspect — extraímos só os tokens aspect-* / md:aspect-*.
    const aspectTokens = (el: HTMLElement) =>
      (el.className.match(/(?:md:)?aspect-\[[^\]]+\]/g) || []).sort();
    expect(aspectTokens(arteLink)).toEqual(aspectTokens(fallbackContainer!));
    // E ambos devem ter pelo menos o aspect mobile + desktop esperados.
    expect(aspectTokens(arteLink)).toEqual(
      expect.arrayContaining(["aspect-[2000/1400]", "md:aspect-[2120/640]"])
    );
  });

  it("carrossel misto (banner com imagem + banner sem) → ambos slides com mesma altura", () => {
    const banners = [
      {
        position: 1 as const,
        title: null,
        subtitle: null,
        cta_label: null,
        cta_url: "/comprar",
        image_desktop_url: "https://cdn.example.com/1.webp",
        image_mobile_url: null,
        image_alt: "Banner 1",
      },
      {
        position: 2 as const,
        title: "Anuncie",
        subtitle: null,
        cta_label: "Anunciar",
        cta_url: "/anunciar",
        image_desktop_url: null, // fallback textual
        image_mobile_url: null,
        image_alt: null,
      },
    ];
    const { container } = render(<HomeHero stateName="SP" banners={banners} />);
    const slideWrappers = container.querySelectorAll('[aria-roledescription="slide"]');
    expect(slideWrappers).toHaveLength(2);
    const aspectTokens = (el: Element) =>
      (el.firstElementChild?.className.match(/(?:md:)?aspect-\[[^\]]+\]/g) || []).sort();
    // Os elementos internos (Link ou div) de cada slide devem ter as
    // MESMAS classes de aspect.
    expect(aspectTokens(slideWrappers[0])).toEqual(aspectTokens(slideWrappers[1]));
  });
});

describe("HomeHero — sem overflow horizontal nativo (Fase 4.1.3)", () => {
  const twoBanners = [
    {
      position: 1 as const,
      title: null,
      subtitle: null,
      cta_label: null,
      cta_url: "/comprar",
      image_desktop_url: "https://cdn.example.com/1.webp",
      image_mobile_url: null,
      image_alt: "1",
    },
    {
      position: 2 as const,
      title: null,
      subtitle: null,
      cta_label: null,
      cta_url: "/anunciar",
      image_desktop_url: "https://cdn.example.com/2.webp",
      image_mobile_url: null,
      image_alt: "2",
    },
  ];

  it("track usa transform translateX (NUNCA overflow-x-auto/scroll)", () => {
    const { container } = render(<HomeHero stateName="SP" banners={twoBanners} />);
    const carouselRegion = container.querySelector('[role="region"]');
    expect(carouselRegion).not.toBeNull();
    // O track tem transition-transform e style="translateX(0%)".
    expect(carouselRegion!.className).toMatch(/transition-transform/);
    expect((carouselRegion as HTMLElement).style.transform).toBe("translateX(-0%)");
    // E ABSOLUTAMENTE NÃO pode ter overflow-x-auto (que seria o scroll nativo).
    expect(carouselRegion!.className).not.toMatch(/overflow-x-auto/);
    expect(carouselRegion!.className).not.toMatch(/snap-x/);
  });

  it("wrapper imediato tem overflow-hidden", () => {
    const { container } = render(<HomeHero stateName="SP" banners={twoBanners} />);
    const carouselRegion = container.querySelector('[role="region"]') as HTMLElement;
    const wrapper = carouselRegion.parentElement!;
    expect(wrapper.className).toMatch(/overflow-hidden/);
  });

  it("cada slide tem w-full + flex-shrink-0 (sem comprimir nem expandir)", () => {
    const { container } = render(<HomeHero stateName="SP" banners={twoBanners} />);
    const slides = container.querySelectorAll('[aria-roledescription="slide"]');
    expect(slides.length).toBe(2);
    slides.forEach((s) => {
      expect(s.className).toMatch(/w-full/);
      expect(s.className).toMatch(/flex-shrink-0/);
    });
  });

  it("imagens de banner usam object-contain (mobile) + md:object-cover apenas nas desktop (Fase 4.1.5)", () => {
    // Regra: cada <img> sempre tem object-contain como base. As imagens
    // que servem o slot desktop adicionalmente recebem md:object-cover
    // para preencher o container desktop (2120/640). Imagens mobile
    // dedicadas (md:hidden) NÃO recebem md:object-cover — mantêm contain.
    const { container } = render(<HomeHero stateName="SP" banners={twoBanners} />);
    const imgs = Array.from(container.querySelectorAll("img"));
    const bannerImgs = imgs.filter((i) =>
      (i.getAttribute("src") || "").startsWith("https://cdn")
    );
    expect(bannerImgs.length).toBeGreaterThan(0);
    bannerImgs.forEach((i) => {
      // Object-contain sempre presente (regra base).
      expect(i.className).toMatch(/object-contain/);
      // Cover SEM o prefixo `md:` é PROIBIDO — nunca corta arte no mobile.
      expect(i.className).not.toMatch(/(^|\s)object-cover/);
    });
  });
});

describe("HomeHero — autoplay (Fase 4.1.3)", () => {
  const twoBanners = [
    {
      position: 1 as const,
      title: null,
      subtitle: null,
      cta_label: null,
      cta_url: "/comprar",
      image_desktop_url: "https://cdn.example.com/1.webp",
      image_mobile_url: null,
      image_alt: "1",
    },
    {
      position: 2 as const,
      title: null,
      subtitle: null,
      cta_label: null,
      cta_url: "/anunciar",
      image_desktop_url: "https://cdn.example.com/2.webp",
      image_mobile_url: null,
      image_alt: "2",
    },
  ];

  it("com 2+ banners: setInterval com AUTOPLAY_INTERVAL_MS (6000) e avança o slide", () => {
    vi.useFakeTimers();
    const setIntervalSpy = vi.spyOn(window, "setInterval");
    const { container } = render(<HomeHero stateName="SP" banners={twoBanners} />);
    const region = container.querySelector('[role="region"]') as HTMLElement;
    expect(region.style.transform).toBe("translateX(-0%)");
    // O autoplay foi instalado com 6000ms.
    const autoplayCalls = setIntervalSpy.mock.calls.filter((c) => c[1] === 6000);
    expect(autoplayCalls.length).toBeGreaterThan(0);

    act(() => {
      vi.advanceTimersByTime(6000);
    });
    expect(region.style.transform).toBe("translateX(-100%)");

    // Wrap após dois ciclos: idx 0 → 1 → 0.
    act(() => {
      vi.advanceTimersByTime(6000);
    });
    expect(region.style.transform).toBe("translateX(-0%)");
  });

  it("com 1 banner: NÃO instala autoplay (nenhum setInterval(6000))", () => {
    vi.useFakeTimers();
    const setIntervalSpy = vi.spyOn(window, "setInterval");
    render(<HomeHero stateName="SP" banners={[twoBanners[0]]} />);
    const autoplayCalls = setIntervalSpy.mock.calls.filter((c) => c[1] === 6000);
    expect(autoplayCalls).toHaveLength(0);
  });

  it("prefers-reduced-motion → autoplay desabilitado (nenhum setInterval(6000))", () => {
    reducedMotionMatches = true;
    vi.useFakeTimers();
    const setIntervalSpy = vi.spyOn(window, "setInterval");
    render(<HomeHero stateName="SP" banners={twoBanners} />);
    const autoplayCalls = setIntervalSpy.mock.calls.filter((c) => c[1] === 6000);
    expect(autoplayCalls).toHaveLength(0);
  });

  it("clicar em dot navega instantaneamente para o slide", () => {
    vi.useFakeTimers();
    const { container } = render(<HomeHero stateName="SP" banners={twoBanners} />);
    const region = container.querySelector('[role="region"]') as HTMLElement;
    const dots = screen.getAllByRole("button", { name: /Ir para o banner/i });
    expect(dots).toHaveLength(2);
    act(() => {
      dots[1].click();
    });
    expect(region.style.transform).toBe("translateX(-100%)");
  });
});
