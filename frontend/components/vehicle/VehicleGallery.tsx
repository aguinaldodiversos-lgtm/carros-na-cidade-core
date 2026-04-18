"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState, type TouchEvent } from "react";

import VehicleGalleryLightbox from "@/components/vehicle/VehicleGalleryLightbox";
import {
  normalizeVehicleGalleryImages,
  VEHICLE_IMAGE_PLACEHOLDER,
} from "@/lib/vehicle/detail-utils";

type VehicleGalleryProps = {
  images: string[];
  alt: string;
};

export default function VehicleGallery({ images, alt }: VehicleGalleryProps) {
  const [index, setIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [failedImages, setFailedImages] = useState<string[]>([]);
  const [isReady, setIsReady] = useState(false);
  const touchStartX = useRef<number | null>(null);

  const safeImages = useMemo(() => {
    const uniqueImages = normalizeVehicleGalleryImages(images);
    const filteredImages = uniqueImages.filter((image) => !failedImages.includes(image));

    if (filteredImages.length > 0) {
      return filteredImages;
    }

    return [VEHICLE_IMAGE_PLACEHOLDER];
  }, [failedImages, images]);

  useEffect(() => {
    setIsReady(true);
  }, []);

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
  const showThumbStrip = !isPlaceholderOnly && safeImages.length > 1;

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
        data-ready={isReady ? "true" : "false"}
        data-active-index={String(index)}
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
              disabled={!isReady}
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
              disabled={!isReady}
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
          disabled={!isReady && !isPlaceholderOnly}
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
                <svg
                  viewBox="0 0 24 24"
                  className="h-8 w-8"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                >
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
            disabled={!isReady}
            data-testid="vehicle-gallery-main-trigger"
            className="relative block h-full w-full"
          >
            <Image
              key={safeImages[index]}
              src={safeImages[index]}
              alt={`${alt} - foto ${index + 1}`}
              fill
              priority
              unoptimized
              sizes="(max-width: 1024px) 100vw, 900px"
              onError={() => handleImageError(safeImages[index])}
              data-testid="vehicle-gallery-main-image"
              className="bg-[#f5f7fb] object-contain transition duration-300"
            />
          </button>
        )}

        <div
          data-testid="vehicle-gallery-counter"
          className="absolute bottom-4 right-4 z-10 rounded-full bg-[#0f172fcc] px-3 py-1.5 text-[12px] font-semibold text-white"
        >
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
              data-active={index === imageIndex ? "true" : "false"}
              aria-pressed={index === imageIndex}
              onClick={() => {
                setIndex(imageIndex);
              }}
              disabled={!isReady}
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
        <VehicleGalleryLightbox
          images={safeImages}
          alt={alt}
          index={index}
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
