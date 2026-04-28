// frontend/components/home/sections/HomeHero.tsx
"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";

import { HOME_HERO_BANNER } from "@/lib/site/brand-assets";

/**
 * HomeHero — banner regional alinhado ao mockup `pagina Home.png`.
 *
 * Renderiza o card herói abaixo da `HomeSearchCard` e da `HomeShortcuts`:
 *   - Pílula com pin: "<cidade> e região"
 *   - H1 "Encontre oportunidades / na sua cidade"
 *   - Linha curta de copy regional
 *   - CTA primário "Ver ofertas →" (links direto para /comprar com a cidade
 *     ativa) — único CTA dentro do banner; busca mora em HomeSearchCard.
 *   - Indicador "+N mil ofertas ativas" com avatares quando há totalAds.
 *   - Dots decorativos (carousel visual).
 *
 * O banner agora é `home-hero-banner.png` (asset limpo, sem texto
 * pré-renderizado), extraído do sprite enviado pelo usuário. Aplicamos
 * apenas um gradient suave da esquerda (forte) para o centro
 * (transparente) para dar contraste ao H1 + CTA — a imagem da cidade +
 * SUV continua visível à direita, igual ao mockup.
 */

interface HomeHeroProps {
  defaultCitySlug: string;
  /** Nome da cidade ativa (para personalizar pílula e microtexto). */
  cityName?: string;
  /** Total de anúncios ativos (para a "+N mil ofertas ativas"). */
  totalAds?: number;
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

export function HomeHero({ defaultCitySlug, cityName, totalAds }: HomeHeroProps) {
  const router = useRouter();
  const cityLabel = cityName || "sua região";

  const offersHref = useMemo(() => {
    const params = new URLSearchParams();
    if (defaultCitySlug) params.set("city_slug", defaultCitySlug);
    const qs = params.toString();
    return qs ? `/comprar?${qs}` : "/comprar";
  }, [defaultCitySlug]);

  const handleCtaClick = useCallback(() => {
    // Mantém SSR-friendly via Link do next; este onClick é só fallback
    // de analytics se algum dia houver tracker — por ora não faz nada.
  }, []);

  const offersBadge = formatActiveOffers(totalAds);

  return (
    <section className="mx-auto w-full max-w-8xl px-4 pt-5 sm:px-6 sm:pt-7 lg:px-8">
      <div className="relative overflow-hidden rounded-2xl bg-cnc-footer-a shadow-premium md:rounded-3xl">
        <Image
          src={HOME_HERO_BANNER}
          alt={
            cityName
              ? `Carros usados em ${cityName} no Carros na Cidade`
              : "Carros na Cidade — portal automotivo regional"
          }
          fill
          priority
          sizes="(min-width: 1280px) 1440px, 100vw"
          className="object-cover object-right"
        />
        {/*
         * Gradient suave da esquerda (forte) para o centro (transparente)
         * para dar contraste ao H1 + CTA — a foto da cidade + SUV fica
         * visível à direita.
         */}
        <div className="absolute inset-0 bg-gradient-to-r from-cnc-footer-a via-cnc-footer-a/70 to-transparent" />

        <div
          className="relative grid min-h-[220px] items-center px-5 py-6 sm:min-h-[300px] sm:px-8 sm:py-9 md:min-h-[380px] lg:px-12"
          onClick={handleCtaClick}
        >
          <div className="max-w-xl">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-sm sm:text-[12px]">
              <PinIcon />
              {cityName ? `${cityName} e região` : "Sua região"}
            </span>

            <h1 className="mt-3 text-[22px] font-extrabold leading-[1.1] tracking-tight text-white sm:text-[28px] md:text-[36px]">
              Encontre
              <br />
              oportunidades
              <br />
              na sua cidade
            </h1>

            <p className="mt-2 max-w-md text-[13px] leading-snug text-white/85 sm:mt-3 sm:text-[15px]">
              Carros, lojas e ofertas reais em {cityLabel}.
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-2.5 sm:mt-5 sm:gap-4">
              <Link
                href={offersHref}
                className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-[13.5px] font-extrabold text-white shadow-card transition hover:bg-primary-strong sm:px-6 sm:py-3 sm:text-[15px]"
              >
                Ver ofertas
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

        {/*
         * Dots decorativos (carousel visual). Sem mecânica de troca — só
         * sinalização visual conforme mockup. 1 ativo, 3 inativos.
         */}
        <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 gap-1.5 sm:bottom-5">
          <span aria-hidden="true" className="h-1.5 w-6 rounded-full bg-white/90" />
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-white/40" />
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-white/40" />
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-white/40" />
        </div>
      </div>
    </section>
  );
}
