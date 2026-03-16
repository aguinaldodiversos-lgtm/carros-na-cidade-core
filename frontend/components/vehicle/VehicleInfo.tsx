import type { VehicleDetail } from "@/lib/vehicle/public-vehicle";
import type { VehiclePriceSignal } from "@/services/aiService";

type VehicleInfoProps = {
  vehicle: VehicleDetail;
  priceSignal?: VehiclePriceSignal | null;
};

function safeText(value: unknown, fallback = "Não informado") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function safeYearLabel(value: unknown) {
  const raw = safeText(value, "");
  if (!raw) return "Ano não informado";
  return raw;
}

function primaryYear(value: unknown) {
  const raw = safeYearLabel(value);
  if (!raw || raw === "Ano não informado") return "Ano não informado";
  return raw.split("/")[0] || raw;
}

function buildHeadline(vehicle: VehicleDetail) {
  const fullName = safeText(vehicle.fullName, "");
  const model = safeText(vehicle.model, "Veículo");
  const city = safeText(vehicle.city, "sua região");
  const titleBase = fullName || model;
  const year = primaryYear(vehicle.year);

  if (year === "Ano não informado") {
    return `${titleBase} à venda em ${city}`;
  }

  if (titleBase.toLowerCase().includes(year.toLowerCase())) {
    return `${titleBase} à venda em ${city}`;
  }

  return `${titleBase} ${year} à venda em ${city}`;
}

function buildPriceSignal(priceSignal?: VehiclePriceSignal | null) {
  return {
    label:
      safeText(priceSignal?.label, "") || "Análise em processamento pelo Cérebro IA",
    reason:
      safeText(priceSignal?.reason, "") ||
      "Estamos consolidando sinais de preço, contexto regional e comportamento de mercado para este anúncio.",
  };
}

function SpecPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#e1e5ef] bg-[#f8fafe] px-3 py-2">
      <p className="text-[11px] font-bold uppercase tracking-wide text-[#6a748d]">
        {label}
      </p>
      <p className="text-sm font-semibold text-[#2a3550]">{value}</p>
    </div>
  );
}

export default function VehicleInfo({
  vehicle,
  priceSignal,
}: VehicleInfoProps) {
  const headline = buildHeadline(vehicle);
  const signal = buildPriceSignal(priceSignal);

  return (
    <section className="rounded-2xl border border-[#dfe4ef] bg-white p-5 shadow-[0_2px_16px_rgba(10,20,40,0.05)]">
      <h1 className="text-[30px] font-extrabold leading-tight text-[#1d2538] md:text-[42px]">
        {headline}
      </h1>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <p className="text-[34px] font-extrabold leading-none text-[#0e62d8] sm:text-[42px]">
          {safeText(vehicle.price, "R$ 0")}
        </p>

        {vehicle.isBelowFipe ? (
          <span className="rounded-full bg-[#1f8a4a] px-3 py-1 text-xs font-extrabold uppercase tracking-wide text-white">
            Abaixo da FIPE
          </span>
        ) : null}

        <span className="rounded-full bg-[#eef2fb] px-3 py-1 text-xs font-bold uppercase tracking-wide text-[#4f5b78]">
          Código: {safeText(vehicle.adCode, safeText(vehicle.id, "N/D"))}
        </span>
      </div>

      <div className="mt-4 rounded-xl border border-[#d9e5ff] bg-[#edf4ff] p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-[#0c57c8]">
          Indicador do Cérebro IA
        </p>
        <p className="mt-1 text-base font-extrabold text-[#1e2f53]">
          {signal.label}
        </p>
        <p className="mt-1 text-sm leading-6 text-[#435372]">
          {signal.reason}
        </p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
        <SpecPill label="Condição" value={safeText(vehicle.condition)} />
        <SpecPill label="Ano" value={safeYearLabel(vehicle.year)} />
        <SpecPill label="KM" value={safeText(vehicle.km)} />
        <SpecPill label="Combustível" value={safeText(vehicle.fuel)} />
        <SpecPill label="Câmbio" value={safeText(vehicle.transmission)} />
        <SpecPill label="Cor" value={safeText(vehicle.color)} />
        <SpecPill label="Cidade" value={safeText(vehicle.city)} />
        <SpecPill label="FIPE Ref." value={safeText(vehicle.fipePrice, "Consulte")} />
      </div>
    </section>
  );
}
