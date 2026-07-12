// frontend/components/home/sections/HomeHero.tsx
"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { HOME_HERO_BANNER } from "@/lib/site/brand-assets";

/**
 * Aspect-ratio único do slide do carrossel (Fase 4.1.4).
 *
 * Aplicado IGUAL nos dois modos do HeroSlide (arte pronta e fallback
 * textual) para garantir que TODOS os slides — independente do conteúdo —
 * ocupem exatamente a mesma área visual no mesmo breakpoint. Isso
 * elimina o "pulo de layout" quando o carrossel troca de slide.
 *
 * Mobile (default): aspect-[2000/1400] = 10/7 ≈ 1.43
 *   - 375 px de viewport → 262 px de altura
 *   - Casa com a recomendação de upload mobile: 2000×1400 px.
 *
 * md+ (≥768 px): aspect-[2120/640] = 53/16 ≈ 3.31
 *   - 1280 px de viewport → 386 px de altura (≈ histórico 380 px).
 *   - Casa com a recomendação de upload desktop: 2120×640 px.
 */
const BANNER_ASPECT_CLASS = "aspect-[2000/1400] md:aspect-[2120/640]";

/** Intervalo de autoplay em ms (Fase 4.1.3). */
const AUTOPLAY_INTERVAL_MS = 6000;

/**
 * Quando o admin clica num dot, pausamos o autoplay por este tempo para
 * dar espaço ao usuário ler o slide escolhido antes de continuar a
 * rotação automática.
 */
const MANUAL_PAUSE_MS = 12000;

/**
 * Detecta a preferência `prefers-reduced-motion: reduce`. Em SSR / sem
 * matchMedia, assume false (autoplay habilitado por padrão para a
 * maioria dos usuários).
 */
