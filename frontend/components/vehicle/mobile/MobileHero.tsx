// frontend/components/vehicle/mobile/MobileHero.tsx
"use client";

import Image from "next/image";
import { useMemo, useRef, useState, type TouchEvent } from "react";

import {
  normalizeVehicleGalleryImages,
  VEHICLE_IMAGE_PLACEHOLDER,
} from "@/lib/vehicle/detail-utils";

/**
 * Hero/galeria do detalhe do veículo no mobile (mockup `detalhes.png`):
 *
 *  ┌──────────────────────────────────────────┐
 *  │ [SUV] [Abaixo da FIPE]            [1/8]  │  ← chips/counter sobrepostos
 *  │                                          │
 *  │            <foto grande>                 │  ← swipe horizontal
 *  │                                          │
 *  │                ● ○ ○ ○                   │  ← dots (na parte inferior)
 *  └──────────────────────────────────────────┘
 *
 * Sem thumbnails strip no mobile. Bordas arredondadas, full-width
 * dentro do container do shell.
 */

type MobileHeroProps = {
  images: string[];
  alt: string;
  /** Tag opcional acima da foto (ex.: "SUV", "Sedã"). Renderiza chip claro. */
  bodyTypeChip?: string | null;
  /** Quando o anúncio está abaixo da FIPE, mostra o pill colorido. */
  isBelowFipe?: boolean;
};

export default function MobileHero({ images, alt, bodyTypeChip, isBelowFipe }: MobileHeroProps) {
  const safeImages = useMemo(() => {
    const normalized = normalizeVehicleGalleryImages(images);
    return normalized.length > 0 ? normalized : [VEHICLE_IMAGE_PLACEHOLDER];
  }, [images]);

  const [index, setIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);

  const total = safeImages.length;
  const currentIndex = Math.min(index, total - 1);
  const currentImage = safeImages[currentIndex];

  function goPrev() {
    setIndex((i) => (i === 0 ? total - 1 : i - 1));
  }
  function goNext() {
    setIndex((i) => (i === total - 1 ? 0 : i + 1));
  }

  function handleTouchStart(event: TouchEvent<HTMLDivElement>) {
    touchStartX.current = event.touches[0]?.clientX ?? null;
  }
  function handleTouchEnd(event: TouchEvent<HTMLDivElement>) {
    const start = touchStartX.current;
    touchStartX.current = null;
    if (start == null) return;
    const end = event.changedTouches[0]?.clientX ?? start;
    const delta = end - start;
    if (Math.abs(delta) < 36) return;
    if (delta < 0) goNext();
    else goPrev();
  }

  return (
    <section aria-label="Fotos do veículo" className="px-3">
      <div
        className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-slate-100"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <Image
          key={currentImage}
          src={currentImage}
          alt={alt}
          fill
          sizes="(max-width: 1024px) 100vw, 600px"
          className="object-cover"
          priority
        />

        {/* Chips canto superior esquerdo */}
        <div className="absolute left-3 top-3 flex flex-wrap items-center gap-2">
          {bodyTypeChip ? (
            <span className="inline-flex items-center rounded-full bg-white/95 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-slate-700 shadow-sm">
              {bodyTypeChip}
            </span>
          ) : null}
          {isBelowFipe ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-white/95 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-emerald-700 shadow-sm">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Abaixo da FIPE
            </span>
          ) : null}
        </div>

        {/* Counter canto superior direito */}
        {total > 1 ? (
          <span
            aria-label={`Foto ${currentIndex + 1} de ${total}`}
            className="absolute right-3 top-3 inline-flex items-center rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-bold tabular-nums text-white"
          >
            {currentIndex + 1}/{total}
          </span>
        ) : null}

        {/* Dots inferior centralizados */}
        {total > 1 ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-3 flex items-center justify-center gap-1.5"
          >
            {safeImages.map((src, i) => (
              <span
                key={`${src}-${i}`}
                className={`h-1.5 rounded-full transition-all ${
                  i === currentIndex ? "w-5 bg-white" : "w-1.5 bg-white/60"
                }`}
              />
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
