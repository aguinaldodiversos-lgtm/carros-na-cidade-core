"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Slide = {
  title: string;
  subtitle: string;
  image: string;
  city: string;
  href: string;
};

const slides: Slide[] = [
  {
    title: "Encontre seu próximo carro em São Paulo",
    subtitle: "Milhares de ofertas esperando por você",
    image: "/images/hero.jpeg",
    city: "São Paulo",
    href: "/comprar?city_slug=sao-paulo-sp",
  },
  {
    title: "Ofertas em destaque com foco regional",
    subtitle: "Veículos selecionados para alta conversão",
    image: "/images/banner1.jpg",
    city: "Campinas",
    href: "/cidade/campinas-sp/oportunidades",
  },
  {
    title: "Carros usados e seminovos na sua cidade",
    subtitle: "Navegação premium para comprar com segurança",
    image: "/images/banner2.jpg",
    city: "Atibaia",
    href: "/cidade/atibaia-sp",
  },
  {
    title: "Oportunidades abaixo da FIPE em alta",
    subtitle: "Descubra anúncios estratégicos perto de você",
    image: "/images/corolla.jpeg",
    city: "Sorocaba",
    href: "/cidade/sorocaba-sp/abaixo-da-fipe",
  },
];

const AUTO_ROTATE_MS = 6000;

export function HeroCarousel() {
  const [current, setCurrent] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const slide = useMemo(() => slides[current] || slides[0], [current]);

  const startTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCurrent((c) => (c + 1) % slides.length);
    }, AUTO_ROTATE_MS);
  }, []);

  useEffect(() => {
    startTimer();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [startTimer]);

  function next() {
    setCurrent((c) => (c + 1) % slides.length);
    startTimer();
  }

  function prev() {
    setCurrent((c) => (c - 1 + slides.length) % slides.length);
    startTimer();
  }

  function goTo(index: number) {
    setCurrent(index);
    startTimer();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowLeft") prev();
    if (e.key === "ArrowRight") next();
  }

  return (
    <section
      role="region"
      aria-roledescription="carrossel"
      aria-label="Destaques do portal"
      onKeyDown={handleKeyDown}
      tabIndex={0}
      className="overflow-hidden rounded-[28px] border border-[#dfe4ef] bg-white shadow-[0_16px_48px_rgba(15,23,42,0.10)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0e62d8]/60"
    >
      <div
        className="relative aspect-[21/7] min-h-[280px] w-full overflow-hidden md:min-h-[420px]"
      >
        {/* All slide images rendered for smooth fade transition */}
        {slides.map((s, index) => (
          <div
            key={index}
            className={`absolute inset-0 transition-opacity duration-700 ease-in-out ${
              current === index ? "opacity-100" : "opacity-0"
            }`}
            aria-hidden={current !== index}
          >
            <Image
              src={s.image}
              alt={s.title}
              fill
              priority={index === 0}
              className="object-cover"
            />
          </div>
        ))}

        {/* Gradient overlay */}
        <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(90deg,rgba(10,21,40,0.88)_0%,rgba(10,21,40,0.42)_45%,rgba(10,21,40,0.08)_100%)]" />

        {/* Content */}
        <div
          className="absolute inset-0 flex items-center"
          aria-live="polite"
          aria-atomic="true"
        >
          <div className="max-w-3xl px-6 py-8 md:px-12">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.20em] text-white/90 backdrop-blur-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-[#19a8ff]" aria-hidden="true" />
              {slide.city}
            </span>

            <h1 className="mt-4 max-w-2xl text-3xl font-extrabold leading-[1.12] tracking-[-0.02em] text-white md:text-5xl lg:text-[3.5rem]">
              {slide.title}
            </h1>

            <p className="mt-3 max-w-lg text-base font-medium leading-relaxed text-white/80 md:text-xl">
              {slide.subtitle}
            </p>

            <div className="mt-7">
              <Link
                href={slide.href}
                className="group inline-flex h-[52px] items-center justify-center gap-2 rounded-xl bg-[#0e62d8] px-8 text-[15px] font-bold tracking-wide text-white shadow-[0_8px_24px_rgba(14,98,216,0.40)] transition-all duration-200 hover:scale-[1.03] hover:bg-[#0c52c0] hover:shadow-[0_12px_32px_rgba(14,98,216,0.55)] active:scale-[0.97]"
              >
                Pesquisar agora
                <svg
                  viewBox="0 0 24 24"
                  className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  aria-hidden="true"
                >
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </Link>
            </div>
          </div>
        </div>

        {/* Prev button */}
        <button
          type="button"
          onClick={prev}
          aria-label="Slide anterior"
          className="absolute left-4 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-black/25 text-white backdrop-blur-sm transition-all duration-200 hover:scale-105 hover:bg-black/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>

        {/* Next button */}
        <button
          type="button"
          onClick={next}
          aria-label="Próximo slide"
          className="absolute right-4 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-black/25 text-white backdrop-blur-sm transition-all duration-200 hover:scale-105 hover:bg-black/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="m9 18 6-6-6-6" />
          </svg>
        </button>

        {/* Dots */}
        <div
          className="absolute bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-2"
          role="tablist"
          aria-label="Navegação de slides"
        >
          {slides.map((_, index) => (
            <button
              key={index}
              type="button"
              role="tab"
              aria-label={`Ir para slide ${index + 1} de ${slides.length}`}
              aria-selected={current === index}
              onClick={() => goTo(index)}
              className={`rounded-full transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 ${
                current === index
                  ? "h-2.5 w-8 bg-[#19a8ff] shadow-[0_0_8px_rgba(25,168,255,0.65)]"
                  : "h-2.5 w-2.5 bg-white/50 hover:bg-white/75"
              }`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
