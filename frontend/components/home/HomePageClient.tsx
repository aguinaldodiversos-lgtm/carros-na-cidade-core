"use client";

import Link from "next/link";
import type { AdItem } from "@/lib/search/ads-search";
import { AdGrid } from "../ads/AdGrid";
import { HeroCarousel } from "./HeroCarousel";
import { HomeSearchSection } from "../search/HomeSearchSection";

interface HomePageClientProps {
  data: {
    featuredCities: Array<{
      id: number;
      name: string;
      slug: string;
      demand_score?: number;
    }>;
    highlightAds: AdItem[];
    opportunityAds: AdItem[];
    recentAds: AdItem[];
    stats: {
      total_ads?: number | string;
      total_cities?: number | string;
      total_advertisers?: number | string;
      total_users?: number | string;
    };
  };
}

function BenefitIcon({
  children,
  bg = "#edf4ff",
  color = "#0e62d8",
}: {
  children: React.ReactNode;
  bg?: string;
  color?: string;
}) {
  return (
    <span
      className="inline-flex h-11 w-11 items-center justify-center rounded-full"
      style={{ backgroundColor: bg, color }}
    >
      {children}
    </span>
  );
}

const benefits = [
  {
    title: "Compra segura",
    text: "Negocie direto com vendedores verificados",
    icon: (
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 3l7 3v6c0 4.5-2.8 7.4-7 9-4.2-1.6-7-4.5-7-9V6l7-3Z" />
        <path d="m9 12 2 2 4-4" />
      </svg>
    ),
  },
  {
    title: "Foco na sua cidade",
    text: "Ofertas locais, praticidade e relevância regional",
    icon: (
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 21s7-4.5 7-11a7 7 0 1 0-14 0c0 6.5 7 11 7 11Z" />
        <circle cx="12" cy="10" r="2.5" />
      </svg>
    ),
  },
  {
    title: "Transparência de preço",
    text: "Planos e leitura de valor com base na FIPE",
    icon: (
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 3v18" />
        <path d="M17 7.5c0-2-2-3.5-5-3.5s-5 1.5-5 3.5 2 3.5 5 3.5 5 1.5 5 3.5-2 3.5-5 3.5-5-1.5-5-3.5" />
      </svg>
    ),
  },
  {
    title: "Venda rápida",
    text: "Anuncie com destaque e aumente sua visibilidade",
    icon: (
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8Z" />
      </svg>
    ),
    cta: { label: "Criar anúncio", href: "/planos" },
  },
];

export function HomePageClient({ data }: HomePageClientProps) {
  const regionalFocus = data.featuredCities?.[0]?.name || "São Paulo";
  const recentAds = data.recentAds || [];
  const highlightAds = (data.highlightAds?.length ? data.highlightAds : recentAds).slice(0, 4);
  const opportunityAds = (
    data.opportunityAds?.length
      ? data.opportunityAds
      : recentAds.slice(4, 8).length
        ? recentAds.slice(4, 8)
        : recentAds
  ).slice(0, 4);

  return (
    <main className="min-h-screen bg-[#f4f4f6]">
      <div className="mx-auto max-w-7xl px-4 pb-8 md:px-6 md:pb-10">
        <HeroCarousel />

        <div className="mt-4">
          <HomeSearchSection />
        </div>

        <section className="mt-5">
          <div className="mb-3">
            <h2 className="text-[18px] font-extrabold leading-tight text-[#1d2538] md:text-[20px]">
              Destaques em {regionalFocus}
            </h2>
            <p className="mt-1 text-[14px] text-[#6b7488]">
              Veículos patrocinados com maior visibilidade
            </p>
          </div>

          <AdGrid items={highlightAds} priorityFirstRow priorityCount={4} variant="home" />
        </section>

        <section className="mt-5">
          <div className="mb-3">
            <h2 className="text-[18px] font-extrabold leading-tight text-[#1d2538] md:text-[20px]">
              Oportunidades abaixo da FIPE
            </h2>
            <p className="mt-1 text-[14px] text-[#6b7488]">
              Ofertas com preço abaixo do valor de mercado
            </p>
          </div>

          <AdGrid items={opportunityAds} priorityCount={4} variant="home" />
        </section>

        <section className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {benefits.map((item) => (
            <div
              key={item.title}
              className="rounded-[12px] border border-[#e1e5ef] bg-white p-4 shadow-[0_2px_18px_rgba(20,30,60,0.06)]"
            >
              <div className="flex items-start gap-4">
                <BenefitIcon>{item.icon}</BenefitIcon>

                <div className="min-w-0">
                  <h3 className="text-[15px] font-black leading-tight text-[#1d2538] md:text-[16px]">
                    {item.title}
                  </h3>
                  <p className="mt-1 text-[13px] leading-5 text-[#6b7488]">{item.text}</p>
                </div>
              </div>

              {"cta" in item && item.cta ? (
                <Link
                  href={item.cta.href}
                  className="mt-4 inline-flex h-10 items-center justify-center rounded-[10px] bg-[#0e62d8] px-5 text-[15px] font-bold text-white transition hover:bg-[#0c4fb0]"
                >
                  {item.cta.label}
                </Link>
              ) : null}
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}
