"use client";

import { useCallback, useRef, type ReactNode } from "react";

import { IconChevronLeft, IconChevronRight } from "@/components/home/icons";
import { SectionHeader } from "./SectionHeader";
import { VehicleCard, type VehicleCardItem } from "./VehicleCard";

interface VehicleCarouselSectionProps {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  link?: { label: string; href: string };
  items: VehicleCardItem[];
  variant: "highlight" | "opportunity";
  emptyMessage?: string;
}

export function VehicleCarouselSection({
  icon,
  title,
  subtitle,
  link,
  items,
  variant,
  emptyMessage = "Nenhum veículo disponível no momento.",
}: VehicleCarouselSectionProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  const shift = useCallback((dir: -1 | 1) => {
    const el = scrollerRef.current;
    if (!el) return;
    const amount = Math.max(280, el.clientWidth * 0.7);
    el.scrollBy({ left: dir * amount, behavior: "smooth" });
  }, []);

  return (
    <section className="mx-auto w-full max-w-[1240px] px-4 pt-10 sm:px-6 sm:pt-12 lg:px-8">
      <SectionHeader icon={icon} title={title} subtitle={subtitle} link={link} />

      <div className="relative">
        <button
          type="button"
          onClick={() => shift(-1)}
          aria-label="Anteriores"
          className="absolute -left-3 top-1/2 z-[2] hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-[#e7e8f1] bg-white text-[#2d3a9c] shadow-md transition hover:bg-[#eef1f9] md:inline-flex"
        >
          <IconChevronLeft className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={() => shift(1)}
          aria-label="Próximos"
          className="absolute -right-3 top-1/2 z-[2] hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-[#e7e8f1] bg-white text-[#2d3a9c] shadow-md transition hover:bg-[#eef1f9] md:inline-flex"
        >
          <IconChevronRight className="h-5 w-5" />
        </button>

        {items.length > 0 ? (
          <div
            ref={scrollerRef}
            className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {items.map((item, idx) => (
              <div
                key={`${variant}-${item.id}-${idx}`}
                className="w-[260px] shrink-0 snap-start sm:w-[280px] md:w-[calc((100%-3rem)/4)] md:min-w-0"
              >
                <VehicleCard item={item} variant={variant} />
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-[14px] border border-dashed border-[#d4d7e4] bg-white px-6 py-12 text-center">
            <p className="text-[14px] text-[#5b6079]">{emptyMessage}</p>
          </div>
        )}
      </div>
    </section>
  );
}
