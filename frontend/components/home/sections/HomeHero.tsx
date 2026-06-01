// frontend/components/home/sections/HomeHero.tsx
"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";

import { HOME_HERO_BANNER } from "@/lib/site/brand-assets";

/**
 * Override de um único banner (Fase 4.1) — todos campos opcionais; o
 * componente cai no fallback hardcoded para cada campo ausente.
 *
 * Mantido pelo nome legado para evitar churn no resto do app.
 */
export interface HomeHeroOverride {
  title: string | null;
  subtitle: string | null;
  cta_label: string | null;
  cta_url: string | null;
  image_desktop_url: string | null;
  image_mobile_url: string | null;
  image_alt: string | null;
}

/**
 * Banner do carrossel (Fase 4.1.1). Compatível com HomeHeroOverride +
 * `position` (apenas informativo na key do React).
 */
export interface HomeHeroBannerOverride extends HomeHeroOverride {
  position: 1 | 2 | 3;
}

/**
 * HomeHero — banner do topo da Home.
 *
 * Modos
 * -----
 * - 0 banners do admin → render do fallback hardcoded (estado/cidade
 *   detectada), igual ao mockup original.
 * - 1 banner do admin → um único slide editável (mesma altura/layout do
 *   fallback). Sem dots, sem carrossel.
 * - 2 ou 3 banners ativos → carrossel CSS scroll-snap horizontal. Sem JS
 *   pesado: os slides são `<article>` lado a lado em um container com
 *   `overflow-x-auto snap-x snap-mandatory`. Dots (que viraram botões)
 *   rolam para o slide. Primeira imagem com `priority`; demais lazy.
 *
 * LCP-friendly
 * ------------
 * O primeiro slide sempre carrega com priority; outros slides usam
 * fetchPriority="low" e loading="lazy" (Image do next aceita
 * `priority={false}` + `loading="lazy"`). Mobile usa image_mobile_url
 * quando disponível via `<picture>`-like trick: passamos como src do
 * Image quando `breakpoint` está abaixo do md — implementamos via
 * matchMedia client-side; sem JS o componente continua mostrando o
 * desktop (degradação graceful).
 */

function hasContent(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

interface HomeHeroProps {
  /**
   * Slug da cidade detectada (cookie/query). Quando presente, o CTA "Ver
   * ofertas" leva a `/comprar?city_slug=<slug>` que cai na cidade canônica.
   * Quando vazio, o CTA vai para `/comprar` puro — que redireciona para o
   * catálogo do estado padrão (vitrine estadual).
   */
  defaultCitySlug?: string;
  /** Nome da cidade detectada (cookie). Usado na pílula quando presente. */
  cityName?: string;
  /**
   * Estado em foco quando não há cidade detectada — a Home é vitrine estadual
   * por padrão, então este nome aparece na pílula e na microcopy.
   */
  stateName: string;
  /** Total de anúncios ativos (para a "+N mil ofertas ativas"). */
  totalAds?: number;
  /**
   * Override LEGADO (Fase 4.1 — banner único). Quando presente, é usado se
   * `banners` não estiver definido ou vier vazio.
   */
  override?: HomeHeroOverride | null;
  /**
   * Banners ativos vindos do backend (Fase 4.1.1). Quando 1 entry, renderiza
   * estático; 2-3, renderiza carrossel.
   */
  banners?: readonly HomeHeroBannerOverride[] | null;
}

function PinIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 22s7-7 7-13a7 7 0 1 0-14 0c0 6 7 13 7 13Z" />
      <circle cx="12" cy="9" r="2.5" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}

function formatActiveOffers(total: number | undefined): string | null {
  if (!total || total < 100) return null;
  if (total >= 1000) {
    const mil = Math.floor(total / 1000);
    return `+${mil} mil ofertas ativas`;
  }
  const rounded = Math.floor(total / 100) * 100;
  return `+${rounded} ofertas ativas`;
}

/**
 * Constrói o array final de "slides" a renderizar.
 *
 * Prioridade:
 *   - banners não-vazio: usar como vindos do admin.
 *   - override legado: usar como único slide.
 *   - nada: array com 1 entry "vazia" que será renderizada com fallback
 *     hardcoded por campo dentro do Slide.
 */
