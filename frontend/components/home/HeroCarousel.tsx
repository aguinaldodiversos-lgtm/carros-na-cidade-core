"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Slide = {
  id: string;
  city: string;
  title: string;
  subtitle: string;
  image: string;
  alt: string;
  primaryCtaLabel: string;
  href: string;
};

const slides: Slide[] = [
  {
    id: "home-portal",
    city: "São Paulo",
    title: "Encontre seu próximo carro em São Paulo",
    subtitle: "Milhares de ofertas esperando por você",
    image: "/images/Hero.png",
    alt: "Banner principal do Carros na Cidade com foco em ofertas locais e anúncio grátis",
    primaryCtaLabel: "Pesquisar agora",
    href: "/anuncios",
  },
  {
    id: "home-oportunidades",
    city: "São Paulo",
    title: "Oportunidades premium para comprar melhor",
    subtitle: "Encontre veículos com preço competitivo e alta visibilidade na sua cidade",
    image: "/images/home/banner-local-oportunidades.png",
    alt: "Banner de oportunidades locais do portal Carros na Cidade",
    primaryCtaLabel: "Pesquisar agora",
    href: "/anuncios",
  },
  {
    id: "home-anuncie",
    city: "São Paulo",
    title: "Anuncie seu veículo e ganhe destaque local",
    subtitle: "Venda com mais velocidade em uma vitrine premium pronta para compradores reais",
    image: "/images/home/banner-local-anuncie.png",
    alt: "Banner para anunciar carro grátis no portal Carros na Cidade",
    primaryCtaLabel: "Pesquisar agora",
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
    <section className="overflow-hidden rounded-[14px] border border-[#dfe4ec] bg-white shadow-[0_2px_18px_rgba(20,30,60,0.06)]">
      <div className="relative h-[228px] w-full overflow-hidden md:h-[260px] lg:h-[286px]">
        <Image
          src={slide.image}
          alt={slide.alt}
          fill
          priority={current === 0}
          sizes="(max-width: 1024px) 100vw, 1200px"
          className="object-cover object-center"
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(12,18,31,0.78)_0%,rgba(12,18,31,0.42)_42%,rgba(12,18,31,0.08)_72%,rgba(12,18,31,0.04)_100%)]" />

        <div className="absolute inset-y-0 left-0 z-20 flex w-full items-center px-7 md:px-8 lg:px-9">
          <div className="max-w-[360px] text-white">
            <div className="text-[13px] font-semibold text-white/88">{slide.city}</div>
            <h1 className="mt-3 text-[28px] font-extrabold leading-[1.1] tracking-[-0.03em] md:text-[34px]">
              {slide.title}
            </h1>
            <p className="mt-3 text-[16px] text-white/84">{slide.subtitle}</p>

            <Link
              href={slide.href}
              className="mt-6 inline-flex h-[46px] items-center justify-center rounded-[10px] bg-[#0e62d8] px-6 text-[15px] font-bold text-white shadow-[0_12px_24px_rgba(14,98,216,0.24)] transition hover:bg-[#0c4fb0]"
            >
              {slide.primaryCtaLabel}
            </Link>
          </div>
        </div>

        <div className="absolute inset-x-0 bottom-0 z-20 flex items-end justify-center gap-2 pb-8 md:pb-6">
          {slides.map((item, index) => (
            <button
              key={item.id}
              type="button"
              aria-label={`Ir para slide ${index + 1}`}
              onClick={() => setCurrent(index)}
              className={`h-2.5 w-2.5 rounded-full transition ${
                current === index ? "bg-[#0e62d8]" : "bg-white/74"
              }`}
            />
          ))}
        </div>

        <div className="absolute inset-y-0 left-0 z-20 hidden items-center pl-3 md:flex">
          <button
            type="button"
            onClick={prev}
            aria-label="Slide anterior"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/16 text-white backdrop-blur transition hover:bg-white/24"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
        </div>

        <div className="absolute inset-y-0 right-0 z-20 hidden items-center pr-3 md:flex">
          <Link
            href={slide.href}
            aria-label={`Acessar ${slide.title}`}
            className="hidden"
          >
            {slide.title}
          </Link>
          <button
            type="button"
            onClick={next}
            aria-label="Próximo slide"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/16 text-white backdrop-blur transition hover:bg-white/24"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m9 18 6-6-6-6" />
            </svg>
          </button>
        </div>
      </div>
    </section>
  );
}
