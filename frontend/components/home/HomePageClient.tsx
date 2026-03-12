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

function isShowcaseReadyAd(item: AdItem) {
  const title = String(item.title ?? "").toLowerCase();
  const blockedTerms = ["teste", "worker", "alerta", "whatsapp", "fila api"];
  return !blockedTerms.some((term) => title.includes(term));
}

function BenefitIcon({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#edf4ff] text-[#0e62d8]">
      {children}
    </span>
  );
}

const benefits = [
  {
    title: "Compra segura",
    text: "Negocie direto com vendedores verificados",
    icon: (
      <svg viewBox="0 0 24 24" width="24" height="24" className="h-6 w-6 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 3l7 3v6c0 4.5-2.8 7.4-7 9-4.2-1.6-7-4.5-7-9V6l7-3Z" />
        <path d="m9 12 2 2 4-4" />
      </svg>
    ),
  },
  {
    title: "Foco na sua cidade",
    text: "Ofertas locais, praticidade e relevância regional",
    icon: (
      <svg viewBox="0 0 24 24" width="24" height="24" className="h-6 w-6 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 21s7-4.5 7-11a7 7 0 1 0-14 0c0 6.5 7 11 7 11Z" />
        <circle cx="12" cy="10" r="2.5" />
      </svg>
    ),
  },
  {
    title: "Transparência de preço",
    text: "Planos e leitura de valor com base na FIPE",
    icon: (
      <svg viewBox="0 0 24 24" width="24" height="24" className="h-6 w-6 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 3v18" />
        <path d="M17 7.5c0-2-2-3.5-5-3.5s-5 1.5-5 3.5 2 3.5 5 3.5 5 1.5 5 3.5-2 3.5-5 3.5-5-1.5-5-3.5" />
      </svg>
    ),
  },
  {
    title: "Venda rápida",
    text: "Anuncie em minutos e aumente sua visibilidade",
    icon: (
      <svg viewBox="0 0 24 24" width="24" height="24" className="h-6 w-6 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8Z" />
      </svg>
    ),
    cta: { label: "Criar anúncio", href: "/planos" },
  },
];

export function HomePageClient({ data }: HomePageClientProps) {
  const regionalFocus = data.featuredCities?.[0]?.name || "São Paulo";
  const recentAds = (data.recentAds || []).filter(isShowcaseReadyAd);
  const curatedHighlightAds = (data.highlightAds || []).filter(isShowcaseReadyAd);
  const curatedOpportunityAds = (data.opportunityAds || []).filter(isShowcaseReadyAd);
  const highlightAds = (curatedHighlightAds.length ? curatedHighlightAds : recentAds).slice(0, 4);
  const opportunityAds = (
    curatedOpportunityAds.length
      ? curatedOpportunityAds
      : recentAds.slice(4, 8).length
        ? recentAds.slice(4, 8)
        : recentAds
  ).slice(0, 4);

  return (
    <main className="min-h-screen bg-[#f3f4f8]">
      <div className="mx-auto max-w-7xl px-4 pb-10 md:px-6 md:pb-12">
        <section className="pt-4 md:pt-5">
          <HeroCarousel />
        </section>

        <section className="-mt-2 md:mt-4">
          <HomeSearchSection />
        </section>

        <section className="mt-8">
          <div className="mb-3.5">
            <h2 className="text-[32px] font-extrabold leading-tight tracking-[-0.02em] text-[#1d2538] md:text-[36px]">
              Destaques em {regionalFocus}
            </h2>
            <p className="mt-1 text-[14px] text-[#6b7488] md:text-[15px]">Veículos patrocinados com maior visibilidade</p>
          </div>

          <AdGrid items={highlightAds} priorityFirstRow priorityCount={4} variant="home" />
        </section>

        <section className="mt-8">
          <div className="mb-3.5">
            <h2 className="text-[32px] font-extrabold leading-tight tracking-[-0.02em] text-[#1d2538] md:text-[36px]">
              Oportunidades abaixo da FIPE
            </h2>
            <p className="mt-1 text-[14px] text-[#6b7488] md:text-[15px]">Ofertas com preço abaixo do valor de mercado</p>
          </div>

          <AdGrid items={opportunityAds} priorityCount={4} variant="home" />
        </section>

        <section className="mt-8 rounded-[16px] border border-[#dce3ef] bg-white shadow-[0_10px_30px_rgba(20,30,60,0.08)]">
          <div className="grid gap-0.5 bg-[#e8edf6] md:grid-cols-2 xl:grid-cols-4">
            {benefits.map((item) => (
              <div key={item.title} className="bg-white p-5">
                <div className="flex items-start gap-3.5">
                  <BenefitIcon>{item.icon}</BenefitIcon>

                  <div className="min-w-0">
                    <h3 className="text-[22px] font-black leading-tight text-[#1d2538] md:text-[24px]">{item.title}</h3>
                    <p className="mt-1.5 text-[13px] leading-[1.35] text-[#6b7488] md:text-[14px]">{item.text}</p>
                  </div>
                </div>

                {"cta" in item && item.cta ? (
                  <Link
                    href={item.cta.href}
                    className="mt-4 inline-flex h-11 items-center justify-center rounded-[10px] bg-[#0e62d8] px-6 text-[15px] font-bold text-white transition hover:bg-[#0c4fb0]"
                  >
                    {item.cta.label}
                  </Link>
                ) : null}
              </div>
            ))}
          </div>
        </section>

        <section className="mt-6 rounded-[16px] border border-[#dce3ef] bg-[linear-gradient(92deg,#0e62d8_0%,#0a53bc_100%)] p-6 text-white shadow-[0_12px_30px_rgba(14,98,216,0.3)] md:flex md:items-center md:justify-between">
          <div>
            <h3 className="text-[23px] font-extrabold leading-tight tracking-[-0.02em] md:text-[28px]">Venda seu carro sem custo para começar</h3>
            <p className="mt-2 text-[14px] text-white/90 md:text-[16px]">Publique agora e apareça para compradores reais da sua cidade.</p>
          </div>
          <Link
            href="/planos"
            className="mt-4 inline-flex h-12 items-center justify-center rounded-[10px] bg-white px-7 text-[16px] font-extrabold text-[#0e62d8] transition hover:bg-[#ecf3ff] md:mt-0"
          >
            Anunciar grátis
          </Link>
        </section>
      </div>
    </main>
  );
}
