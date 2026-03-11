"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";

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

export function HeroCarousel() {
  const [current, setCurrent] = useState(0);

  const slide = useMemo(() => slides[current] || slides[0], [current]);

  function next() {
    setCurrent((value) => (value + 1) % slides.length);
  }

  function prev() {
    setCurrent((value) => (value - 1 + slides.length) % slides.length);
  }

  return (
    <section className="overflow-hidden rounded-[28px] border border-[#dfe4ef] bg-white shadow-[0_16px_36px_rgba(15,23,42,0.08)]">
      <div className="relative aspect-[21/7] min-h-[280px] w-full overflow-hidden md:min-h-[420px]">
        <Image src={slide.image} alt={slide.title} fill priority className="object-cover" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(10,21,40,0.82)_0%,rgba(10,21,40,0.38)_42%,rgba(10,21,40,0.10)_100%)]" />

        <div className="absolute inset-0 flex items-center">
          <div className="max-w-3xl px-6 py-8 md:px-10">
            <span className="inline-flex rounded-full bg-white/12 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-white/90 backdrop-blur">
              {slide.city}
            </span>

            <h1 className="mt-4 max-w-2xl text-4xl font-extrabold leading-tight tracking-tight text-white md:text-6xl">
              {slide.title}
            </h1>

            <p className="mt-4 max-w-xl text-lg text-white/85 md:text-2xl">
              {slide.subtitle}
            </p>

            <div className="mt-8">
              <Link
                href={slide.href}
                className="inline-flex h-14 items-center justify-center rounded-2xl bg-[#0e62d8] px-7 text-xl font-bold text-white shadow-[0_10px_28px_rgba(14,98,216,0.35)] transition hover:bg-[#0c4fb0]"
              >
                Pesquisar agora
              </Link>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={prev}
          aria-label="Slide anterior"
          className="absolute left-4 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/20 text-white backdrop-blur transition hover:bg-black/35"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>

        <button
          type="button"
          onClick={next}
          aria-label="Próximo slide"
          className="absolute right-4 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/20 text-white backdrop-blur transition hover:bg-black/35"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m9 18 6-6-6-6" />
          </svg>
        </button>

        <div className="absolute bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-2">
          {slides.map((_, index) => (
            <button
              key={index}
              type="button"
              aria-label={`Ir para slide ${index + 1}`}
              onClick={() => setCurrent(index)}
              className={`h-3 w-3 rounded-full transition ${
                current === index ? "bg-[#19a8ff]" : "bg-white/65"
              }`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
