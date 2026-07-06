// frontend/components/vehicle/detail/VehicleGalleryCarousel.tsx
"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";

import VehicleGalleryLightbox from "@/components/vehicle/VehicleGalleryLightbox";
import {
  normalizeVehicleGalleryImages,
  VEHICLE_IMAGE_PLACEHOLDER,
} from "@/lib/vehicle/detail-utils";

/**
 * Galeria do topo do detalhe (redesign detalhes.png): faixa de FOTOS LADO A
 * LADO (≈4 no desktop, 3 em tablet, 1 no mobile), com setas de paginação e
 * indicador de pontos. Clique amplia no lightbox.
 *
 * Proporção: cada célula é travada em 4:3 (aspect-[4/3]). Como as fotos de
 * veículo são 4:3, elas preenchem a célula SEM distorcer nem cortar. O
 * componente NÃO estica full-bleed — o caller o coloca dentro do mesmo
 * container (max-width) do conteúdo, então em monitores largos a faixa não
 * passa da largura do layout.
 *
 * Largura de cada célula = `grow` + `basis-*`: quando há poucas fotos elas
 * crescem e preenchem a faixa (sem buraco à direita); quando há muitas, a
 * `basis` prevalece e a faixa rola horizontalmente (setas/pontos paginam).
 *
 * Performance: a 1ª foto é o LCP (`priority` ⇒ fetchpriority="high", sem lazy);
 * as demais ficam com lazy nativo. `aspect-[4/3]` reserva o espaço (sem CLS).
 */
type VehicleGalleryCarouselProps = {
  images: string[];
  alt: string;
  isBelowFipe?: boolean;
};

export default function VehicleGalleryCarousel({
  images,
  alt,
  isBelowFipe,
}: VehicleGalleryCarouselProps) {
  const [failedImages, setFailedImages] = useState<string[]>([]);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [page, setPage] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const safeImages = useMemo(() => {
    const normalized = normalizeVehicleGalleryImages(images).filter(
      (src) => !failedImages.includes(src)
    );
    return normalized.length > 0 ? normalized : [VEHICLE_IMAGE_PLACEHOLDER];
  }, [images, failedImages]);

  const total = safeImages.length;
  const isPlaceholderOnly =
    total === 1 && safeImages[0] === VEHICLE_IMAGE_PLACEHOLDER && images.length === 0;

  function recomputePages() {
    const el = scrollRef.current;
    if (!el) return;
    const pc = Math.max(1, Math.round(el.scrollWidth / Math.max(1, el.clientWidth)));
    setPageCount(pc);
    setPage(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
  }

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    recomputePages();
    const ro = new ResizeObserver(recomputePages);
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total]);

  useEffect(() => {
    if (!lightboxOpen) return undefined;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxOpen(false);
      else if (e.key === "ArrowLeft") setLightboxIndex((i) => (i === 0 ? total - 1 : i - 1));
      else if (e.key === "ArrowRight") setLightboxIndex((i) => (i === total - 1 ? 0 : i + 1));
    };
    window.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handler);
      document.body.style.overflow = "";
    };
  }, [lightboxOpen, total]);

  function pageBy(dir: -1 | 1) {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth, behavior: "smooth" });
  }

  function goToPage(i: number) {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  }

  function handleImageError(src: string) {
    if (src === VEHICLE_IMAGE_PLACEHOLDER) return;
    setFailedImages((prev) => (prev.includes(src) ? prev : [...prev, src]));
  }

  return (
    <section aria-label="Fotos do veículo" data-testid="vehicle-gallery">
      <div className="relative overflow-hidden rounded-2xl border border-cnc-line bg-white">
        <div
          ref={scrollRef}
          onScroll={recomputePages}
          className="flex snap-x snap-mandatory overflow-x-auto scroll-smooth [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {safeImages.map((src, i) => (
            <button
              key={`${src}-${i}`}
              type="button"
              onClick={() => {
                if (isPlaceholderOnly) return;
                setLightboxIndex(i);
                setLightboxOpen(true);
              }}
              aria-label={
                isPlaceholderOnly ? "Sem fotos disponíveis" : `Ampliar foto ${i + 1} de ${total}`
              }
              className="relative aspect-[4/3] shrink-0 grow snap-start basis-[88%] border-r border-cnc-line last:border-r-0 sm:basis-[47%] lg:basis-[32%] xl:basis-[24%]"
            >
              <Image
                src={src}
                alt={total > 1 ? `${alt} — foto ${i + 1} de ${total}` : alt}
                fill
                sizes="(max-width: 768px) 88vw, (max-width: 1024px) 47vw, (max-width: 1280px) 32vw, 290px"
                className="object-contain p-1.5"
                // 1ª foto = LCP (priority ⇒ fetchpriority=high, sem lazy). Demais lazy.
                priority={i === 0}
                loading={i === 0 ? undefined : "lazy"}
                onError={() => handleImageError(src)}
              />
            </button>
          ))}
        </div>

        {isBelowFipe && !isPlaceholderOnly ? (
          <span className="pointer-events-none absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/95 px-3 py-1 text-[11px] font-bold uppercase tracking-wideish text-cnc-success shadow-sm">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-cnc-success" />
            Abaixo da FIPE
          </span>
        ) : null}

        {pageCount > 1 ? (
          <>
            <button
              type="button"
              onClick={() => pageBy(-1)}
              aria-label="Fotos anteriores"
              className="absolute left-3 top-1/2 z-10 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-slate-700 shadow-soft transition hover:bg-white disabled:opacity-40"
              disabled={page <= 0}
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m15 18-6-6 6-6" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => pageBy(1)}
              aria-label="Próximas fotos"
              className="absolute right-3 top-1/2 z-10 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-slate-700 shadow-soft transition hover:bg-white disabled:opacity-40"
              disabled={page >= pageCount - 1}
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>

            <div className="pointer-events-none absolute inset-x-0 bottom-3 flex items-center justify-center gap-1.5">
              {Array.from({ length: pageCount }).map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => goToPage(i)}
                  aria-label={`Ir para a página de fotos ${i + 1}`}
                  className={`pointer-events-auto h-1.5 rounded-full shadow transition-all ${
                    i === page ? "w-5 bg-white" : "w-1.5 bg-white/70 hover:bg-white"
                  }`}
                />
              ))}
            </div>
          </>
        ) : null}

        {/* Contador discreto */}
        {!isPlaceholderOnly && total > 1 ? (
          <span
            aria-hidden="true"
            className="absolute right-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-bold tabular-nums text-white"
          >
            {total} fotos
          </span>
        ) : null}
      </div>

      {lightboxOpen ? (
        <VehicleGalleryLightbox
          images={safeImages}
          alt={alt}
          index={lightboxIndex}
          onClose={() => setLightboxOpen(false)}
          onNext={() => setLightboxIndex((i) => (i === total - 1 ? 0 : i + 1))}
          onPrev={() => setLightboxIndex((i) => (i === 0 ? total - 1 : i - 1))}
          onSelect={setLightboxIndex}
          onImageError={handleImageError}
        />
      ) : null}
    </section>
  );
}
