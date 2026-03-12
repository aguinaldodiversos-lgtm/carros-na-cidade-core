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

function formatStat(value?: number | string) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric.toLocaleString("pt-BR") : "0";
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
      className="inline-flex h-12 w-12 items-center justify-center rounded-2xl"
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
  const highlightAds = (data.highlightAds || []).slice(0, 8);
  const opportunityAds = (data.opportunityAds || []).slice(0, 8);
  const authoritySignals = [
    `+${formatStat(data.stats.total_ads)} anúncios ativos`,
    `${formatStat(data.stats.total_cities)} cidades em operação`,
    `${formatStat(data.stats.total_advertisers)} anunciantes e lojistas`,
  ];

  return (
    <main className="min-h-screen bg-[#f3f4f7]">
      <div className="mx-auto max-w-7xl px-4 py-5 md:px-6 md:py-7">
        <HeroCarousel />

        <div className="relative z-10 -mt-4 px-1 md:-mt-6 md:px-6">
          <HomeSearchSection />
        </div>

        <section className="mt-7 rounded-[18px] border border-[#dfe4ef] bg-white px-4 py-4 shadow-[0_12px_28px_rgba(15,23,42,0.05)] md:px-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#72809a]">
                Presença local e confiança
              </p>
              <h2 className="mt-1 text-[22px] font-extrabold tracking-tight text-[#1d2538] md:text-[24px]">
                O melhor lugar para encontrar e anunciar carros em {regionalFocus}
              </h2>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href="/anuncios"
                className="inline-flex h-10 items-center justify-center rounded-xl bg-[#0e62d8] px-4 text-sm font-extrabold text-white transition hover:bg-[#0c4fb0]"
              >
                Explorar ofertas
              </Link>
              <Link
                href="/planos"
                className="inline-flex h-10 items-center justify-center rounded-xl border border-[#d8deea] px-4 text-sm font-extrabold text-[#31405d] transition hover:bg-[#f8fafc]"
              >
                Começar meu anúncio
              </Link>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {authoritySignals.map((item) => (
              <span
                key={item}
                className="inline-flex items-center rounded-full bg-[#f4f7fc] px-3 py-1.5 text-xs font-bold text-[#50607d]"
              >
                {item}
              </span>
            ))}
          </div>
        </section>

        <section className="mt-8">
          <div className="mb-4">
            <h2 className="text-[34px] font-extrabold tracking-tight text-[#1d2538]">
              Destaques em {regionalFocus}
            </h2>
            <p className="mt-1 text-[15px] text-[#6b7488]">
              Veículos patrocinados com maior visibilidade e acabamento premium.
            </p>
          </div>

          <AdGrid items={highlightAds} priorityFirstRow priorityCount={4} variant="home" />
        </section>

        <section className="mt-8">
          <div className="mb-4">
            <h2 className="text-[34px] font-extrabold tracking-tight text-[#1d2538]">
              Oportunidades abaixo da FIPE
            </h2>
            <p className="mt-1 text-[15px] text-[#6b7488]">
              Ofertas com preço abaixo do valor de mercado para compra mais inteligente.
            </p>
          </div>

          <AdGrid items={opportunityAds} priorityCount={4} variant="home" />
        </section>

        <section className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {benefits.map((item) => (
            <div
              key={item.title}
              className="rounded-[18px] border border-[#dfe4ef] bg-white p-5 shadow-[0_10px_28px_rgba(15,23,42,0.05)]"
            >
              <div className="flex items-start gap-4">
                <BenefitIcon>{item.icon}</BenefitIcon>

                <div className="min-w-0">
                  <h3 className="text-[18px] font-black text-[#1d2538]">{item.title}</h3>
                  <p className="mt-1 text-[15px] leading-6 text-[#6b7488]">{item.text}</p>
                </div>
              </div>

              {"cta" in item && item.cta ? (
                <Link
                  href={item.cta.href}
                  className="mt-5 inline-flex h-11 items-center justify-center rounded-xl bg-[#0e62d8] px-5 text-[16px] font-bold text-white transition hover:bg-[#0c4fb0]"
                >
                  {item.cta.label}
                </Link>
              ) : null}
            </div>
          ))}
        </section>

        <section className="mt-8 overflow-hidden rounded-[20px] bg-[linear-gradient(120deg,#123b82_0%,#0e62d8_58%,#2a92ff_100%)] p-6 text-white shadow-[0_18px_40px_rgba(14,98,216,0.22)] md:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-white/80">
                Anuncie grátis
              </p>
              <h2 className="mt-2 text-[34px] font-extrabold tracking-tight md:text-[42px]">
                Venda mais rápido com presença local e visibilidade premium
              </h2>
              <p className="mt-3 max-w-2xl text-[16px] leading-7 text-white/85">
                Cadastre seu veículo ou estoque, participe das campanhas do portal, apareça nos destaques e receba
                contatos qualificados na sua cidade.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                href="/planos"
                className="inline-flex h-12 items-center justify-center rounded-xl bg-white px-6 text-[15px] font-extrabold text-[#0e62d8] transition hover:bg-[#f4f8ff]"
              >
                Criar meu anúncio
              </Link>
              <Link
                href="/anuncios"
                className="inline-flex h-12 items-center justify-center rounded-xl border border-white/35 px-6 text-[15px] font-extrabold text-white transition hover:bg-white/10"
              >
                Ver ofertas da cidade
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
