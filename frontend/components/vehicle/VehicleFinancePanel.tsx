"use client";

import Link from "next/link";

import { buildFinanceLink, estimateMonthlyPayment, formatBrl } from "@/lib/vehicle/detail-utils";

type VehicleFinancePanelProps = {
  vehicleId: string;
  citySlug: string;
  vehiclePriceNumeric?: number | null;
  year: string;
  mileage: string;
  transmission: string;
  fuel: string;
  city: string;
};

function DataPoint({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[#e8edf5] bg-white px-4 py-3">
      <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#7b869d]">{label}</p>
      <p className="mt-1 text-[15px] font-semibold text-[#1d2538]">{value}</p>
    </div>
  );
}

export default function VehicleFinancePanel({
  vehicleId,
  citySlug,
  vehiclePriceNumeric,
  year,
  mileage,
  transmission,
  fuel,
  city,
}: VehicleFinancePanelProps) {
  const financeLink = buildFinanceLink(vehicleId, citySlug, vehiclePriceNumeric);
  const hasPrice = vehiclePriceNumeric != null && vehiclePriceNumeric > 0;
  const suggestedEntry = hasPrice ? vehiclePriceNumeric * 0.2 : null;
  const estimatedInstallment = hasPrice
    ? estimateMonthlyPayment(vehiclePriceNumeric, 60, 0.2)
    : null;

  return (
    <section className="rounded-[28px] border border-[#e1e7f0] bg-white p-5 shadow-[0_10px_35px_rgba(15,23,42,0.06)] md:p-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-[#0c8f73]">
            Simulador de financiamento
          </p>
          <h2 className="mt-2 text-[24px] font-extrabold tracking-[-0.02em] text-[#1d2538]">
            Simule o financiamento
          </h2>
          <p className="mt-2 max-w-2xl text-[14px] leading-7 text-[#5d6880]">
            Faça uma estimativa inicial com base no valor do veículo e siga para o simulador
            completo.
          </p>
        </div>

        <div className="grid w-full gap-3 rounded-[24px] border border-[#dce8df] bg-[#f4fbf7] p-4 lg:max-w-[360px]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-[#188267]">
                Parcela estimada
              </p>
              <p className="mt-1 text-[34px] font-extrabold leading-none text-[#166534]">
                {estimatedInstallment ? formatBrl(estimatedInstallment) : "Consulte"}
              </p>
            </div>
            <div className="rounded-2xl bg-white px-3 py-2 text-right shadow-sm">
              <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#7b869d]">
                Prazo
              </p>
              <p className="mt-1 text-[15px] font-semibold text-[#1d2538]">60 meses</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-[13px] text-[#45606f]">
            <div className="rounded-2xl bg-white px-3 py-3 shadow-sm">
              <p className="font-bold text-[#1d2538]">Entrada sugerida</p>
              <p className="mt-1">
                {suggestedEntry ? formatBrl(suggestedEntry) : "Defina no simulador"}
              </p>
            </div>
            <div className="rounded-2xl bg-white px-3 py-3 shadow-sm">
              <p className="font-bold text-[#1d2538]">Banco base</p>
              <p className="mt-1">Santander</p>
            </div>
          </div>

          <Link
            href={financeLink}
            className="inline-flex min-h-[52px] items-center justify-center rounded-2xl bg-[#138a63] px-4 text-[15px] font-bold text-white shadow-[0_14px_28px_rgba(19,138,99,0.26)] transition hover:bg-[#0f7755]"
          >
            Simular financiamento
          </Link>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3 xl:grid-cols-5">
        <DataPoint label="Ano" value={year} />
        <DataPoint label="Quilometragem" value={mileage} />
        <DataPoint label="Câmbio" value={transmission} />
        <DataPoint label="Combustível" value={fuel} />
        <DataPoint label="Cidade" value={city} />
      </div>
    </section>
  );
}
