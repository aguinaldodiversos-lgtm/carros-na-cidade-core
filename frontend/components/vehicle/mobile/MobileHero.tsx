// frontend/components/vehicle/mobile/MobileHero.tsx
"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState, type TouchEvent } from "react";

import VehicleGalleryLightbox from "@/components/vehicle/VehicleGalleryLightbox";
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
  /**
   * Backend marca true quando o anúncio passou por revisão manual após
   * sinal de preço abaixo da FIPE. Renderizamos um chip "Anúncio analisado"
   * — sóbrio, sem cor de garantia. Texto auxiliar via `title` HTML.
   */
  reviewedAfterBelowFipe?: boolean;
};

export default function MobileHero({
  images,
  alt,
  bodyTypeChip,
  isBelowFipe,
  reviewedAfterBelowFipe,
}: MobileHeroProps) {
  const [failedImages, setFailedImages] = useState<string[]>([]);

  const safeImages = useMemo(() => {
    const normalized = normalizeVehicleGalleryImages(images);
    const filtered = normalized.filter((src) => !failedImages.includes(src));
    return filtered.length > 0 ? filtered : [VEHICLE_IMAGE_PLACEHOLDER];
  }, [images, failedImages]);

  const [index, setIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
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

  function handleTouchStart(event: TouchEvent<HTMLButtonElement>) {
    touchStartX.current = event.touches[0]?.clientX ?? null;
  }
  function handleTouchEnd(event: TouchEvent<HTMLButtonElement>) {
    const start = touchStartX.current;
    touchStartX.current = null;
    if (start == null) return;
    const end = event.changedTouches[0]?.clientX ?? start;
    const delta = end - start;
    if (Math.abs(delta) < 36) return;
    if (delta < 0) goNext();
    else goPrev();
  }

  // Fechamento por Esc + lock de scroll quando lightbox aberto
  useEffect(() => {
    if (!lightboxOpen) return undefined;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxOpen(false);
      else if (e.key === "ArrowLeft") goPrev();
      else if (e.key === "ArrowRight") goNext();
    };
    window.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handler);
      document.body.style.overflow = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lightboxOpen]);

  return (
    <section aria-label="Fotos do veículo" className="px-3">
      <button
        type="button"
        onClick={() => setLightboxOpen(true)}
        aria-label={`Expandir foto ${currentIndex + 1} de ${total}`}
        className="relative block aspect-[4/3] w-full overflow-hidden rounded-2xl bg-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-[#0e62d8]"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <Image
          key={currentImage}
          src={currentImage}
          alt={alt}
          fill
          sizes="(max-width: 1024px) 100vw, 680px"
          className="object-contain"
          onError={() =>
            setFailedImages((prev) =>
              prev.includes(currentImage) ? prev : [...prev, currentImage]
            )
          }
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
          {reviewedAfterBelowFipe ? (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-white/95 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-slate-700 shadow-sm"
              title="Este anúncio passou por revisão antes de ser exibido."
            >
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-slate-500" />
              Anúncio analisado
            </span>
          ) : null}
        </div>

        {/* Counter + ícone de expandir canto superior direito */}
        <span
          aria-hidden="true"
          className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-bold tabular-nums text-white"
        >
          <ExpandIcon />
          {total > 1 ? `${currentIndex + 1}/${total}` : "Ampliar"}
        </span>

        {/* Dots inferior centralizados */}
        {total > 1 ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-3 flex items-center justify-center gap-1.5"
          >
            {safeImages.map((src, i) => (
              <span
                key={`${src}-${i}`}
                className={`h-1.5 rounded-full transition-all ${
                  i === currentIndex ? "w-5 bg-white shadow" : "w-1.5 bg-white/70 shadow"
                }`}
              />
            ))}
          </span>
        ) : null}
      </button>

      {lightboxOpen ? (
        <VehicleGalleryLightbox
          images={safeImages}
          alt={alt}
          index={currentIndex}
          onClose={() => setLightboxOpen(false)}
          onNext={goNext}
          onPrev={goPrev}
          onSelect={setIndex}
          onImageError={(src) =>
            setFailedImages((prev) => (prev.includes(src) ? prev : [...prev, src]))
          }
        />
      ) : null}
    </section>
  );
}

function ExpandIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-3 w-3"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
    </svg>
  );
}
