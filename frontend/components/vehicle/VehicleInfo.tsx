import type { VehicleDetail } from "@/services/vehicleService";
import type { VehiclePriceSignal } from "@/services/aiService";

type VehicleInfoProps = {
  vehicle: VehicleDetail;
  priceSignal: VehiclePriceSignal;
};

function SpecPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#e1e5ef] bg-[#f8fafe] px-3 py-2">
      <p className="text-[11px] font-bold uppercase tracking-wide text-[#6a748d]">{label}</p>
      <p className="text-sm font-semibold text-[#2a3550]">{value}</p>
    </div>
  );
}

export default function VehicleInfo({ vehicle, priceSignal }: VehicleInfoProps) {
  return (
    <section className="rounded-2xl border border-[#dfe4ef] bg-white p-5 shadow-[0_2px_16px_rgba(10,20,40,0.05)]">
      <h1 className="text-[30px] font-extrabold leading-tight text-[#1d2538] md:text-[42px]">
        {vehicle.model} {vehicle.year.split("/")[0]} a venda em {vehicle.city}
      </h1>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <p className="text-[34px] font-extrabold leading-none text-[#0e62d8] sm:text-[42px]">{vehicle.price}</p>
        {vehicle.isBelowFipe && (
          <span className="rounded-full bg-[#1f8a4a] px-3 py-1 text-xs font-extrabold uppercase tracking-wide text-white">
            Abaixo da FIPE
          </span>
        )}
        <span className="rounded-full bg-[#eef2fb] px-3 py-1 text-xs font-bold uppercase tracking-wide text-[#4f5b78]">
          Codigo: {vehicle.adCode}
        </span>
      </div>

      <div className="mt-4 rounded-xl border border-[#d9e5ff] bg-[#edf4ff] p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-[#0c57c8]">Indicador do Cerebro IA</p>
        <p className="mt-1 text-base font-extrabold text-[#1e2f53]">{priceSignal.label}</p>
        <p className="mt-1 text-sm text-[#435372]">{priceSignal.reason}</p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
        <SpecPill label="Condicao" value={vehicle.condition} />
        <SpecPill label="Ano" value={vehicle.year} />
        <SpecPill label="KM" value={vehicle.km} />
        <SpecPill label="Combustivel" value={vehicle.fuel} />
        <SpecPill label="Cambio" value={vehicle.transmission} />
        <SpecPill label="Cor" value={vehicle.color} />
        <SpecPill label="Cidade" value={vehicle.city} />
        <SpecPill label="FIPE Ref." value={vehicle.fipePrice} />
      </div>
    </section>
  );
}
