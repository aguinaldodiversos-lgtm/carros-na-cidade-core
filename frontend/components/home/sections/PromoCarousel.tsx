"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";

import {
  IconArrowUpRight,
  IconCalculator,
  IconChevronLeft,
  IconChevronRight,
  IconKey,
  IconPriceTag,
} from "@/components/home/icons";

type PromoCard = {
  id: string;
  icon: ReactNode;
  title: string;
  description: string;
  cta: string;
  href: string;
  accent: "lilac" | "soft" | "strong";
};

const CARDS: PromoCard[] = [
  {
    id: "below-fipe",
    icon: <IconPriceTag className="h-7 w-7" />,
    title: "Carros abaixo da FIPE",
    description:
      "Encontre oportunidades com preços imperdíveis na sua região.",
    cta: "Ver oportunidades",
    href: "/comprar?below_fipe=true",
    accent: "lilac",
  },
  {
    id: "financing",
    icon: <IconCalculator className="h-7 w-7" />,
    title: "Financiamento facilitado",
    description:
      "Compare, simule e realize seu sonho com as melhores condições.",
    cta: "Simular financiamento",
    href: "/financiamento",
    accent: "soft",
  },
  {
    id: "announce",
    icon: <IconKey className="h-7 w-7" />,
    title: "Anuncie seu carro grátis",
    description:
      "Divulgue para milhares de pessoas e venda mais rápido.",
    cta: "Quero anunciar",
    href: "/anunciar/novo",
    accent: "strong",
  },
];

function accentClasses(accent: PromoCard["accent"]) {
  switch (accent) {
    case "lilac":
      return "bg-[#eef1f9]";
    case "soft":
      return "bg-[#e5e9f3]";
    case "strong":
      return "bg-[#dbe0ee]";
  }
}

export function PromoCarousel() {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const onScroll = () => {
      const w = el.clientWidth;
      if (w <= 0) return;
      const idx = Math.round(el.scrollLeft / w);
      setActiveIndex(Math.min(CARDS.length - 1, Math.max(0, idx)));
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  const goTo = (idx: number) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTo({ left: idx * el.clientWidth, behavior: "smooth" });
  };

  const shift = (dir: -1 | 1) => {
    const next = Math.min(CARDS.length - 1, Math.max(0, activeIndex + dir));
    goTo(next);
  };

  return (
    <section className="mx-auto w-full max-w-[1240px] px-4 pt-5 sm:px-6 sm:pt-8 lg:px-8 lg:pt-10">
      <div className="relative">
        <button
          type="button"
          onClick={() => shift(-1)}
          aria-label="Cards anteriores"
          className="absolute -left-2 top-1/2 z-[2] hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-[#e7e8f1] bg-white text-[#2d3a9c] shadow-md transition hover:bg-[#eef1f9] md:inline-flex"
        >
          <IconChevronLeft className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={() => shift(1)}
          aria-label="Próximos cards"
          className="absolute -right-2 top-1/2 z-[2] hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-[#e7e8f1] bg-white text-[#2d3a9c] shadow-md transition hover:bg-[#eef1f9] md:inline-flex"
        >
          <IconChevronRight className="h-5 w-5" />
        </button>

        <div
          ref={scrollerRef}
          className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] sm:gap-4 md:grid md:grid-cols-3 md:gap-5 md:overflow-visible [&::-webkit-scrollbar]:hidden"
        >
          {CARDS.map((card) => (
            <article
              key={card.id}
              className={`${accentClasses(card.accent)} flex min-w-[82%] snap-center flex-col justify-between rounded-[14px] border border-[#dbe0ee] px-4 py-4 shadow-[0_4px_16px_rgba(45,58,156,0.06)] sm:min-w-[85%] sm:rounded-[18px] sm:px-5 sm:py-6 md:min-w-0 md:px-6 md:py-7`}
            >
              <div className="flex items-start gap-3 sm:gap-4">
                <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-white/80 text-[#2d3a9c] shadow-[0_3px_10px_rgba(45,58,156,0.12)] sm:h-12 sm:w-12 sm:rounded-[14px]">
                  {card.icon}
                </div>
                <div className="min-w-0">
                  <h3 className="text-[15px] font-extrabold leading-tight text-[#1a1f36] sm:text-[17px] md:text-[18px]">
                    {card.title}
                  </h3>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-[#5b6079] sm:mt-1.5 sm:text-[13.5px]">
                    {card.description}
                  </p>
                </div>
              </div>
              <Link
                href={card.href}
                className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] font-bold text-[#2d3a9c] transition hover:text-[#1f2b7e] sm:mt-5 sm:text-[13.5px]"
              >
                {card.cta}
                <IconArrowUpRight className="h-4 w-4" />
              </Link>
            </article>
          ))}
        </div>

        <div className="mt-3 flex items-center justify-center gap-2 sm:mt-4 md:hidden">
          {CARDS.map((card, idx) => (
            <button
              key={card.id}
              type="button"
              onClick={() => goTo(idx)}
              aria-label={`Ir para card ${idx + 1}`}
              className={`h-2 rounded-full transition ${
                idx === activeIndex ? "w-6 bg-[#2d3a9c]" : "w-2 bg-[#b8c2e0]"
              }`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
