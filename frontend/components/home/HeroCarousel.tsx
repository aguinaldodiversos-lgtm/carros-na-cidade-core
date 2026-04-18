"use client";

import { useEffect, useState } from "react";

export type HeroSlide = {
  id: string;
  image: string;
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

  if (!safeSlides.length) return null;

  const goPrev = () => {
    setActiveIndex((current) => (current - 1 + safeSlides.length) % safeSlides.length);
  };

  const goNext = () => {
    setActiveIndex((current) => (current + 1) % safeSlides.length);
  };

  return (
    <div className="relative z-0 overflow-hidden rounded-[22px] border border-[#dbe1ec] bg-[#f4f6fa] shadow-[0_20px_48px_rgba(15,23,42,0.1)]">
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
                decoding={index === 0 ? "sync" : "async"}
              />
            </div>
          );
        })}

        <button
          type="button"
          onClick={goPrev}
          aria-label="Banner anterior"
          className="absolute left-3 top-1/2 z-[2] inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-black/10 bg-white/90 text-[#1b2436] shadow-md backdrop-blur-sm transition hover:bg-white md:left-5 md:h-11 md:w-11"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>

        <button
          type="button"
          onClick={goNext}
          aria-label="Próximo banner"
          className="absolute right-3 top-1/2 z-[2] inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-black/10 bg-white/90 text-[#1b2436] shadow-md backdrop-blur-sm transition hover:bg-white md:right-5 md:h-11 md:w-11"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="m9 6 6 6-6 6" />
          </svg>
        </button>
      </div>

      <div className="absolute bottom-5 left-1/2 z-[2] flex -translate-x-1/2 items-center gap-2.5">
        {safeSlides.map((slide, index) => (
          <button
            key={slide.id}
            type="button"
            aria-label={`Ir para banner ${index + 1}`}
            aria-current={index === activeIndex}
            onClick={() => setActiveIndex(index)}
            className={`h-2.5 w-2.5 rounded-full transition md:h-3 md:w-3 ${
              index === activeIndex
                ? "bg-[#0e62d8] shadow-[0_0_0_2px_rgba(14,98,216,0.25)]"
                : "bg-black/25 hover:bg-black/40"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
