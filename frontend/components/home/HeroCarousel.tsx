"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type HeroSlide = {
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

function normalizeSlides(slides: HeroSlide[]): HeroSlide[] {
  return slides.map((slide, index) => ({
    ...slide,
    image: index % 2 === 0 ? "/images/banner1.jpg" : "/images/banner2.jpg",
  }));
}

export function HeroCarousel({ slides }: HeroCarouselProps) {
  const safeSlides = useMemo(() => normalizeSlides(slides || []), [slides]);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (!safeSlides.length) return;

    const interval = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % safeSlides.length);
    }, 6000);

    return () => window.clearInterval(interval);
  }, [safeSlides.length]);

  useEffect(() => {
    if (activeIndex > safeSlides.length - 1) {
      setActiveIndex(0);
    }
  }, [activeIndex, safeSlides.length]);

  if (!safeSlides.length) return null;

  const goPrev = () => {
    setActiveIndex((current) => (current - 1 + safeSlides.length) % safeSlides.length);
  };

  const goNext = () => {
    setActiveIndex((current) => (current + 1) % safeSlides.length);
  };

  return (
    <div className="relative overflow-hidden rounded-[22px] border border-[#dbe1ec] bg-[#0f172a] shadow-[0_24px_60px_rgba(15,23,42,0.15)]">
      <div className="relative h-[260px] w-full md:h-[420px]">
        {safeSlides.map((slide, index) => {
          const isActive = index === activeIndex;

          return (
            <div
              key={slide.id}
              className={`absolute inset-0 transition-opacity duration-700 ${
                isActive ? "opacity-100" : "pointer-events-none opacity-0"
              }`}
            >
              <img
                src={slide.image}
                alt={slide.title}
                className="h-full w-full object-cover"
                loading={index === 0 ? "eager" : "lazy"}
              />

              <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(5,13,30,0.72)_0%,rgba(5,13,30,0.34)_38%,rgba(5,13,30,0.08)_100%)]" />

              <div className="absolute inset-0 flex items-center">
                <div className="w-full px-6 md:px-10 lg:px-12">
                  <div className="max-w-[460px]">
                    <h1 className="text-[32px] font-extrabold leading-[1.06] tracking-[-0.035em] text-white md:text-[52px] md:leading-[1.05]">
                      {slide.title}
                    </h1>

                    <p className="mt-4 max-w-[42ch] text-[15px] font-medium leading-relaxed text-white/85 md:mt-5 md:text-[18px] md:leading-relaxed">
                      {slide.subtitle}
                    </p>

                    <div className="mt-7 md:mt-9">
                      <Link
                        href={slide.href}
                        className="inline-flex h-[54px] items-center justify-center rounded-[12px] bg-[#0e62d8] px-8 text-[18px] font-bold text-white shadow-[0_14px_28px_rgba(14,98,216,0.28)] transition hover:bg-[#0c4fb0]"
                      >
                        {slide.ctaLabel}
                      </Link>
                    </div>
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
          className="absolute left-4 top-1/2 z-10 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/12 text-white backdrop-blur transition hover:bg-white/20"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>

        <button
          type="button"
          onClick={goNext}
          aria-label="Próximo banner"
          className="absolute right-4 top-1/2 z-10 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/12 text-white backdrop-blur transition hover:bg-white/20"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m9 6 6 6-6 6" />
          </svg>
        </button>
      </div>

      <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2">
        {safeSlides.map((slide, index) => (
          <button
            key={slide.id}
            type="button"
            aria-label={`Ir para banner ${index + 1}`}
            onClick={() => setActiveIndex(index)}
            className={`h-3 w-3 rounded-full transition ${
              index === activeIndex ? "bg-[#15a0ff]" : "bg-white/70"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
