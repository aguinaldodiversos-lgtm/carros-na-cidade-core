"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";

const banners = ["/images/banner1.jpg", "/images/banner2.jpg"];

export default function Hero() {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true });
  const [selected, setSelected] = useState(0);
  const dots = useMemo(() => banners.map((_, index) => index), []);

  useEffect(() => {
    if (!emblaApi) {
      return;
    }

    const onSelect = () => setSelected(emblaApi.selectedScrollSnap());
    onSelect();
    emblaApi.on("select", onSelect);

    const timer = setInterval(() => emblaApi.scrollNext(), 5000);
    return () => {
      clearInterval(timer);
      emblaApi.off("select", onSelect);
    };
  }, [emblaApi]);

  return (
    <section className="relative mt-4 overflow-hidden rounded-2xl border border-[#dfe4ee]">
      <div className="overflow-hidden" ref={emblaRef}>
        <div className="flex">
          {banners.map((src, index) => (
            <div key={src} className="relative min-w-full">
              <div className="relative h-[360px] md:h-[430px]">
                <Image
                  src={src}
                  alt={`Banner ${index + 1}`}
                  fill
                  priority={index === 0}
                  className="object-cover"
                />
              </div>

              <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(13,23,44,0.76)_0%,rgba(13,23,44,0.2)_45%,rgba(13,23,44,0.08)_100%)]" />

              <div className="absolute inset-0 flex flex-col justify-center px-8 text-white md:px-14">
                <h1 className="max-w-[530px] text-[38px] font-extrabold leading-tight md:text-[56px]">
                  Encontre seu proximo carro na sua regiao
                </h1>
                <p className="mt-3 max-w-[420px] text-[21px] text-white/90 md:text-[31px]">
                  Catalogo regional com filtros inteligentes e descoberta local
                </p>
                <Link
                  href="/anuncios"
                  className="mt-7 inline-flex h-14 w-fit items-center rounded-xl bg-[#0e62d8] px-8 text-[17px] font-bold text-white transition hover:bg-[#0c4fb0]"
                >
                  Pesquisar agora
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="pointer-events-none absolute inset-y-0 right-10 hidden items-center md:flex">
        <button
          type="button"
          className="pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur"
          onClick={() => emblaApi?.scrollNext()}
          aria-label="Proximo banner"
        >
          <svg viewBox="0 0 20 20" className="h-6 w-6" fill="currentColor">
            <path d="m7 4 6 6-6 6" />
          </svg>
        </button>
      </div>

      <div className="absolute inset-x-0 bottom-4 flex justify-center gap-2">
        {dots.map((dot) => (
          <button
            key={dot}
            type="button"
            aria-label={`Ir para o banner ${dot + 1}`}
            className={`h-2.5 w-2.5 rounded-full transition ${
              selected === dot ? "bg-[#10a6f7]" : "bg-white/70"
            }`}
            onClick={() => emblaApi?.scrollTo(dot)}
          />
        ))}
      </div>
    </section>
  );
}
