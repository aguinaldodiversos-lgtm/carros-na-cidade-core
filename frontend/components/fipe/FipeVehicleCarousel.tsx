// frontend/components/fipe/FipeVehicleCarousel.tsx
"use client";

import useEmblaCarousel from "embla-carousel-react";
import { useCallback, useEffect, useState } from "react";
import { HomeVehicleCard } from "@/components/home/HomeVehicleCard";

type VehicleItem = {
  id: number | string;
  slug?: string;
  title?: string;
  brand?: string;
  model?: string;
  year?: number | string;
  mileage?: number | string;
  city?: string;
  state?: string;
  price?: number | string;
  below_fipe?: boolean;
  highlight_until?: string | null;
  image_url?: string | null;
  images?: string[] | null;
};

interface FipeVehicleCarouselProps {
  title: string;
  subtitle: string;
  items: VehicleItem[];
  variant: "highlight" | "opportunity";
}

export function FipeVehicleCarousel({ title, subtitle, items, variant }: FipeVehicleCarouselProps) {
  const [viewportRef, embla] = useEmblaCarousel({
    align: "start",
    containScroll: "trimSnaps",
    dragFree: false,
  });

  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  const updateButtons = useCallback(() => {
    if (!embla) return;
    setCanPrev(embla.canScrollPrev());
    setCanNext(embla.canScrollNext());
  }, [embla]);

  useEffect(() => {
    if (!embla) return;
    updateButtons();
    embla.on("select", updateButtons);
    embla.on("reInit", updateButtons);

    return () => {
      embla.off("select", updateButtons);
      embla.off("reInit", updateButtons);
    };
  }, [embla, updateButtons]);

  return (
    <section className="mt-10">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-[18px] font-extrabold leading-tight text-[#1b2436] sm:text-[22px] md:text-[28px]">{title}</h2>
          <p className="mt-1 text-[12.5px] text-[#6d768b] sm:text-[14px]">{subtitle}</p>
        </div>

        <div className="hidden items-center gap-2 md:flex">
          <button
            type="button"
            onClick={() => embla?.scrollPrev()}
            disabled={!canPrev}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#dce3ef] bg-white text-[#26334d] transition hover:bg-[#f5f8fc] disabled:cursor-not-allowed disabled:opacity-40"
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
            onClick={() => embla?.scrollNext()}
            disabled={!canNext}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#dce3ef] bg-white text-[#26334d] transition hover:bg-[#f5f8fc] disabled:cursor-not-allowed disabled:opacity-40"
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
      </div>

      <div className="overflow-hidden" ref={viewportRef}>
        <div className="-ml-4 flex">
          {items.map((item, index) => (
            <div
              key={`${variant}-${item.id}-${index}`}
              className="min-w-0 flex-[0_0_88%] pl-4 sm:flex-[0_0_50%] lg:flex-[0_0_33.3333%]"
            >
              <HomeVehicleCard item={item} variant={variant} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
