"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Slide = {
  id: string;
  title: string;
  subtitle: string;
  image: string;
  alt: string;
  eyebrow: string;
  primaryCtaLabel: string;
  href: string;
};

const slides: Slide[] = [
  {
    id: "home-portal",
    title: "O portal local para comprar e vender carros com facilidade",
    subtitle: "Oferta, confiança e presença regional em uma vitrine premium preparada para crescer cidade por cidade.",
    image: "/images/Hero.png",
    alt: "Banner principal do Carros na Cidade com foco em ofertas locais e anúncio grátis",
    eyebrow: "Portal premium",
    primaryCtaLabel: "Explorar ofertas",
    href: "/anuncios",
  },
  {
    id: "home-oportunidades",
    title: "Milhares de oportunidades na sua cidade",
    subtitle: "Campanhas locais, presença regional e descoberta comercial com foco em conversão.",
    image: "/images/home/banner-local-oportunidades.png",
    alt: "Banner de oportunidades locais do portal Carros na Cidade",
    eyebrow: "Campanha local",
    primaryCtaLabel: "Ver oportunidades",
    href: "/anuncios",
  },
  {
    id: "home-anuncie",
    title: "Anuncie grátis e venda seu carro com mais visibilidade",
    subtitle: "Jornada comercial pronta para campanhas, eventos e ativações locais de lojistas.",
    image: "/images/home/banner-local-anuncie.png",
    alt: "Banner para anunciar carro grátis no portal Carros na Cidade",
    eyebrow: "Venda rápida",
    primaryCtaLabel: "Começar meu anúncio",
    href: "/planos",
  },
];

export function HeroCarousel() {
  const [current, setCurrent] = useState(0);

  const slide = useMemo(() => slides[current] || slides[0], [current]);

  function next() {
    setCurrent((value) => (value + 1) % slides.length);
  }

  function prev() {
    setCurrent((value) => (value - 1 + slides.length) % slides.length);
  }

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCurrent((value) => (value + 1) % slides.length);
    }, 6500);

    return () => window.clearInterval(timer);
  }, []);

  return (
    <section className="overflow-hidden rounded-[22px] border border-[#d9dfeb] bg-white shadow-[0_16px_36px_rgba(15,23,42,0.08)]">
      <div className="relative aspect-[16/9] min-h-[235px] w-full overflow-hidden md:min-h-[360px]">
        <Link href={slide.href} aria-label={slide.title} className="absolute inset-0 z-10">
          <span className="sr-only">{slide.title}</span>
        </Link>
        <Image
          src={slide.image}
          alt={slide.alt}
          fill
          priority={current === 0}
          sizes="(max-width: 1024px) 100vw, 1200px"
          className="object-cover"
        />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-[linear-gradient(180deg,rgba(10,20,40,0.16)_0%,rgba(10,20,40,0)_100%)]" />

        <div className="absolute inset-x-0 bottom-0 z-20 flex items-end justify-between gap-4 p-4 md:p-6">
          <div className="rounded-full bg-white/88 px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-[0.18em] text-[#22314d] shadow-[0_8px_18px_rgba(15,23,42,0.12)] backdrop-blur">
            {slide.eyebrow}
          </div>
          <Link
            href={slide.href}
            className="inline-flex h-11 items-center justify-center rounded-xl bg-[#0e62d8] px-5 text-sm font-bold text-white shadow-[0_8px_22px_rgba(14,98,216,0.28)] transition hover:bg-[#0c4fb0]"
          >
            {slide.primaryCtaLabel}
          </Link>
        </div>

        <button
          type="button"
          onClick={prev}
          aria-label="Slide anterior"
          className="absolute left-3 top-1/2 z-20 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-[#2b3650] shadow-[0_10px_22px_rgba(15,23,42,0.18)] transition hover:bg-white md:left-5 md:h-11 md:w-11"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>

        <button
          type="button"
          onClick={next}
          aria-label="Próximo slide"
          className="absolute right-3 top-1/2 z-20 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-[#2b3650] shadow-[0_10px_22px_rgba(15,23,42,0.18)] transition hover:bg-white md:right-5 md:h-11 md:w-11"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m9 18 6-6-6-6" />
          </svg>
        </button>

        <div className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 md:bottom-6">
          {slides.map((item, index) => (
            <button
              key={item.id}
              type="button"
              aria-label={`Ir para slide ${index + 1}`}
              onClick={() => setCurrent(index)}
              className={`h-3 w-3 rounded-full transition ${
                current === index ? "bg-[#0e62d8]" : "bg-white/70"
              }`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