function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

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

  // Índice ativo (0..slides.length-1).
  const [activeIdx, setActiveIdx] = useState(0);
  // Pause manual ou hover.
  const [paused, setPaused] = useState(false);
  // Timer da pausa temporária após clique em dot (limpa em unmount).
  const manualPauseTimerRef = useRef<number | null>(null);

  // Clamp se o array encolher (ex.: admin desativa o último banner).
  useEffect(() => {
    if (activeIdx >= slides.length) setActiveIdx(0);
  }, [slides.length, activeIdx]);

  // Autoplay (Fase 4.1.3).
  //
  // Política:
  //   - só roda quando há 2+ banners (showCarousel);
  //   - pausa quando `paused` (hover ou clique manual em dot);
  //   - respeita `prefers-reduced-motion: reduce`;
  //   - cleanup ao desmontar / mudar deps.
  useEffect(() => {
    if (!showCarousel) return;
    if (paused) return;
    if (prefersReducedMotion()) return;
    if (typeof window === "undefined") return;

    const id = window.setInterval(() => {
      setActiveIdx((cur) => (cur + 1) % slides.length);
    }, AUTOPLAY_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [showCarousel, paused, slides.length]);

  // Cleanup do timer manual no unmount.
  useEffect(
    () => () => {
      if (manualPauseTimerRef.current != null && typeof window !== "undefined") {
        window.clearTimeout(manualPauseTimerRef.current);
      }
    },
    []
  );

  const handleDotClick = useCallback(
    (idx: number) => {
      if (typeof window === "undefined") return;
      const normalized = ((idx % slides.length) + slides.length) % slides.length;
      setActiveIdx(normalized);
      // Pausa temporária — usuário escolheu um slide; respeita por 12s.
      setPaused(true);
      if (manualPauseTimerRef.current != null) {
        window.clearTimeout(manualPauseTimerRef.current);
      }
      manualPauseTimerRef.current = window.setTimeout(() => setPaused(false), MANUAL_PAUSE_MS);
    },
    [slides.length]
  );

  return (
    <section
      className="mx-auto w-full max-w-8xl px-4 pt-5 sm:px-6 sm:pt-7 lg:px-8"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Wrapper: overflow-hidden + rounded + shadow. SEM background — cada
          slide controla o seu (arte pronta usa bg neutro claro; fallback
          textual usa bg-cnc-footer-a). */}
      <div className="relative w-full overflow-hidden rounded-2xl shadow-premium md:rounded-3xl">
        {/* Track: flex linear; movimento via transform: translateX. Não usa
            scroll-snap → não cria barra horizontal nativa. */}
        <div
          className="flex w-full transition-transform duration-500 ease-out motion-reduce:transition-none"
          style={{ transform: `translateX(-${activeIdx * 100}%)` }}
          role="region"
          aria-roledescription="carousel"
          aria-label="Banners principais"
          aria-live={showCarousel && !paused ? "off" : "polite"}
        >
          {slides.map((slide, idx) => (
            <div
              key={`slide-${slide.position}-${idx}`}
              className="w-full flex-shrink-0"
              aria-roledescription="slide"
              aria-label={`Banner ${idx + 1} de ${slides.length}`}
              aria-hidden={showCarousel && idx !== activeIdx}
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

        {/* Dots — só quando há 2+ banners. Cor primary contrasta tanto em
            bg claro (arte pronta) quanto em bg escuro (fallback textual). */}
        {showCarousel && (
          <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 gap-1.5 sm:bottom-5">
            {slides.map((_, idx) => {
              const isActive = idx === activeIdx;
              return (
                <button
                  key={idx}
                  type="button"
                  aria-label={`Ir para o banner ${idx + 1}`}
                  aria-current={isActive}
                  onClick={() => handleDotClick(idx)}
                  className={`rounded-full ring-1 ring-cnc-bg/30 transition-all hover:bg-primary/80 ${
                    isActive ? "h-1.5 w-6 bg-primary" : "h-1.5 w-1.5 bg-cnc-text/30"
                  }`}
                />
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Slide individual — DOIS MODOS DE RENDER (Fase 4.1.2):
//
//   Modo "arte pronta" (image_desktop_url existe):
//     Renderiza apenas a imagem dentro de um <Link>. SEM gradiente
//     escurecedor, SEM H1 sobreposto, SEM CTA fake — porque a imagem
//     enviada pelo admin já é uma peça publicitária COMPLETA. Qualquer
//     overlay polui a arte e tira o controle visual do admin.
//
//   Modo "fallback textual" (sem imagem):
//     Mantém o layout legado (pílula, H1, subtítulo, CTA pílula). Útil
//     no estado inicial (admin não configurou nada → cai no fallback
//     hardcoded com microcopy regional) e em campanhas só-texto.
//
// O alt do <Image> é o `image_alt` definido pelo admin — invisível na
// tela, lido por leitores de tela. Vazio (string vazia) é aceitável
// para imagens decorativas, mas no nosso fluxo backend é obrigatório.
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
  const overrideMobile = hasContent(slide.image_mobile_url) ? slide.image_mobile_url : null;
  const overrideAlt = hasContent(slide.image_alt) ? slide.image_alt : null;
  const overrideTitle = hasContent(slide.title) ? slide.title : null;
  const overrideSubtitle = hasContent(slide.subtitle) ? slide.subtitle : null;
  const overrideCtaLabel = hasContent(slide.cta_label) ? slide.cta_label : null;

  const scopeLabel = cityName ? `${cityName} e região` : stateName;
  const pillLabel = cityName ? `${cityName} e região` : `${stateName} e região`;

  const offersHref = useMemo(() => {
    if (overrideCtaUrl) return overrideCtaUrl;
    if (defaultCitySlug) {
      const params = new URLSearchParams();
      params.set("city_slug", defaultCitySlug);
      return `/comprar?${params.toString()}`;
    }
    return "/comprar";
  }, [defaultCitySlug, overrideCtaUrl]);

  // ─── Modo "arte pronta" ─────────────────────────────────────────────
  if (overrideImage) {
    const altText = overrideAlt ?? "";
    const isExternal = /^https?:\/\//i.test(offersHref);
    const linkProps = isExternal ? { rel: "noopener noreferrer", target: "_blank" as const } : {};

    // Container usa BANNER_ASPECT_CLASS — mesmo aspect-ratio do fallback
    // textual. Garante que TROCAR de slide nunca muda a altura.
    return (
      <Link
        href={offersHref}
        aria-label={altText || "Abrir oferta"}
        className={`block relative w-full overflow-hidden bg-[#f3f7ff] ${BANNER_ASPECT_CLASS}`}
        {...linkProps}
      >
        {/* Desktop — escondido quando há imagem mobile dedicada.
            object-fit dual (Fase 4.1.5):
              - mobile (default): object-contain — preserva arte inteira
                quando este element está visível como fallback de mobile.
              - md+ (≥768): object-cover — PREENCHE todo o container
                aspect-[2120/640]. Como o admin é orientado a subir
                exatamente 2120×640 px, o cover não causa corte. */}
        <div className={overrideMobile ? "hidden md:block absolute inset-0" : "absolute inset-0"}>
          <Image
            src={overrideImage}
            alt={altText}
            fill
            priority={priority}
            loading={priority ? undefined : "lazy"}
            sizes="(min-width: 1280px) 1440px, 100vw"
            className="object-contain md:object-cover object-center"
            unoptimized
          />
        </div>
        {/* Mobile dedicada quando admin configurou. object-contain mantém
            a arte mobile (2000×1400) inteira no container 2000/1400 e
            também protege quando o admin subir outras proporções. */}
        {overrideMobile && (
          <div className="absolute inset-0 md:hidden">
            <Image
              src={overrideMobile}
              alt={altText}
              fill
              priority={priority}
              loading={priority ? undefined : "lazy"}
              sizes="100vw"
              className="object-contain object-center"
              unoptimized
            />
          </div>
        )}
      </Link>
    );
  }

  // ─── Modo "fallback textual" ────────────────────────────────────────
  // Layout original: pílula + H1 + microcopy + CTA pílula. Mantém o
  // gradient suave por cima da imagem hardcoded (HOME_HERO_BANNER) para
  // garantir legibilidade. Esse modo só roda quando ADMIN NÃO TEM
  // IMAGEM — então o gradient sempre roda sobre a imagem hardcoded,
  // nunca sobre uma arte do admin.
  //
  // CRÍTICO: usa BANNER_ASPECT_CLASS (mesma que arte pronta) para que
  // a altura seja IDÊNTICA entre modos. Conteúdo textual posicionado
  // absoluto dentro do container; padding interno controla o offset.
  return (
    <div className={`relative w-full overflow-hidden bg-cnc-footer-a ${BANNER_ASPECT_CLASS}`}>
      <div className="absolute inset-0">
        <Image
          src={HOME_HERO_BANNER}
          alt=""
          fill
          priority={priority}
          loading={priority ? undefined : "lazy"}
          sizes="(min-width: 1280px) 1440px, 100vw"
          className="object-cover object-right"
        />
      </div>
      <div className="absolute inset-0 bg-gradient-to-r from-cnc-footer-a via-cnc-footer-a/70 to-transparent" />
      <div className="absolute inset-0 grid items-center px-5 py-6 sm:px-8 sm:py-9 lg:px-12">
        <div className="max-w-xl">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-sm sm:text-[12px]">
            <PinIcon />
            {pillLabel}
          </span>

          {/*
            Título visual do banner — NÃO é <h1>. O <h1> canônico da Home é o
            sr-only em app/page.tsx (HomeIntroSync). Manter <h1> aqui criava
            duplicidade quando o banner cai no fallback textual (reestruturação
            2026-07-11).
          */}
          <p className="mt-3 text-[22px] font-extrabold leading-[1.1] tracking-tight text-white sm:text-[28px] md:text-[36px]">
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
          </p>

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
