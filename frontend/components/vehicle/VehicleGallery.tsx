"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState, type TouchEvent } from "react";

import { VEHICLE_IMAGE_PLACEHOLDER } from "@/lib/vehicle/detail-utils";

type VehicleGalleryProps = {
  images: string[];
  alt: string;
};

export default function VehicleGallery({ images, alt }: VehicleGalleryProps) {
  const [index, setIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [failedImages, setFailedImages] = useState<string[]>([]);
  const touchStartX = useRef<number | null>(null);

  const safeImages = useMemo(() => {
    const uniqueImages = Array.from(new Set(images.filter(Boolean)));
    const filteredImages = uniqueImages.filter((image) => !failedImages.includes(image));

    if (filteredImages.length > 0) {
      return filteredImages;
    }

    return [VEHICLE_IMAGE_PLACEHOLDER];
  }, [failedImages, images]);

  useEffect(() => {
    if (index <= safeImages.length - 1) return;
    setIndex(0);
  }, [index, safeImages.length]);

  useEffect(() => {
    if (!lightboxOpen) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setLightboxOpen(false);
      }

      if (event.key === "ArrowLeft") {
        setIndex((current) => (current === 0 ? safeImages.length - 1 : current - 1));
      }

      if (event.key === "ArrowRight") {
        setIndex((current) => (current === safeImages.length - 1 ? 0 : current + 1));
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [lightboxOpen, safeImages.length]);

  const isPlaceholderOnly =
    safeImages.length === 1 && safeImages[0] === VEHICLE_IMAGE_PLACEHOLDER && images.length === 0;
  const showThumbStrip = !isPlaceholderOnly;

  const goPrev = () => {
    setIndex((current) => (current === 0 ? safeImages.length - 1 : current - 1));
  };

  const goNext = () => {
    setIndex((current) => (current === safeImages.length - 1 ? 0 : current + 1));
  };

  const handleImageError = (imageUrl: string) => {
    if (imageUrl === VEHICLE_IMAGE_PLACEHOLDER) return;

    setFailedImages((current) => (current.includes(imageUrl) ? current : [...current, imageUrl]));
  };

  const onTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    touchStartX.current = event.touches[0]?.clientX ?? null;
  };

  const onTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    if (touchStartX.current === null) return;
    const endX = event.changedTouches[0]?.clientX ?? touchStartX.current;
    const diff = touchStartX.current - endX;
    if (Math.abs(diff) > 45) {
      if (diff > 0) goNext();
      else goPrev();
    }
    touchStartX.current = null;
  };

  return (
    <section className="rounded-2xl border border-[#dfe4ef] bg-white p-4 shadow-[0_2px_16px_rgba(10,20,40,0.05)]">
      <div
        data-testid="vehicle-gallery"
        className="relative h-[320px] touch-pan-y overflow-hidden rounded-[24px] border border-[#edf1f5] bg-[#f5f7fb] md:h-[520px]"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {safeImages.length > 1 ? (
          <>
            <button
              type="button"
              onClick={goPrev}
              aria-label="Foto anterior"
              className="absolute left-4 top-1/2 z-10 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/92 text-[#1f2a43] shadow-[0_10px_30px_rgba(15,23,42,0.12)] transition hover:bg-white"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-6 w-6"
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
              aria-label="Próxima foto"
              className="absolute right-4 top-1/2 z-10 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/92 text-[#1f2a43] shadow-[0_10px_30px_rgba(15,23,42,0.12)] transition hover:bg-white"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-6 w-6"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>
          </>
        ) : null}

        <button
          type="button"
          onClick={() => !isPlaceholderOnly && setLightboxOpen(true)}
          className="absolute right-4 top-4 z-10 min-h-11 rounded-xl bg-[#0f172fcc] px-4 py-2 text-xs font-semibold text-white shadow-[0_8px_24px_rgba(15,23,42,0.22)]"
        >
          {isPlaceholderOnly ? "Sem fotos" : "Zoom"}
        </button>

        {isPlaceholderOnly ? (
          <div
            data-testid="vehicle-gallery-empty"
            className="flex h-full items-center justify-center px-6 text-center"
          >
            <div className="max-w-sm">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white text-[#0e62d8] shadow-sm">
                <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5h11A2.5 2.5 0 0 1 20 7.5v9A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5v-9Z" />
                  <path d="m8 14 2.2-2.2a1 1 0 0 1 1.4 0L16 16" />
                  <path d="m14 13 1.2-1.2a1 1 0 0 1 1.4 0L20 15" />
                  <circle cx="9" cy="9.2" r="1.2" />
                </svg>
              </div>
              <p className="mt-4 text-[18px] font-bold text-[#1d2538]">Fotos em atualização</p>
              <p className="mt-2 text-[14px] leading-6 text-[#67738a]">
                Este anúncio ainda não possui fotos disponíveis. As demais informações do veículo
                continuam acessíveis normalmente.
              </p>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setLightboxOpen(true)}
            className="relative block h-full w-full"
          >
            <Image
              src={safeImages[index]}
              alt={`${alt} - foto ${index + 1}`}
              fill
              priority
              unoptimized
              sizes="(max-width: 1024px) 100vw, 900px"
              onError={() => handleImageError(safeImages[index])}
              data-testid="vehicle-gallery-main-image"
              className="object-contain transition duration-300"
            />
          </button>
        )}

        <div className="absolute bottom-4 right-4 z-10 rounded-full bg-[#0f172fcc] px-3 py-1.5 text-[12px] font-semibold text-white">
          {isPlaceholderOnly ? "0 fotos" : `${index + 1} de ${safeImages.length}`}
        </div>
      </div>

      {showThumbStrip ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {safeImages.map((image, imageIndex) => (
            <button
              key={`${image}-${imageIndex}`}
              type="button"
              data-testid={`vehicle-gallery-thumb-${imageIndex}`}
              onClick={() => {
                setIndex(imageIndex);
              }}
              className={`relative h-[78px] w-[104px] min-h-11 overflow-hidden rounded-2xl border bg-[#edf1f7] transition ${
                index === imageIndex
                  ? "border-[#0e62d8] shadow-[0_0_0_3px_rgba(14,98,216,0.14)]"
                  : "border-[#d6ddea] hover:border-[#b5c2da]"
              }`}
            >
              <Image
                src={image}
                alt={`${alt} miniatura ${imageIndex + 1}`}
                fill
                unoptimized
                sizes="104px"
                onError={() => handleImageError(image)}
                className="object-cover"
              />
            </button>
          ))}
        </div>
      ) : null}

      {lightboxOpen ? (
        <div
          data-testid="vehicle-gallery-lightbox"
          className="fixed inset-0 z-[70] bg-[#020617e6] p-4 md:p-8"
          role="dialog"
          aria-modal="true"
        >
          <div className="mx-auto flex h-full w-full max-w-6xl flex-col">
            <div className="mb-4 flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-white/85">
                {alt} · {index + 1}/{safeImages.length}
              </p>
              <button
                type="button"
                onClick={() => setLightboxOpen(false)}
                className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white transition hover:bg-white/15"
                aria-label="Fechar visualização expandida"
              >
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </div>

            <div className="relative flex-1 overflow-hidden rounded-[28px] border border-white/10 bg-[#0f172a]">
              {safeImages.length > 1 ? (
                <>
                  <button
                    type="button"
                    onClick={goPrev}
                    aria-label="Foto anterior no modal"
                    className="absolute left-4 top-1/2 z-10 inline-flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-[#0f172a] shadow-[0_10px_30px_rgba(2,6,23,0.4)]"
                  >
                    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="m15 18-6-6 6-6" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={goNext}
                    aria-label="Próxima foto no modal"
                    className="absolute right-4 top-1/2 z-10 inline-flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-[#0f172a] shadow-[0_10px_30px_rgba(2,6,23,0.4)]"
                  >
                    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="m9 18 6-6-6-6" />
                    </svg>
                  </button>
                </>
              ) : null}

              <Image
                src={safeImages[index]}
                alt={`${alt} - visualização expandida ${index + 1}`}
                fill
                unoptimized
                sizes="100vw"
                onError={() => handleImageError(safeImages[index])}
                data-testid="vehicle-gallery-lightbox-image"
                className="object-contain"
              />
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {safeImages.map((image, imageIndex) => (
                <button
                  key={`${image}-lightbox-${imageIndex}`}
                  type="button"
                  onClick={() => setIndex(imageIndex)}
                  className={`relative h-16 w-24 overflow-hidden rounded-2xl border ${
                    imageIndex === index ? "border-white" : "border-white/20"
                  }`}
                >
                  <Image
                    src={image}
                    alt={`${alt} miniatura expandida ${imageIndex + 1}`}
                    fill
                    unoptimized
                    sizes="96px"
                    onError={() => handleImageError(image)}
                    className="object-cover"
                  />
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
