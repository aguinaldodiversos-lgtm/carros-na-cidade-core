// frontend/components/home/sections/PromoCarousel.tsx
"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import {
  IconArrowUpRight,
  IconCalculator,
  IconChevronLeft,
  IconChevronRight,
  IconKey,
  IconPriceTag,
} from "@/components/home/icons";

/**
 * PR G — PromoCarousel reescrito usando primitivos do DS.
 *
 * Mantém 3 cards de proposta de valor (FIPE, Financiamento, Anunciar)
 * mas sem hex hardcoded. Cada card é um <Card variant="elevated"> com
 * <Button variant="link"> apontando para destino canônico.
 *
 * Anti-duplicação:
 *   - "Carros abaixo da FIPE" leva para /comprar?below_fipe=true (não
 *     duplica a tabela FIPE, que tem atalho próprio em HomeShortcuts)
 *   - "Financiamento facilitado" leva para /simulador-financiamento
 *     (mesmo destino do shortcut Simulador — coexistência intencional:
 *     shortcut é micro, esta seção é convite com proposta clara)
 *   - "Anuncie seu carro grátis" leva para /anunciar/novo (CTA principal)
 */

type PromoCard = {
  id: string;
  icon: ReactNode;
  title: string;
  description: string;
  cta: string;
  href: string;
};

const CARDS: PromoCard[] = [
  {
    id: "below-fipe",
    icon: <IconPriceTag className="h-6 w-6" />,
    title: "Carros abaixo da FIPE",
    description: "Encontre oportunidades com preços imperdíveis na sua região.",
    cta: "Ver oportunidades",
    href: "/comprar?below_fipe=true",
  },
  {
    id: "financing",
    icon: <IconCalculator className="h-6 w-6" />,
    title: "Financiamento facilitado",
    description: "Compare, simule e realize seu sonho com as melhores condições.",
    cta: "Simular financiamento",
    href: "/simulador-financiamento",
  },
  {
    id: "announce",
    icon: <IconKey className="h-6 w-6" />,
    title: "Anuncie seu carro grátis",
    description: "Divulgue para milhares de pessoas e venda mais rápido.",
    cta: "Quero anunciar",
    href: "/anunciar/novo",
  },
];

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
    <section className="mx-auto w-full max-w-8xl px-4 pt-5 sm:px-6 sm:pt-8 lg:px-8 lg:pt-10">
      <div className="relative">
        <button
          type="button"
          onClick={() => shift(-1)}
          aria-label="Cards anteriores"
          className="absolute -left-2 top-1/2 z-[2] hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-cnc-line bg-cnc-surface text-primary shadow-card transition hover:bg-primary-soft md:inline-flex"
        >
          <IconChevronLeft className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={() => shift(1)}
          aria-label="Próximos cards"
          className="absolute -right-2 top-1/2 z-[2] hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-cnc-line bg-cnc-surface text-primary shadow-card transition hover:bg-primary-soft md:inline-flex"
        >
          <IconChevronRight className="h-5 w-5" />
        </button>

        <div
          ref={scrollerRef}
          className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] sm:gap-4 md:grid md:grid-cols-3 md:gap-5 md:overflow-visible [&::-webkit-scrollbar]:hidden"
        >
          {CARDS.map((card) => (
            <div key={card.id} className="flex min-w-[82%] snap-center sm:min-w-[85%] md:min-w-0">
              <Card variant="elevated" padding="lg" className="flex h-full w-full flex-col">
                <div className="flex items-start gap-3 sm:gap-4">
                  <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary sm:h-12 sm:w-12">
                    {card.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-base font-extrabold leading-tight text-cnc-text-strong sm:text-lg">
                      {card.title}
                    </h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-cnc-muted">
                      {card.description}
                    </p>
                  </div>
                </div>
                <Link
                  href={card.href}
                  className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-primary transition hover:text-primary-strong"
                >
                  {card.cta}
                  <IconArrowUpRight className="h-4 w-4" />
                </Link>
              </Card>
            </div>
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
                idx === activeIndex ? "w-6 bg-primary" : "w-2 bg-cnc-line-strong"
              }`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
