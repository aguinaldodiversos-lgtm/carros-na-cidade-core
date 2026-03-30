"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

export type HeroSlide = {
  id: string;
  image: string;
  title: string;
  subtitle: string;
  ctaLabel: string;
  href: string;
};

interface HeroCarouselProps {
  slides: HeroSlide[];
}

export function HeroCarousel({ slides }: HeroCarouselProps) {
  const safeSlides = slides?.length ? slides : [];
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (safeSlides.length <= 1) return;

    const interval = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % safeSlides.length);
    }, 6500);

    return () => window.clearInterval(interval);
  }, [safeSlides.length]);

  useEffect(() => {
    if (activeIndex > safeSlides.length - 1) {
      setActiveIndex(0);
    }
  }, [activeIndex, safeSlides.length]);

  const scrollToSearch = useCallback(() => {
    const el = document.getElementById("home-quick-search");
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  if (!safeSlides.length) return null;

  const goPrev = () => {
    setActiveIndex((current) => (current - 1 + safeSlides.length) % safeSlides.length);
  };

  const goNext = () => {
    setActiveIndex((current) => (current + 1) % safeSlides.length);
  };

  return (
    <div className="relative overflow-hidden rounded-[22px] border border-[#dbe1ec] bg-[#0f172a] shadow-[0_24px_56px_rgba(15,23,42,0.14)]">
      <div className="relative h-[280px] w-full sm:h-[340px] md:h-[400px] lg:h-[440px]">
        {safeSlides.map((slide, index) => {
          const isActive = index === activeIndex;

          return (
            <div
              key={slide.id}
              className={`absolute inset-0 transition-opacity duration-700 ${
                isActive ? "opacity-100" : "pointer-events-none opacity-0"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={slide.image}
                alt=""
                role="presentation"
                className="h-full w-full object-cover object-center"
                loading={index === 0 ? "eager" : "lazy"}
              />

              {/* Leitura: vinheta + faixa central suave */}
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(8,15,35,0.15)_0%,rgba(8,15,35,0.55)_55%,rgba(8,15,35,0.78)_100%)]" />
              <div className="absolute inset-0 bg-gradient-to-t from-[rgba(8,15,35,0.82)] via-[rgba(8,15,35,0.35)] to-[rgba(8,15,35,0.25)]" />

              <div className="absolute inset-0 flex items-center justify-center px-5 sm:px-8 md:px-10">
                <div className="relative z-10 w-full max-w-[720px] text-center">
                  <h1 className="text-[26px] font-extrabold leading-[1.1] tracking-[-0.03em] text-white drop-shadow-[0_2px_24px_rgba(0,0,0,0.35)] sm:text-[34px] md:text-[42px] lg:text-[46px]">
                    {slide.title}
                  </h1>

                  <p className="mx-auto mt-3 max-w-[42ch] text-[15px] font-medium leading-relaxed text-white/92 sm:mt-4 sm:text-[16px] md:text-[17px]">
                    {slide.subtitle}
                  </p>

                  <div className="mt-7 flex justify-center sm:mt-9">
                    {slide.href.startsWith("#") ? (
                      <button
                        type="button"
                        onClick={scrollToSearch}
                        className="inline-flex h-[50px] min-w-[200px] items-center justify-center rounded-[12px] bg-[#0e62d8] px-8 text-[16px] font-bold text-white shadow-[0_14px_32px_rgba(14,98,216,0.35)] transition hover:bg-[#0c4fb0] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white md:h-[52px] md:text-[17px]"
                      >
                        {slide.ctaLabel}
                      </button>
                    ) : (
                      <Link
                        href={slide.href}
                        className="inline-flex h-[50px] min-w-[200px] items-center justify-center rounded-[12px] bg-[#0e62d8] px-8 text-[16px] font-bold text-white shadow-[0_14px_32px_rgba(14,98,216,0.35)] transition hover:bg-[#0c4fb0] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white md:h-[52px] md:text-[17px]"
                      >
                        {slide.ctaLabel}
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        <button
          type="button"
          onClick={goPrev}
          aria-label="Banner anterior"
          className="absolute left-3 top-1/2 z-10 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/22 bg-white/12 text-white backdrop-blur-md transition hover:bg-white/22 md:left-5 md:h-11 md:w-11"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>

        <button
          type="button"
          onClick={goNext}
          aria-label="Próximo banner"
          className="absolute right-3 top-1/2 z-10 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/22 bg-white/12 text-white backdrop-blur-md transition hover:bg-white/22 md:right-5 md:h-11 md:w-11"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m9 6 6 6-6 6" />
          </svg>
        </button>
      </div>

      <div className="absolute bottom-5 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2.5">
        {safeSlides.map((slide, index) => (
          <button
            key={slide.id}
            type="button"
            aria-label={`Ir para banner ${index + 1}`}
            aria-current={index === activeIndex}
            onClick={() => setActiveIndex(index)}
            className={`h-2.5 w-2.5 rounded-full transition md:h-3 md:w-3 ${
              index === activeIndex ? "bg-white shadow-[0_0_0_2px_rgba(255,255,255,0.35)]" : "bg-white/50 hover:bg-white/80"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
