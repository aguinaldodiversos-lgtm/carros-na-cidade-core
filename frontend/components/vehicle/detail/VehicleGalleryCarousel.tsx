// frontend/components/vehicle/detail/VehicleGalleryCarousel.tsx
"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState, type TouchEvent } from "react";

import VehicleGalleryLightbox from "@/components/vehicle/VehicleGalleryLightbox";
import {
  normalizeVehicleGalleryImages,
  VEHICLE_IMAGE_PLACEHOLDER,
} from "@/lib/vehicle/detail-utils";

/**
 * Galeria full-width do topo da página de detalhe (redesign detalhes.png):
 * foto grande com setas prev/next, contador e miniaturas. Clique abre o
 * lightbox (zoom) reaproveitando `VehicleGalleryLightbox`.
 *
 * Performance/LCP: só a 1ª foto entra com `priority` (Next emite
 * fetchpriority="high" e desliga o lazy). As demais e as miniaturas ficam
 * com lazy load nativo. `aspect-*` fixo evita CLS.
 */
type VehicleGalleryCarouselProps = {
  images: string[];
  alt: string;
  bodyTypeChip?: string | null;
  isBelowFipe?: boolean;
  reviewedAfterBelowFipe?: boolean;
};

export default function VehicleGalleryCarousel({
  images,
  alt,
  bodyTypeChip,
  isBelowFipe,
  reviewedAfterBelowFipe,
}: VehicleGalleryCarouselProps) {
  const [failedImages, setFailedImages] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const touchStartX = useRef<number | null>(null);

  const safeImages = useMemo(() => {
    const normalized = normalizeVehicleGalleryImages(images).filter(
      (src) => !failedImages.includes(src)
    );
    return normalized.length > 0 ? normalized : [VEHICLE_IMAGE_PLACEHOLDER];
  }, [images, failedImages]);

  const total = safeImages.length;
  const currentIndex = Math.min(index, total - 1);
  const isPlaceholderOnly =
    total === 1 && safeImages[0] === VEHICLE_IMAGE_PLACEHOLDER && images.length === 0;

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

  function handleImageError(src: string) {
    if (src === VEHICLE_IMAGE_PLACEHOLDER) return;
    setFailedImages((prev) => (prev.includes(src) ? prev : [...prev, src]));
  }

  return (
    <section aria-label="Fotos do veículo" data-testid="vehicle-gallery">
      <div
        className="relative aspect-[16/9] w-full overflow-hidden bg-slate-100 sm:rounded-2xl md:aspect-[21/9]"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <button
          type="button"
          onClick={() => !isPlaceholderOnly && setLightboxOpen(true)}
          aria-label={
            isPlaceholderOnly
              ? "Sem fotos disponíveis"
              : `Ampliar foto ${currentIndex + 1} de ${total}`
          }
          className="relative block h-full w-full"
        >
          <Image
            key={safeImages[currentIndex]}
            src={safeImages[currentIndex]}
            alt={total > 1 ? `${alt} — foto ${currentIndex + 1} de ${total}` : alt}
            fill
            sizes="(max-width: 1024px) 100vw, 1200px"
            className="object-cover"
            // 1ª foto = LCP (priority ⇒ fetchpriority=high, sem lazy). Demais lazy.
            priority={currentIndex === 0}
            onError={() => handleImageError(safeImages[currentIndex])}
          />
        </button>

        {/* Chips canto superior esquerdo */}
        <div className="pointer-events-none absolute left-3 top-3 flex flex-wrap items-center gap-2 sm:left-4 sm:top-4">
          {bodyTypeChip ? (
            <span className="inline-flex items-center rounded-full bg-white/95 px-3 py-1 text-[11px] font-bold uppercase tracking-wideish text-slate-700 shadow-sm">
              {bodyTypeChip}
            </span>
          ) : null}
          {isBelowFipe ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-white/95 px-3 py-1 text-[11px] font-bold uppercase tracking-wideish text-cnc-success shadow-sm">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-cnc-success" />
              Abaixo da FIPE
            </span>
          ) : null}
          {reviewedAfterBelowFipe ? (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-white/95 px-3 py-1 text-[11px] font-bold uppercase tracking-wideish text-slate-700 shadow-sm"
              title="Este anúncio passou por revisão antes de ser exibido."
            >
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-slate-500" />
              Anúncio analisado
            </span>
          ) : null}
        </div>

        {/* Contador canto superior direito */}
        <span
          aria-hidden="true"
          data-testid="vehicle-gallery-counter"
          className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-bold tabular-nums text-white sm:right-4 sm:top-4"
        >
          {isPlaceholderOnly ? "0 fotos" : total > 1 ? `${currentIndex + 1}/${total}` : "Ampliar"}
        </span>

        {/* Setas prev/next */}
        {total > 1 ? (
          <>
            <button
              type="button"
              onClick={goPrev}
              aria-label="Foto anterior"
              className="absolute left-3 top-1/2 z-10 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-slate-700 shadow-soft transition hover:bg-white sm:left-4 sm:h-11 sm:w-11"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m15 18-6-6 6-6" />
              </svg>
            </button>
            <button
              type="button"
              onClick={goNext}
              aria-label="Próxima foto"
              className="absolute right-3 top-1/2 z-10 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-slate-700 shadow-soft transition hover:bg-white sm:right-4 sm:h-11 sm:w-11"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>
          </>
        ) : null}
      </div>

      {/* Miniaturas */}
      {!isPlaceholderOnly && total > 1 ? (
        <div className="mt-3 flex gap-2 overflow-x-auto px-1 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {safeImages.map((src, i) => (
            <button
              key={`${src}-${i}`}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Ver foto ${i + 1}`}
              aria-pressed={i === currentIndex}
              className={`relative h-16 w-24 shrink-0 overflow-hidden rounded-xl border transition ${
                i === currentIndex
                  ? "border-primary shadow-[0_0_0_2px_rgba(14,98,216,0.18)]"
                  : "border-cnc-line hover:border-cnc-line-strong"
              }`}
            >
              <Image
                src={src}
                alt={`${alt} miniatura ${i + 1}`}
                fill
                sizes="96px"
                loading="lazy"
                className="object-cover"
                onError={() => handleImageError(src)}
              />
            </button>
          ))}
        </div>
      ) : null}

      {lightboxOpen ? (
        <VehicleGalleryLightbox
          images={safeImages}
          alt={alt}
          index={currentIndex}
          onClose={() => setLightboxOpen(false)}
          onNext={goNext}
          onPrev={goPrev}
          onSelect={setIndex}
          onImageError={handleImageError}
        />
      ) : null}
    </section>
  );
}
