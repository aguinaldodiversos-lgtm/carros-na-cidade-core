// frontend/components/financing/FinancingLandingPageClient.tsx
"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { AdItem } from "@/lib/search/ads-search";
import AdCard from "@/components/ads/AdCard";
import PageBreadcrumbs from "@/components/common/PageBreadcrumbs";

interface FinancingLandingPageClientProps {
  citySlug: string;
  cityName: string;
  cityLabel: string;
  heroVehicle: AdItem;
  highlightAds: AdItem[];
  opportunityAds: AdItem[];
  initialVehicleValue?: number;
}

const TERMS = [12, 24, 36, 48, 60] as const;

const VALUE_MIN = 5000;
const VALUE_MAX = 500000;
const DOWN_MIN = 0;
const DOWN_MAX = 100000;
const RATE_MIN = 0.99;
const RATE_MAX = 2.99;

function parseMoney(value: number | string | null | undefined) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (!value) return 0;
  const cleaned = String(value)
    .replace(/[^\d,.-]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatCurrencyPrecise(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function resolveImage(item?: AdItem) {
  if (item?.image_url) return item.image_url;
  if (Array.isArray(item?.images) && item.images[0]) return item.images[0];
  return "/images/vehicle-placeholder.svg";
}

function resolveTitle(item?: AdItem) {
  if (!item) return "Veículo";
  if (item.title) return item.title;
  const pieces = [item.year, item.brand, item.model].filter(Boolean);
  return pieces.join(" ") || "Veículo";
}

function calculateMonthlyPayment(financedAmount: number, monthlyRatePct: number, months: number) {
  if (financedAmount <= 0 || months <= 0) return 0;
  const monthlyRate = monthlyRatePct / 100;
  if (monthlyRate === 0) return financedAmount / months;
  return (financedAmount * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -months));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function FinancingLandingPageClient({
  citySlug,
  cityName,
  cityLabel,
  heroVehicle,
  highlightAds,
  opportunityAds,
  initialVehicleValue,
}: FinancingLandingPageClientProps) {
  const initialFinanced =
    initialVehicleValue != null && initialVehicleValue > 0
      ? clamp(Math.round(initialVehicleValue), VALUE_MIN, VALUE_MAX)
      : clamp(Math.round(parseMoney(heroVehicle.price) || 80000), VALUE_MIN, VALUE_MAX);

  const [financedValue, setFinancedValue] = useState(initialFinanced);
  const [downPayment, setDownPayment] = useState(0);
  const [monthlyRate, setMonthlyRate] = useState(1.49);
  const [selectedTerm, setSelectedTerm] = useState<(typeof TERMS)[number]>(36);

  const heroImage = resolveImage(heroVehicle);
  const heroTitle = resolveTitle(heroVehicle);

  const effectiveFinanced = Math.max(financedValue - downPayment, 0);

  const summary = useMemo(() => {
    const monthlyPayment = calculateMonthlyPayment(effectiveFinanced, monthlyRate, selectedTerm);
    const totalPaid = monthlyPayment * selectedTerm + downPayment;
    const financingCost = Math.max(totalPaid - financedValue, 0);
    return { monthlyPayment, totalPaid, financingCost };
  }, [effectiveFinanced, monthlyRate, selectedTerm, downPayment, financedValue]);

  const installmentTable = useMemo(
    () =>
      TERMS.map((term) => {
        const monthly = calculateMonthlyPayment(effectiveFinanced, monthlyRate, term);
        return {
          term,
          monthly,
          total: monthly * term + downPayment,
        };
      }),
    [effectiveFinanced, monthlyRate, downPayment]
  );

  const configureList = highlightAds?.length ? highlightAds.slice(0, 4) : opportunityAds.slice(0, 4);
  const cityOffers = opportunityAds?.slice(0, 4) ?? [];

  return (
    <main className="bg-white text-[#1e2547]">
      <div className="mx-auto w-full max-w-[1200px] px-4 pb-16 pt-6 sm:px-6">
        <PageBreadcrumbs
          items={[
            { name: "Home", href: "/" },
            { name: "Comprar", href: `/comprar?city_slug=${citySlug}` },
            { name: "Simulador de Financiamento" },
          ]}
          className="mb-6"
        />

        {/* HERO */}
        <section className="grid items-center gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,520px)]">
          <div>
            <h1 className="text-[34px] font-extrabold leading-[1.05] tracking-[-0.03em] text-[#13203f] md:text-[48px]">
              Simulador de Financiamento
            </h1>
            <p className="mt-3 max-w-xl text-[16px] leading-7 text-[#5b6683] md:text-[17px]">
              Simule suas parcelas de financiamento automotivo e descubra as melhores condições
              para comprar o carro dos seus sonhos.
            </p>
          </div>

          <div className="relative ml-auto w-full max-w-[520px]">
            <div className="absolute inset-x-6 bottom-2 h-6 rounded-full bg-[#0e62d8]/10 blur-xl" />
            <div className="relative overflow-hidden rounded-[22px] bg-white">
              <img
                src={heroImage}
                alt={heroTitle}
                className="h-[230px] w-full object-contain md:h-[260px]"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).src = "/images/vehicle-placeholder.svg";
                }}
              />
            </div>
          </div>
        </section>

        {/* MAIN SIMULATOR */}
        <section className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)_minmax(0,0.9fr)]">
          {/* LEFT CARD */}
          <div className="rounded-[20px] border border-[#e6eaf2] bg-white p-6 shadow-[0_10px_30px_rgba(14,40,80,0.06)] md:p-7">
            <h2 className="text-[20px] font-extrabold text-[#13203f] md:text-[22px]">
              Simule as Parcelas do Seu Financiamento
            </h2>

            <div className="mt-6 space-y-6">
              <SliderField
                label="Valor Financiado (R$)"
                value={financedValue}
                min={VALUE_MIN}
                max={VALUE_MAX}
                step={500}
                onChange={(v) => {
                  setFinancedValue(v);
                  if (downPayment > v) setDownPayment(v);
                }}
                format={formatCurrency}
                minLabel={formatCurrency(VALUE_MIN)}
                maxLabel={formatCurrency(VALUE_MAX)}
              />

              <SliderField
                label="Entrada (R$)"
                value={downPayment}
                min={DOWN_MIN}
                max={Math.min(DOWN_MAX, financedValue)}
                step={500}
                onChange={(v) => setDownPayment(v)}
                format={formatCurrency}
                minLabel={formatCurrency(DOWN_MIN)}
                maxLabel={formatCurrency(Math.min(DOWN_MAX, financedValue))}
              />

              <SliderField
                label="Taxa de juros (a.m.)"
                value={monthlyRate}
                min={RATE_MIN}
                max={RATE_MAX}
                step={0.01}
                onChange={(v) => setMonthlyRate(Number(v.toFixed(2)))}
                format={(v) => `${v.toFixed(2)} %`}
                minLabel={`${RATE_MIN.toFixed(2)} %`}
                maxLabel={`${RATE_MAX.toFixed(2)} %`}
              />
            </div>

            <div className="mt-6 rounded-[12px] bg-[#fff8e6] px-4 py-3 text-[13px] leading-5 text-[#8a6a16] ring-1 ring-[#f4e4b3]">
              Valores simulados. As condições finais dependem de análise de crédito da financeira
              parceira. Consulte a taxa CET antes de contratar.
            </div>
          </div>

          {/* MIDDLE SUMMARY */}
          <div className="flex flex-col gap-5 rounded-[20px] border border-[#e6eaf2] bg-white p-6 shadow-[0_10px_30px_rgba(14,40,80,0.06)] md:p-7">
            <div>
              <p className="text-[14px] font-semibold uppercase tracking-wider text-[#5b6683]">
                Parcelas
              </p>
              <p className="mt-2 text-[34px] font-extrabold leading-none text-[#0e62d8] md:text-[40px]">
                {formatCurrency(summary.monthlyPayment)}
              </p>
              <p className="mt-2 text-[14px] text-[#5b6683]">
                em {selectedTerm}x · taxa de {monthlyRate.toFixed(2)}% a.m.
              </p>
            </div>

            <dl className="space-y-3 rounded-[14px] bg-[#f6f8fc] p-4">
              <SummaryRow label="Entrada" value={formatCurrency(downPayment)} />
              <SummaryRow
                label="Valor financiado"
                value={formatCurrency(effectiveFinanced)}
              />
              <SummaryRow label="Taxa de juros" value={`${monthlyRate.toFixed(2)} % a.m.`} />
            </dl>

            <button
              type="button"
              className="inline-flex h-[52px] w-full items-center justify-center rounded-[12px] bg-[#0e62d8] px-5 text-[16px] font-bold uppercase tracking-wide text-white shadow-[0_8px_20px_rgba(14,98,216,0.25)] transition hover:bg-[#0c4fb0]"
            >
              Calcular Parcelas
            </button>

            <div className="grid grid-cols-2 gap-3">
              <MiniStat
                label="Total a pagar"
                value={formatCurrency(summary.totalPaid)}
              />
              <MiniStat
                label="Custo do financiamento"
                value={formatCurrency(summary.financingCost)}
                muted
              />
            </div>
          </div>

          {/* RIGHT COLUMN */}
          <div className="flex flex-col gap-5">
            <Link
              href={`/comprar?city_slug=${citySlug}&valor=${financedValue}`}
              className="group relative inline-flex h-[72px] w-full items-center justify-between gap-3 overflow-hidden rounded-[14px] bg-gradient-to-r from-[#0e62d8] to-[#1271ef] px-5 text-left text-white shadow-[0_12px_30px_rgba(14,98,216,0.28)] transition hover:from-[#0c4fb0] hover:to-[#0e62d8]"
            >
              <div>
                <div className="text-[12px] font-semibold uppercase tracking-wider text-white/80">
                  Continuar com este valor
                </div>
                <div className="text-[17px] font-extrabold leading-tight">
                  Verificar Crédito Agora
                </div>
              </div>
              <svg
                viewBox="0 0 24 24"
                className="h-6 w-6 shrink-0 transition group-hover:translate-x-1"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 12h14" />
                <path d="m13 6 6 6-6 6" />
              </svg>
            </Link>

            <div className="overflow-hidden rounded-[16px] border border-[#e6eaf2] bg-white shadow-[0_10px_30px_rgba(14,40,80,0.06)]">
              <div className="border-b border-[#e6eaf2] bg-[#f6f8fc] px-5 py-3">
                <h3 className="text-[15px] font-bold text-[#13203f]">Opções de Parcelamento</h3>
              </div>

              <table className="w-full text-[14px]">
                <thead>
                  <tr className="text-left text-[12px] font-semibold uppercase tracking-wider text-[#5b6683]">
                    <th className="px-4 py-2 font-semibold">Prazo</th>
                    <th className="px-4 py-2 text-right font-semibold">Mensal</th>
                    <th className="px-4 py-2 text-right font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {installmentTable.map((row) => {
                    const isActive = row.term === selectedTerm;
                    return (
                      <tr
                        key={row.term}
                        onClick={() => setSelectedTerm(row.term)}
                        className={`cursor-pointer border-t border-[#eef1f7] transition hover:bg-[#f6f8fc] ${
                          isActive ? "bg-[#eaf2ff]" : "bg-white"
                        }`}
                      >
                        <td
                          className={`px-4 py-2.5 font-semibold ${
                            isActive ? "text-[#0e62d8]" : "text-[#13203f]"
                          }`}
                        >
                          {row.term} meses
                        </td>
                        <td
                          className={`px-4 py-2.5 text-right font-semibold ${
                            isActive ? "text-[#0e62d8]" : "text-[#13203f]"
                          }`}
                        >
                          {formatCurrencyPrecise(row.monthly)}
                        </td>
                        <td className="px-4 py-2.5 text-right text-[#5b6683]">
                          {formatCurrency(row.total)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="border-t border-[#eef1f7] px-4 py-3 text-[12px] leading-5 text-[#7a8398]">
                Valores aproximados calculados sobre a tabela Price. Clique em um prazo para
                atualizar o resumo.
              </p>
            </div>
          </div>
        </section>

        {/* CONFIGURE + SIDEBAR */}
        <section className="mt-14 grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div>
            <h2 className="text-[22px] font-extrabold text-[#13203f] md:text-[26px]">
              Configure Suas Parcelas do Financiamento
            </h2>
            <p className="mt-2 text-[15px] text-[#5b6683]">
              Explore veículos com parcelas próximas às que você simulou e continue ajustando seu
              financiamento.
            </p>

            <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {configureList.map((item, index) => (
                <AdCard key={`${item.id ?? item.slug ?? index}-cfg`} item={item} />
              ))}
            </div>
          </div>

          <aside className="flex h-fit flex-col items-center overflow-hidden rounded-[20px] border border-[#e6eaf2] bg-gradient-to-b from-[#eaf2ff] to-white p-6 text-center shadow-[0_10px_30px_rgba(14,40,80,0.06)]">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#0e62d8]/10 text-[#0e62d8]">
              <svg
                viewBox="0 0 24 24"
                className="h-8 w-8"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 11v2a2 2 0 0 0 2 2h2l4 3V6L7 9H5a2 2 0 0 0-2 2Z" />
                <path d="M15 8a5 5 0 0 1 0 8" />
                <path d="M18 5a9 9 0 0 1 0 14" />
              </svg>
            </div>
            <h3 className="mt-4 text-[20px] font-extrabold text-[#13203f]">
              Anuncie seu carro grátis!
            </h3>
            <p className="mt-2 text-[14px] leading-6 text-[#5b6683]">
              Cadastre seu veículo em poucos minutos e alcance compradores da sua cidade sem pagar
              taxa.
            </p>
            <Link
              href="/planos"
              className="mt-5 inline-flex h-[48px] w-full items-center justify-center rounded-[12px] bg-[#0e62d8] px-5 text-[15px] font-bold uppercase tracking-wide text-white shadow-[0_8px_18px_rgba(14,98,216,0.25)] transition hover:bg-[#0c4fb0]"
            >
              Anunciar Grátis
            </Link>
          </aside>
        </section>

        {/* CITY OFFERS */}
        <section className="mt-14">
          <div className="flex items-end justify-between gap-4">
            <h2 className="text-[22px] font-extrabold text-[#13203f] md:text-[26px]">
              Ofertas de carros usados em {cityName}
            </h2>
            <Link
              href={`/comprar?city_slug=${citySlug}`}
              className="hidden text-[14px] font-semibold text-[#0e62d8] hover:text-[#0c4fb0] md:inline-flex"
            >
              Ver todas &rarr;
            </Link>
          </div>

          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {cityOffers.map((item, index) => (
              <AdCard key={`${item.id ?? item.slug ?? index}-offer`} item={item} />
            ))}
          </div>

          {cityOffers.length === 0 ? (
            <p className="mt-6 rounded-[14px] border border-dashed border-[#e6eaf2] bg-[#f6f8fc] px-5 py-8 text-center text-[14px] text-[#5b6683]">
              Ainda não há ofertas carregadas para {cityLabel}. Volte em breve ou explore outras
              regiões.
            </p>
          ) : null}

          <div className="mt-6 flex justify-center md:hidden">
            <Link
              href={`/comprar?city_slug=${citySlug}`}
              className="inline-flex h-[48px] items-center justify-center rounded-[12px] border border-[#0e62d8] px-6 text-[15px] font-bold text-[#0e62d8]"
            >
              Ver todas as ofertas
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}

function SliderField({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
  minLabel,
  maxLabel,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  format: (value: number) => string;
  minLabel: string;
  maxLabel: string;
}) {
  const pct = max - min > 0 ? ((value - min) / (max - min)) * 100 : 0;

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <label className="text-[14px] font-semibold text-[#5b6683]">{label}</label>
        <span className="text-[16px] font-extrabold text-[#0e62d8]">{format(value)}</span>
      </div>

      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 block w-full cursor-pointer appearance-none bg-transparent
          [&::-webkit-slider-runnable-track]:h-[6px] [&::-webkit-slider-runnable-track]:rounded-full
          [&::-webkit-slider-runnable-track]:bg-[length:100%_100%] [&::-webkit-slider-runnable-track]:bg-no-repeat
          [&::-moz-range-track]:h-[6px] [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-[#e6eaf2]
          [&::-webkit-slider-thumb]:-mt-[7px] [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-[3px] [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-[#0e62d8] [&::-webkit-slider-thumb]:shadow-[0_2px_6px_rgba(14,98,216,0.45)]
          [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-[3px] [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-[#0e62d8] [&::-moz-range-thumb]:shadow-[0_2px_6px_rgba(14,98,216,0.45)]"
        style={{
          backgroundImage: `linear-gradient(to right, #0e62d8 ${pct}%, #e6eaf2 ${pct}%)`,
          backgroundSize: "100% 6px",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
        }}
      />

      <div className="mt-1.5 flex justify-between text-[11px] font-medium text-[#8791a7]">
        <span>{minLabel}</span>
        <span>{maxLabel}</span>
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-[14px] text-[#5b6683]">{label}</dt>
      <dd className="text-[15px] font-semibold text-[#13203f]">{value}</dd>
    </div>
  );
}

function MiniStat({
  label,
  value,
  muted = false,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="rounded-[12px] border border-[#eef1f7] bg-white px-3 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-[#7a8398]">{label}</p>
      <p
        className={`mt-1 text-[15px] font-extrabold leading-tight ${
          muted ? "text-[#13203f]" : "text-[#0e62d8]"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

export default FinancingLandingPageClient;
