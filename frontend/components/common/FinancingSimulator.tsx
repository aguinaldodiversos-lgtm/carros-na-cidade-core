"use client";

import { useMemo, useState } from "react";

type FinancingSimulatorProps = {
  cityLabel: string;
};

function toCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(value);
}

export default function FinancingSimulator({ cityLabel }: FinancingSimulatorProps) {
  const [vehiclePrice, setVehiclePrice] = useState(98000);
  const [downPayment, setDownPayment] = useState(20000);
  const [monthlyRate, setMonthlyRate] = useState(1.45);
  const [term, setTerm] = useState(48);

  const result = useMemo(() => {
    const financedAmount = Math.max(0, vehiclePrice - downPayment);
    const rate = monthlyRate / 100;
    const installment =
      rate === 0
        ? financedAmount / Math.max(term, 1)
        : (financedAmount * rate * Math.pow(1 + rate, term)) / (Math.pow(1 + rate, term) - 1);
    const totalPaid = downPayment + installment * term;
    const effectiveCost = vehiclePrice > 0 ? ((totalPaid / vehiclePrice) - 1) * 100 : 0;

    return {
      financedAmount,
      installment,
      totalPaid,
      effectiveCost,
      cashDifference: totalPaid - vehiclePrice,
    };
  }, [vehiclePrice, downPayment, monthlyRate, term]);

  return (
    <section className="mt-8 rounded-2xl border border-[#dfe4ef] bg-white p-5 shadow-[0_2px_16px_rgba(10,20,40,0.05)]">
      <h2 className="text-2xl font-extrabold text-[#1d2538]">Simulador de financiamento em {cityLabel}</h2>
      <p className="mt-1 text-sm text-[#5f6982]">
        Ajuste os campos para comparar parcela, total pago e custo efetivo da operacao.
      </p>

      <div className="mt-5 grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-2 block text-sm font-bold text-[#2f3953]">Valor do veiculo (R$)</span>
            <input
              type="number"
              min={0}
              step={1000}
              value={vehiclePrice}
              onChange={(event) => setVehiclePrice(Number(event.target.value))}
              className="cnc-input text-base"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-bold text-[#2f3953]">Entrada (R$)</span>
            <input
              type="number"
              min={0}
              step={1000}
              value={downPayment}
              onChange={(event) => setDownPayment(Number(event.target.value))}
              className="cnc-input text-base"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-bold text-[#2f3953]">Taxa mensal (%)</span>
            <input
              type="number"
              min={0}
              step={0.01}
              value={monthlyRate}
              onChange={(event) => setMonthlyRate(Number(event.target.value))}
              className="cnc-input text-base"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-bold text-[#2f3953]">Prazo (meses)</span>
            <input
              type="number"
              min={1}
              max={84}
              step={1}
              value={term}
              onChange={(event) => setTerm(Number(event.target.value))}
              className="cnc-input text-base"
            />
          </label>
        </div>

        <div className="grid gap-4">
          <article className="rounded-xl border border-[#e1e5ef] bg-[#f8fbff] p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#5f6980]">Valor financiado</p>
            <p className="mt-1 text-2xl font-extrabold text-[#0e62d8]">{toCurrency(result.financedAmount)}</p>
          </article>
          <article className="rounded-xl border border-[#e1e5ef] bg-[#f8fbff] p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#5f6980]">Parcela estimada</p>
            <p className="mt-1 text-2xl font-extrabold text-[#0e62d8]">{toCurrency(result.installment)}</p>
          </article>
          <article className="rounded-xl border border-[#e1e5ef] bg-[#f8fbff] p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#5f6980]">Total pago</p>
            <p className="mt-1 text-2xl font-extrabold text-[#0e62d8]">{toCurrency(result.totalPaid)}</p>
          </article>
          <article className="rounded-xl border border-[#e1e5ef] bg-[#f8fbff] p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#5f6980]">Custo efetivo</p>
            <p className="mt-1 text-2xl font-extrabold text-[#0e62d8]">{result.effectiveCost.toFixed(1)}%</p>
            <p className="mt-2 text-sm text-[#4d5670]">
              Diferenca entre financiamento e compra a vista: {toCurrency(result.cashDifference)}.
            </p>
          </article>
        </div>
      </div>
    </section>
  );
}
