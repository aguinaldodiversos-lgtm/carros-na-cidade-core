import Image from "next/image";
import Link from "next/link";
import type { ListingCar } from "@/lib/car-data";

type VehicleCardProps = {
  vehicle: ListingCar;
};

const badgeMap = {
  destaque: {
    label: "OFERTA DESTAQUE",
    className: "bg-[#e33a5a] text-white",
  },
  fipe: {
    label: "ABAIXO DA FIPE",
    className: "bg-[#1f8a4a] text-white",
  },
} as const;

function HeartIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 20.5s-7.25-4.35-7.25-10.1a4.2 4.2 0 0 1 7.25-2.7 4.2 4.2 0 0 1 7.25 2.7c0 5.75-7.25 10.1-7.25 10.1Z" />
    </svg>
  );
}

function InfoIcon({ path }: { path: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d={path} />
    </svg>
  );
}

export default function VehicleCard({ vehicle }: VehicleCardProps) {
  const badge = vehicle.badge ? badgeMap[vehicle.badge] : null;
  const numericPrice = vehicle.price.replace("R$", "").trim();
  const cardContent = (
    <>
      <div className="relative h-[190px]">
        <Image src={vehicle.image} alt={vehicle.model} fill className="object-cover" />

        <button
          type="button"
          aria-label="Salvar anuncio"
          className="absolute right-2 top-2 inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/90 text-[#6c7487] transition hover:text-[#31384d]"
        >
          <HeartIcon />
        </button>

        <span className="absolute bottom-2 left-2 rounded-md bg-[#121a2d]/75 px-2 py-0.5 text-[12px] font-semibold text-white">
          {vehicle.mediaCount ?? "1/12"}
        </span>
      </div>

      <div className="p-3">
        {badge && (
          <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-extrabold uppercase ${badge.className}`}>
            {badge.label}
          </span>
        )}

        <h3 className="mt-2 line-clamp-1 text-[29px] font-extrabold uppercase leading-[1.03] text-[#161d2e]">
          {vehicle.model}
        </h3>
        <p className="mt-1 line-clamp-2 text-[16px] leading-tight text-[#535d74]">{vehicle.version}</p>

        <div className="mt-2 flex items-center gap-3 text-[15px] text-[#5b6478]">
          <span className="inline-flex items-center gap-1">
            <InfoIcon path="M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13H4V6a1 1 0 0 1 1-1Z" />
            {vehicle.yearModel}
          </span>
          <span className="inline-flex items-center gap-1">
            <InfoIcon path="M4 15a8 8 0 1 1 16 0M12 12l4-2M12 15h.01" />
            {vehicle.km}
          </span>
        </div>

        <p className="mt-1 inline-flex items-center gap-1 text-[15px] text-[#4f5870]">
          <InfoIcon path="M12 21s-6-5.5-6-10a6 6 0 1 1 12 0c0 4.5-6 10-6 10Z" />
          {vehicle.city}
        </p>

        <div className="mt-2 flex items-end gap-1.5 text-[#1e2434]">
          <span className="pb-1 text-[20px] font-extrabold leading-none">R$</span>
          <span className="text-[43px] font-extrabold leading-none tracking-[-0.02em]">{numericPrice}</span>
        </div>

        <span className="mt-3 inline-flex h-12 w-full items-center justify-center rounded-[10px] bg-[#0e62d8] text-[18px] font-bold text-white transition hover:bg-[#0b54be]">
          Ver parcelas
        </span>
      </div>
    </>
  );

  if (vehicle.slug) {
    return (
      <Link
        href={`/veiculo/${vehicle.slug}`}
        className="block w-[290px] shrink-0 overflow-hidden rounded-xl border border-[#e1e4ed] bg-white shadow-[0_2px_14px_rgba(12,22,42,0.08)] transition hover:shadow-[0_8px_24px_rgba(12,22,42,0.14)]"
      >
        {cardContent}
      </Link>
    );
  }

  return (
    <article className="w-[290px] shrink-0 overflow-hidden rounded-xl border border-[#e1e4ed] bg-white shadow-[0_2px_14px_rgba(12,22,42,0.08)]">
      {cardContent}
    </article>
  );
}
