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
  primaryCtaLabel: string;
  href: string;
};

const slides: Slide[] = [
  {
    id: "home-portal",
    title: "Encontre seu próximo carro em São Paulo",
    subtitle: "Milhares de ofertas esperando por você",
    image: "/images/Hero.png",
    alt: "Banner principal do Carros na Cidade com foco em ofertas locais e anúncio grátis",
    primaryCtaLabel: "Pesquisar agora",
    href: "/anuncios",
  },
  {
    id: "home-oportunidades",
    title: "Oportunidades premium para comprar melhor",
    subtitle: "Modelos selecionados com destaque local e condições competitivas",
    image: "/images/home/banner-local-oportunidades.png",
    alt: "Banner de oportunidades locais do portal Carros na Cidade",
    primaryCtaLabel: "Pesquisar agora",
    href: "/anuncios",
  },
  {
    id: "home-anuncie",
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
    <section className="overflow-hidden rounded-b-[26px] border border-t-0 border-[#e5e8ef] bg-white shadow-[0_22px_48px_rgba(20,30,60,0.09)]">
      <div className="relative h-[310px] w-full overflow-hidden md:h-[380px] lg:h-[410px]">
        <Image
          src={slide.image}
          alt={slide.alt}
          fill
          priority={current === 0}
          sizes="(max-width: 1024px) 100vw, 1200px"
          className="object-cover object-center"
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(7,13,25,0.9)_0%,rgba(11,18,31,0.76)_22%,rgba(16,25,39,0.42)_48%,rgba(18,26,40,0.14)_72%,rgba(18,26,40,0.04)_100%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_22%_28%,rgba(255,255,255,0.12),transparent_26%),linear-gradient(180deg,rgba(255,180,99,0.06),transparent_45%,rgba(0,0,0,0.12)_100%)]" />

        <div className="absolute inset-y-0 left-0 z-20 flex w-full items-center px-7 md:px-10 lg:px-14">
          <div className="max-w-[420px] text-white lg:max-w-[500px]">
            <h1 className="text-[38px] font-black leading-[0.98] tracking-[-0.05em] md:text-[48px] lg:text-[60px]">
              {slide.title}
            </h1>
            <p className="mt-4 max-w-[360px] text-[17px] font-medium leading-7 text-white/82 md:text-[18px]">
              {slide.subtitle}
            </p>

            <Link
              href={slide.href}
              className="mt-8 inline-flex h-[56px] items-center justify-center rounded-[14px] bg-[#0e62d8] px-8 text-[20px] font-extrabold text-white shadow-[0_16px_34px_rgba(14,98,216,0.28)] transition hover:bg-[#0c4fb0]"
            >
              {slide.primaryCtaLabel}
            </Link>
          </div>
        </div>

        <div className="absolute inset-x-0 bottom-0 z-20 flex items-end justify-center gap-3 pb-5 md:pb-6">
          {slides.map((item, index) => (
            <button
              key={item.id}
              type="button"
              aria-label={`Ir para slide ${index + 1}`}
              onClick={() => setCurrent(index)}
              className={`rounded-full transition ${
                current === index ? "h-3 w-3 bg-[#19a0ff]" : "h-2.5 w-2.5 bg-white/70"
              }`}
            />
          ))}
        </div>

        <div className="absolute inset-y-0 left-0 z-20 hidden items-center pl-3 md:flex">
          <button
            type="button"
            onClick={prev}
            aria-label="Slide anterior"
            className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-white/18 bg-black/18 text-white backdrop-blur-md transition hover:bg-white/22"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
        </div>

        <div className="absolute inset-y-0 right-0 z-20 hidden items-center pr-3 md:flex">
          <button
            type="button"
            onClick={next}
            aria-label="Próximo slide"
            className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-white/18 bg-black/18 text-white backdrop-blur-md transition hover:bg-white/22"
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