function resolveSlides(
  banners: readonly HomeHeroBannerOverride[] | null | undefined,
  override: HomeHeroOverride | null | undefined
): readonly HomeHeroBannerOverride[] {
  if (banners && banners.length > 0) return banners.slice(0, 3);
  if (override) return [{ ...override, position: 1 }];
  return [
    {
      position: 1,
      title: null,
      subtitle: null,
      cta_label: null,
      cta_url: null,
      image_desktop_url: null,
      image_mobile_url: null,
      image_alt: null,
    },
  ];
}

export function HomeHero({
  defaultCitySlug,
  cityName,
  stateName,
  totalAds,
  override = null,
  banners = null,
}: HomeHeroProps) {
  const slides = useMemo(() => resolveSlides(banners, override), [banners, override]);
  const offersBadge = formatActiveOffers(totalAds);
  const showCarousel = slides.length > 1;

  const [activeDot, setActiveDot] = useState(0);

  const onScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const w = el.clientWidth || 1;
    const idx = Math.round(el.scrollLeft / w);
    setActiveDot(idx);
  }, []);

  function goToSlide(idx: number) {
    const el = document.getElementById("home-hero-track");
    if (!el) return;
    const w = el.clientWidth || 1;
    el.scrollTo({ left: idx * w, behavior: "smooth" });
  }

  return (
    <section className="mx-auto w-full max-w-8xl px-4 pt-5 sm:px-6 sm:pt-7 lg:px-8">
      <div className="relative overflow-hidden rounded-2xl bg-cnc-footer-a shadow-premium md:rounded-3xl">
        {showCarousel ? (
          <div
            id="home-hero-track"
            className="flex w-full snap-x snap-mandatory overflow-x-auto scroll-smooth"
            onScroll={onScroll}
            role="region"
            aria-roledescription="carousel"
            aria-label="Banners principais"
          >
            {slides.map((slide, idx) => (
              <div
                key={`slide-${slide.position}-${idx}`}
                className="relative w-full flex-none snap-start"
                aria-roledescription="slide"
                aria-label={`Banner ${idx + 1} de ${slides.length}`}
              >
                <HeroSlide
                  slide={slide}
                  cityName={cityName}
                  stateName={stateName}
                  defaultCitySlug={defaultCitySlug}
                  offersBadge={offersBadge}
                  priority={idx === 0}
                />
              </div>
            ))}
          </div>
        ) : (
          <HeroSlide
            slide={slides[0]}
            cityName={cityName}
            stateName={stateName}
            defaultCitySlug={defaultCitySlug}
            offersBadge={offersBadge}
            priority
          />
        )}

        {/* Dots — visuais quando 1; navegáveis quando 2-3 */}
        <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 gap-1.5 sm:bottom-5">
          {(showCarousel ? slides : [slides[0], null, null, null]).map((_, idx) => {
            const isActive = showCarousel ? idx === activeDot : idx === 0;
            const Tag = showCarousel ? "button" : "span";
            const className = `rounded-full transition-all ${
              isActive ? "h-1.5 w-6 bg-white/90" : "h-1.5 w-1.5 bg-white/40"
            }`;
            if (Tag === "button") {
              return (
                <button
                  key={idx}
                  type="button"
                  aria-label={`Ir para o banner ${idx + 1}`}
                  aria-current={isActive}
                  onClick={() => goToSlide(idx)}
                  className={className}
                />
              );
            }
            return <span key={idx} aria-hidden="true" className={className} />;
          })}
        </div>
      </div>
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Slide individual — encapsula um banner. Fallback por campo para
// preservar a UX original quando admin não definiu o campo.
// ──────────────────────────────────────────────────────────────────────

function HeroSlide({
  slide,
  cityName,
  stateName,
  defaultCitySlug,
  offersBadge,
  priority,
}: {
  slide: HomeHeroBannerOverride;
  cityName: string | undefined;
  stateName: string;
  defaultCitySlug: string | undefined;
  offersBadge: string | null;
  priority: boolean;
}) {
  const overrideCtaUrl = hasContent(slide.cta_url) ? slide.cta_url : null;
  const overrideImage = hasContent(slide.image_desktop_url) ? slide.image_desktop_url : null;
  // mobile só substitui no breakpoint mobile — usamos srcSet emulado pelo
  // Image via `unoptimized` + URL única. Aqui escolhemos desktop como
  // base (LCP). Quando mobile_url existir, renderizamos um `<source>`
  // adjacente via Image alternativo seria custoso; ficamos com a regra:
  // desktop como Image principal + classe `md:hidden`/`hidden md:block`
  // para um <img> de mobile quando configurado.
  const overrideMobile = hasContent(slide.image_mobile_url) ? slide.image_mobile_url : null;
  const overrideAlt = hasContent(slide.image_alt) ? slide.image_alt : null;
  const overrideTitle = hasContent(slide.title) ? slide.title : null;
  const overrideSubtitle = hasContent(slide.subtitle) ? slide.subtitle : null;
  const overrideCtaLabel = hasContent(slide.cta_label) ? slide.cta_label : null;

  const scopeLabel = cityName ? `${cityName} e região` : stateName;
  const pillLabel = cityName ? `${cityName} e região` : `${stateName} e região`;

  const bannerSrc = overrideImage || HOME_HERO_BANNER;

  const offersHref = useMemo(() => {
    if (overrideCtaUrl) return overrideCtaUrl;
    if (defaultCitySlug) {
      const params = new URLSearchParams();
      params.set("city_slug", defaultCitySlug);
      return `/comprar?${params.toString()}`;
    }
    return "/comprar";
  }, [defaultCitySlug, overrideCtaUrl]);

  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* Imagem desktop (LCP candidato quando priority). */}
      <div className={overrideMobile ? "hidden md:block absolute inset-0" : "absolute inset-0"}>
        <Image
          src={bannerSrc}
          alt={
            overrideAlt ||
            (cityName
              ? `Carros usados em ${cityName} no Carros na Cidade`
              : `Carros usados em ${stateName} no Carros na Cidade`)
          }
          fill
          priority={priority}
          loading={priority ? undefined : "lazy"}
          sizes="(min-width: 1280px) 1440px, 100vw"
          className="object-cover object-right"
          unoptimized={Boolean(overrideImage)}
        />
      </div>

      {/* Imagem mobile dedicada quando admin configurou. */}
      {overrideMobile && (
        <div className="absolute inset-0 md:hidden">
          <Image
            src={overrideMobile}
            alt={overrideAlt || ""}
            fill
            priority={priority}
            loading={priority ? undefined : "lazy"}
            sizes="100vw"
            className="object-cover object-center"
            unoptimized
          />
        </div>
      )}

      <div className="absolute inset-0 bg-gradient-to-r from-cnc-footer-a via-cnc-footer-a/70 to-transparent" />

      <div className="relative grid min-h-[220px] items-center px-5 py-6 sm:min-h-[300px] sm:px-8 sm:py-9 md:min-h-[380px] lg:px-12">
        <div className="max-w-xl">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-sm sm:text-[12px]">
            <PinIcon />
            {pillLabel}
          </span>

          <h1 className="mt-3 text-[22px] font-extrabold leading-[1.1] tracking-tight text-white sm:text-[28px] md:text-[36px]">
            {overrideTitle ? (
              overrideTitle
            ) : cityName ? (
              <>
                Encontre
                <br />
                oportunidades
                <br />
                na sua cidade
              </>
            ) : (
              <>
                Carros usados
                <br />
                em {stateName}
              </>
            )}
          </h1>

          <p className="mt-2 max-w-md text-[13px] leading-snug text-white/85 sm:mt-3 sm:text-[15px]">
            {overrideSubtitle
              ? overrideSubtitle
              : cityName
              ? `Carros, lojas e ofertas reais em ${scopeLabel}.`
              : `Ofertas selecionadas em todo o estado de ${stateName} — informe sua cidade para ver carros próximos.`}
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-2.5 sm:mt-5 sm:gap-4">
            <Link
              href={offersHref}
              className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-[13.5px] font-extrabold text-white shadow-card transition hover:bg-primary-strong sm:px-6 sm:py-3 sm:text-[15px]"
            >
              {overrideCtaLabel || "Ver ofertas"}
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white/15 sm:h-6 sm:w-6">
                <ArrowRightIcon />
              </span>
            </Link>

            {offersBadge ? (
              <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-sm sm:text-[12px]">
                <span aria-hidden="true" className="flex -space-x-1.5">
                  <span className="inline-block h-5 w-5 rounded-full border-2 border-cnc-footer-a bg-primary" />
                  <span className="inline-block h-5 w-5 rounded-full border-2 border-cnc-footer-a bg-cnc-success" />
                  <span className="inline-block h-5 w-5 rounded-full border-2 border-cnc-footer-a bg-cnc-warning" />
                </span>
                {offersBadge}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
