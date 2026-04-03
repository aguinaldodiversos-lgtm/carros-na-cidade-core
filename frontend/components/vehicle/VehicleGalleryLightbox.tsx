"use client";

import Image from "next/image";

type VehicleGalleryLightboxProps = {
  images: string[];
  alt: string;
  index: number;
  onClose: () => void;
  onNext: () => void;
  onPrev: () => void;
  onSelect: (index: number) => void;
  onImageError: (imageUrl: string) => void;
};

export default function VehicleGalleryLightbox({
  images,
  alt,
  index,
  onClose,
  onNext,
  onPrev,
  onSelect,
  onImageError,
}: VehicleGalleryLightboxProps) {
  return (
    <div
      data-testid="vehicle-gallery-lightbox"
      className="fixed inset-0 z-[70] bg-[#020617eb] p-4 backdrop-blur-sm md:p-8"
      role="dialog"
      aria-modal="true"
      aria-label="Visualização expandida das fotos"
      onClick={onClose}
    >
      <div
        className="mx-auto flex h-full w-full max-w-6xl flex-col"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <p
            data-testid="vehicle-gallery-lightbox-counter"
            className="truncate pr-3 text-sm font-semibold text-white/85"
          >
            {alt} · {index + 1}/{images.length}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white transition hover:bg-white/15"
            aria-label="Fechar visualização expandida"
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>

        <div className="relative flex-1 overflow-hidden rounded-[28px] border border-white/10 bg-[#0b1120]">
          {images.length > 1 ? (
            <>
              <button
                type="button"
                onClick={onPrev}
                aria-label="Foto anterior no modal"
                className="absolute left-4 top-1/2 z-10 inline-flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-[#0f172a] shadow-[0_10px_30px_rgba(2,6,23,0.4)]"
              >
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="m15 18-6-6 6-6" />
                </svg>
              </button>
              <button
                type="button"
                onClick={onNext}
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
            key={images[index]}
            src={images[index]}
            alt={`${alt} - visualização expandida ${index + 1}`}
            fill
            unoptimized
            sizes="100vw"
            onError={() => onImageError(images[index])}
            data-testid="vehicle-gallery-lightbox-image"
            className="object-contain"
          />
        </div>

        {images.length > 1 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {images.map((image, imageIndex) => (
              <button
                key={`${image}-lightbox-${imageIndex}`}
                type="button"
                data-testid={`vehicle-gallery-lightbox-thumb-${imageIndex}`}
                data-active={imageIndex === index ? "true" : "false"}
                aria-pressed={imageIndex === index}
                onClick={() => onSelect(imageIndex)}
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
                  onError={() => onImageError(image)}
                  className="object-cover"
                />
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
