"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type HomeBanner = {
  id: string;
  image: string;
  alt: string;
  title: string;
  subtitle: string;
  ctaLabel: string;
  href: string;
};

const homeBanners: HomeBanner[] = [
  {
    id: "home-principal",
    image: "/images/Hero.png",
    alt: "Banner principal com carro em destaque para compra na cidade",
    title: "Encontre seu próximo carro em São Paulo",
    subtitle: "Milhares de ofertas esperando por você",
    ctaLabel: "Pesquisar agora",
    href: "/anuncios",
  },
  {
    id: "home-banner-oportunidades",
    image: "/images/home/banner-local-oportunidades.png",
    alt: "Banner com oportunidades de carros na cidade",
    title: "Milhares de oportunidades na sua cidade",
    subtitle: "Compre, venda e negocie com quem está perto de você",
    ctaLabel: "Explorar ofertas",
    href: "/anuncios",
  },
  {
    id: "home-banner-anuncie",
    image: "/images/home/banner-local-anuncie.png",
    alt: "Banner para anunciar e vender carro na cidade",
    title: "Encontre e venda seu carro na sua cidade",
    subtitle: "Anuncie grátis, negocie rápido e ganhe destaque local",
    ctaLabel: "Começar anúncio",
    href: "/planos",
  },
];

export function HeroCarousel() {
  const [current, setCurrent] = useState(0);

  const activeBanner = useMemo(() => homeBanners[current] || homeBanners[0], [current]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCurrent((prev) => (prev + 1) % homeBanners.length);
    }, 7000);

    return () => window.clearInterval(timer);
  }, []);

  function nextSlide() {
    setCurrent((prev) => (prev + 1) % homeBanners.length);
  }

  function previousSlide() {
    setCurrent((prev) => (prev - 1 + homeBanners.length) % homeBanners.length);
  }

  return (
    <section className="overflow-hidden rounded-[16px] border border-[#dce3ef] bg-white p-1.5 shadow-[0_10px_30px_rgba(20,30,60,0.08)] md:p-2">
      <div className="relative h-[330px] w-full overflow-hidden rounded-[14px] md:h-[410px] lg:h-[460px]">
        <Image
          src={activeBanner.image}
          alt={activeBanner.alt}
          fill
          priority={current === 0}
          sizes="(max-width: 1024px) 100vw, 1240px"
          className="object-cover object-center"
        />

        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(8,16,35,0.82)_0%,rgba(8,16,35,0.56)_40%,rgba(8,16,35,0.12)_68%,rgba(8,16,35,0.04)_100%)]" />

        <div className="absolute left-0 top-0 z-20 flex h-full w-full items-center px-6 md:px-10">
          <div className="max-w-[600px] text-white">
            <h1 className="text-[30px] font-extrabold leading-[1.06] tracking-[-0.03em] md:text-[44px] lg:text-[50px]">
              {activeBanner.title}
            </h1>
            <p className="mt-4 max-w-[500px] text-[16px] leading-[1.3] text-white/90 md:text-[22px] md:leading-[1.25] lg:text-[24px]">
              {activeBanner.subtitle}
            </p>

            <Link
              href={activeBanner.href}
              className="mt-7 inline-flex h-[54px] items-center justify-center rounded-[11px] bg-[#0e62d8] px-9 text-[18px] font-extrabold text-white shadow-[0_12px_28px_rgba(14,98,216,0.35)] transition hover:bg-[#0c52b9] md:h-[60px] md:text-[18px]"
            >
              {activeBanner.ctaLabel}
            </Link>
          </div>
        </div>

        <div className="absolute left-3 top-0 z-30 hidden h-full items-center md:flex">
          <button
            type="button"
            onClick={previousSlide}
            aria-label="Slide anterior"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-black/24 text-white backdrop-blur transition hover:bg-black/34"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
        </div>

        <div className="absolute right-3 top-0 z-30 hidden h-full items-center md:flex">
          <button
            type="button"
            onClick={nextSlide}
            aria-label="Próximo slide"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-black/24 text-white backdrop-blur transition hover:bg-black/34"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="m9 18 6-6-6-6" />
            </svg>
          </button>
        </div>

        <div className="absolute inset-x-0 bottom-5 z-30 flex items-center justify-center gap-3">
          {homeBanners.map((banner, index) => (
            <button
              key={banner.id}
              type="button"
              aria-label={`Ir para banner ${index + 1}`}
              onClick={() => setCurrent(index)}
              className={`h-3 w-3 rounded-full transition ${
                current === index ? "bg-[#19a3ff]" : "bg-white/65"
              }`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
