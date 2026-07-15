// frontend/components/financing/FinancingLandingPageClient.tsx
"use client";

import Link from "next/link";
import type { AdItem } from "@/lib/search/ads-search";
import AdCard from "@/components/ads/AdCard";
import { PromoBanner } from "@/components/common/PromoBanner";
import FinancingSimulator from "@/components/financing/FinancingSimulator";
import { SiteBottomNav } from "@/components/shell/SiteBottomNav";

/**
 * Página /simulador-financiamento/[cidade] — wrapper em torno do núcleo
 * compartilhado `FinancingSimulator` (o mesmo usado embutido na página do
 * anúncio). Aqui o valor do veículo é EDITÁVEL (o usuário chegou sem carro
 * escolhido). O cálculo/inputs/tabela vivem no núcleo — este arquivo só
 * compõe a página: simulador + "Carros compatíveis" + banner + bottom-nav.
 *
 * O cabeçalho (← + H1 + frase) fica em <SimuladorIntroSync> SÍNCRONO na page
 * (antes do <Suspense>), garantindo o H1 dentro do <main> antes do footer (SEO).
 */

interface FinancingLandingPageClientProps {
  citySlug: string;
  cityName: string;
  cityLabel: string;
  /**
   * Anúncio em destaque para o hero — hoje não usado no JSX (o redesign manteve
   * apenas simulador + "Carros compatíveis"); mantido na prop porque a page
   * ainda o resolve. `null` é inofensivo.
   */
  heroVehicle: AdItem | null;
  highlightAds: AdItem[];
  opportunityAds: AdItem[];
  initialVehicleValue?: number;
}

function ArrowRightIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}

function CarSectionIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 14V12l2-5a2 2 0 0 1 1.9-1.4h10.2A2 2 0 0 1 19 7l2 5v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
      <path d="M6 11h12" />
      <circle cx="7.5" cy="14" r="1" />
      <circle cx="16.5" cy="14" r="1" />
    </svg>
  );
}

export function FinancingLandingPageClient({
  citySlug,
  cityName,
  highlightAds,
  opportunityAds,
  initialVehicleValue,
}: FinancingLandingPageClientProps) {
  const compatibleAds = (highlightAds?.length ? highlightAds : opportunityAds).slice(0, 3);
  const seeAllHref = `/comprar?city_slug=${citySlug}`;

  return (
    <>
      {/*
        `<div>` (não `<main>`): o `<main id="main-content">` é do root layout.
        Aqui fica só o simulador + resultados + descoberta.
      */}
      <div className="bg-cnc-bg pb-24 text-cnc-text">
        <div className="mx-auto w-full max-w-3xl px-4 sm:px-6 lg:max-w-4xl lg:px-8">
          <div className="mt-5">
            <FinancingSimulator initialVehicleValue={initialVehicleValue} valueEditable />
          </div>

          {/* Carros compatíveis com sua parcela */}
          {compatibleAds.length > 0 ? (
            <section aria-label="Carros compatíveis com sua parcela" className="mt-7">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="text-cnc-text-strong">
                    <CarSectionIcon />
                  </span>
                  <h2 className="truncate text-[16px] font-extrabold leading-tight text-cnc-text-strong sm:text-[18px]">
                    Carros compatíveis com sua parcela
                  </h2>
                </div>
                <Link
                  href={seeAllHref}
                  className="inline-flex shrink-0 items-center gap-1 text-[13px] font-semibold text-primary hover:text-primary-strong"
                >
                  Ver todos
                  <ArrowRightIcon />
                </Link>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {compatibleAds.map((item, index) => (
                  <AdCard key={`${item.id ?? item.slug ?? index}-cfg`} item={item} />
                ))}
              </div>
            </section>
          ) : (
            <p className="mt-7 rounded-xl border border-dashed border-cnc-line bg-white px-5 py-6 text-center text-[14px] text-cnc-muted">
              Ainda não há ofertas carregadas para {cityName}. Volte em breve.
            </p>
          )}

          {/*
            Banner (último bloco antes do rodapé) — quem chega aqui buscou
            "simular financiamento" e ainda não escolheu carro; o banner o leva
            ao catálogo da cidade.
          */}
          <section aria-label={`Ver carros em ${cityName}`} className="mt-7">
            <PromoBanner
              desktopSrc="/images/banner-simulador-financiamento-desktop.png"
              mobileSrc="/images/banner-simulador-financiamento-mobile.png"
              title="Agora encontre o carro que cabe na sua parcela"
              subtitle={`Veja os anúncios disponíveis em ${cityName} e região.`}
              ctaLabel={`Ver carros em ${cityName}`}
              href={`/comprar/cidade/${encodeURIComponent(citySlug)}`}
            />
          </section>
        </div>
      </div>

      <SiteBottomNav />
    </>
  );
}

export default FinancingLandingPageClient;
