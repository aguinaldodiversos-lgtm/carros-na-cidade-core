"use client";

import Image from "next/image";
import { useRef, useState, type TouchEvent } from "react";

type VehicleGalleryProps = {
  images: string[];
  alt: string;
};

export default function VehicleGallery({ images, alt }: VehicleGalleryProps) {
  const [index, setIndex] = useState(0);
  const [zoomed, setZoomed] = useState(false);
  const safeImages = images.length > 0 ? images : ["/images/banner1.jpg"];
  const touchStartX = useRef<number | null>(null);

  const goPrev = () => {
    setIndex((current) => (current === 0 ? safeImages.length - 1 : current - 1));
    setZoomed(false);
  };

  const goNext = () => {
    setIndex((current) => (current === safeImages.length - 1 ? 0 : current + 1));
    setZoomed(false);
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
        className="relative h-[300px] touch-pan-y overflow-hidden rounded-xl bg-[#edf1f9] md:h-[470px]"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <button
          type="button"
          onClick={goPrev}
          aria-label="Foto anterior"
          className="absolute left-3 top-1/2 z-10 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-[#1f2a43]"
        >
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
        <button
          type="button"
          onClick={goNext}
          aria-label="Proxima foto"
          className="absolute right-3 top-1/2 z-10 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-[#1f2a43]"
        >
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m9 18 6-6-6-6" />
          </svg>
        </button>

        <button
          type="button"
          onClick={() => setZoomed((state) => !state)}
          className="absolute right-3 top-3 z-10 min-h-11 rounded-lg bg-[#0f172fcc] px-3 py-1 text-xs font-semibold text-white"
        >
          {zoomed ? "Zoom -" : "Zoom +"}
        </button>

        <Image
          src={safeImages[index]}
          alt={`${alt} - foto ${index + 1}`}
          fill
          className={`object-cover transition duration-300 ${zoomed ? "scale-125" : "scale-100"}`}
          priority
        />
      </div>

      <div className="mt-3 grid grid-cols-5 gap-2">
        {safeImages.map((image, imageIndex) => (
          <button
            key={`${image}-${imageIndex}`}
            type="button"
            onClick={() => {
              setIndex(imageIndex);
              setZoomed(false);
            }}
            className={`relative h-16 min-h-11 overflow-hidden rounded-lg border ${
              index === imageIndex ? "border-[#0e62d8]" : "border-[#d6ddea]"
            }`}
          >
            <Image src={image} alt={`${alt} miniatura ${imageIndex + 1}`} fill className="object-cover" />
          </button>
        ))}
      </div>
    </section>
  );
}
