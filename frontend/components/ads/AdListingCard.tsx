import Image from "next/image";
import type { ListingCar } from "@/lib/car-data";

type AdListingCardProps = {
  car: ListingCar;
  featured?: boolean;
};

const badgeClasses = {
  destaque: "bg-[#e43358] text-white",
  fipe: "bg-[#21864f] text-white",
};

const badgeText = {
  destaque: "OFERTA DESTAQUE",
  fipe: "ABAIXO DA FIPE",
};

function HeartIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 20.5s-7.25-4.35-7.25-10.1a4.2 4.2 0 0 1 7.25-2.7 4.2 4.2 0 0 1 7.25 2.7c0 5.75-7.25 10.1-7.25 10.1Z" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13H4V6a1 1 0 0 1 1-1Z" />
    </svg>
  );
}

function GaugeIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 15a8 8 0 1 1 16 0M12 12l4-2M12 15h.01" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 21s-6-5.5-6-10a6 6 0 1 1 12 0c0 4.5-6 10-6 10Z" />
      <path d="M12 13a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4Z" />
    </svg>
  );
}

export default function AdListingCard({ car, featured = false }: AdListingCardProps) {
  const numericPrice = car.price.replace("R$", "").trim();

  return (
    <article className="overflow-hidden rounded-xl border border-[#e1e4ed] bg-white shadow-[0_2px_12px_rgba(10,20,40,0.06)]">
      <div className={`relative ${featured ? "h-[224px]" : "h-[190px]"}`}>
        <Image src={car.image} alt={car.model} fill className="object-cover" />
        <button
          type="button"
          aria-label="Salvar anuncio"
          className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-[#6c7487] transition hover:text-[#3c4358]"
        >
          <HeartIcon />
        </button>
        <span className="absolute bottom-2 left-2 rounded-md bg-[#101828]/65 px-2 py-0.5 text-[12px] font-semibold text-white">
          {car.mediaCount ?? "1/12"}
        </span>
      </div>

      <div className="p-3">
        {car.badge && (
          <span
            className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-[0.03em] ${
              badgeClasses[car.badge]
            }`}
          >
            {badgeText[car.badge]}
          </span>
        )}

        <h3 className="mt-2 line-clamp-1 text-[30px] font-extrabold uppercase leading-[1.05] text-[#1b2030]">
          {car.model}
        </h3>
        <p className="mt-1 line-clamp-2 text-[16px] leading-tight text-[#4f5870]">{car.version}</p>

        <div className="mt-2 flex items-center gap-3 text-[15px] text-[#5a6378]">
          <span className="inline-flex items-center gap-1">
            <CalendarIcon />
            {car.yearModel}
          </span>
          <span className="inline-flex items-center gap-1">
            <GaugeIcon />
            {car.km}
          </span>
        </div>

        <p className="mt-1 inline-flex items-center gap-1 text-[15px] text-[#4f5870]">
          <PinIcon />
          {car.city}
        </p>

        <div className="mt-2 flex items-end gap-2 text-[#1f2434]">
          <span className="pb-1 text-[20px] font-extrabold leading-none">R$</span>
          <span className="text-[44px] font-extrabold leading-none tracking-[-0.02em]">{numericPrice}</span>
        </div>

        <button
          type="button"
          className="mt-3 inline-flex h-12 w-full items-center justify-center rounded-[10px] bg-[#0e62d8] text-[18px] font-bold text-white transition hover:bg-[#0d56be]"
        >
          Ver parcelas
        </button>
      </div>
    </article>
  );
}
