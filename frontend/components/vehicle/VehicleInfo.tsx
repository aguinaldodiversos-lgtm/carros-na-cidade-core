import type { VehicleDetail } from "@/lib/vehicle/public-vehicle";
import { formatListingDateLabels } from "@/lib/vehicle/public-vehicle";

type VehicleInfoProps = {
  vehicle: VehicleDetail;
};

function safeText(value: unknown, fallback = "Não informado") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function safeYearLabel(value: unknown) {
  const raw = safeText(value, "");
  if (!raw) return "Ano não informado";
  return raw;
}

function buildHeadline(vehicle: VehicleDetail) {
  const fullName = safeText(vehicle.fullName, "");
  const model = safeText(vehicle.model, "Veículo");
  return fullName || model;
}

function SpecPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[#e6ebf2] bg-white px-4 py-3 shadow-[0_8px_20px_rgba(15,23,42,0.04)]">
      <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#7b869d]">{label}</p>
      <p className="mt-1 text-[15px] font-semibold leading-snug text-[#2a3550]">{value}</p>
    </div>
  );
}

export default function VehicleInfo({ vehicle }: VehicleInfoProps) {
  const headline = buildHeadline(vehicle);
  const dateLabels = formatListingDateLabels(vehicle.adPublishedAt, vehicle.adUpdatedAt);

  return (
    <section className="rounded-[28px] border border-[#e1e7f0] bg-white p-5 shadow-[0_12px_32px_rgba(15,23,42,0.05)] md:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center rounded-full bg-[#eef5ff] px-3 py-1 text-[12px] font-bold text-[#0e62d8]">
          {safeText(vehicle.city, "Região")}
        </span>
        {vehicle.isBelowFipe ? (
          <span className="inline-flex items-center rounded-full bg-[#1f8a4a] px-3 py-1 text-[11px] font-extrabold uppercase tracking-wide text-white">
            Abaixo da FIPE
          </span>
        ) : null}
      </div>

      <h1 className="mt-3 max-w-5xl text-[28px] font-extrabold leading-[1.1] tracking-[-0.02em] text-[#1d2538] md:text-[36px]">
        {headline}
      </h1>

      {dateLabels.primary ? (
        <p className="mt-2 text-[13px] text-[#5c667a]">
          {dateLabels.primary}
          {dateLabels.secondary ? (
            <>
              {" "}
              <span className="text-[#8b94a6]">·</span> {dateLabels.secondary}
            </>
          ) : null}
        </p>
      ) : null}

      <div className="mt-5 grid gap-3 sm:grid-cols-2 md:grid-cols-4">
        <SpecPill label="Ano" value={safeYearLabel(vehicle.year)} />
        <SpecPill label="Quilometragem" value={safeText(vehicle.km)} />
        <SpecPill label="Câmbio" value={safeText(vehicle.transmission)} />
        <SpecPill label="Cor" value={safeText(vehicle.color)} />
      </div>
    </section>
  );
}
