// frontend/components/financing/FinancingLandingPageClient.tsx
"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import {
  IconCalculator,
  IconCarFront,
  IconChevronRight,
  IconHeart,
  IconPin,
  IconShield,
} from "@/components/home/icons";
import { FinancingSimulatorBottomDock } from "@/components/financing/FinancingSimulatorBottomDock";
import {
  computeMonthlyInstallment,
  computeTotalPaid,
  FINANCING_TERM_OPTIONS,
  type FinancingTerm,
} from "@/components/financing/financing-math";
import { getTerritorialRoutesForCity } from "@/lib/site/site-navigation";
interface FinancingLandingPageClientProps {
  citySlug: string;
  cityName: string;
  cityState: string;
  initialVehicleValue?: number;
}

const VALUE_MIN = 5_000;
const VALUE_MAX = 2_000_000;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function parseBrlInput(raw: string): number {
  const cleaned = raw
    .replace(/[^\d,.-]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function formatBrlInput(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "";
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatBrlCompact(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatBrlPrecise(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function parseRateInput(raw: string): number {
  const cleaned = raw.replace(/%/g, "").replace(/\s/g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function formatRateInput(value: number): string {
  if (!Number.isFinite(value)) return "";
  return value.toFixed(2).replace(".", ",");
}

type ShowcaseCardConfig = {
  id: string;
  title: string;
  subtitle: string;
  price: number;
  mileage: number;
  image: string;
};

const SHOWCASE_VEHICLES: ShowcaseCardConfig[] = [
  {
    id: "jeep-compass-showcase",
    title: "Jeep Compass",
    subtitle: "2022 · Limited 2.0 Flex · Automático",
    price: 129_900,
    mileage: 23_000,
    image: "/images/vehicle-placeholder.svg",
  },
  {
    id: "honda-civic-showcase",
    title: "Honda Civic",
    subtitle: "2020 · EXL 2.0 Flex · Automático",
    price: 109_900,
    mileage: 41_000,
    image: "/images/vehicle-placeholder.svg",
  },
  {
    id: "corolla-cross-showcase",
    title: "Toyota Corolla Cross",
    subtitle: "2023 · XRE 2.0 Flex · Automático",
    price: 139_900,
    mileage: 28_500,
    image: "/images/vehicle-placeholder.svg",
  },
];

function InfoHintIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 16v-5M12 8h.01" strokeLinecap="round" />
    </svg>
  );
}

function FieldShell({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="text-[12px] font-bold tracking-tight text-[#4a556d]">{label}</span>
      {children}
      {hint ? <div className="min-h-[18px]">{hint}</div> : null}
    </div>
  );
}

function CompatibleVehicleCard({
  item,
  locationLabel,
  exploreHref,
}: {
  item: ShowcaseCardConfig;
  locationLabel: string;
  exploreHref: string;
}) {
  const km = `${item.mileage.toLocaleString("pt-BR")} km`;

  return (
    <Link
      href={exploreHref}
      className="group flex w-[260px] shrink-0 snap-start flex-col overflow-hidden rounded-[14px] border border-[#e7e8f1] bg-white shadow-[0_6px_18px_rgba(15,10,40,0.06)] transition hover:-translate-y-0.5 hover:shadow-[0_12px_32px_rgba(15,10,40,0.1)] sm:w-[280px]"
    >
      <div className="relative aspect-[16/11] overflow-hidden bg-[#eef0f6]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.image}
          alt={item.title}
          width={640}
          height={440}
          className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
        />
        <span className="pointer-events-none absolute bottom-2.5 left-2.5 inline-flex rounded-lg bg-black/72 px-2 py-1 text-[11px] font-bold text-white shadow-sm backdrop-blur-[2px]">
          {km}
        </span>
        <span
          className="absolute right-2.5 top-2.5 inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/95 text-[#2d3a9c] shadow-md ring-1 ring-black/5"
          aria-hidden
        >
          <IconHeart className="h-4 w-4" />
        </span>
      </div>
      <div className="flex flex-1 flex-col px-4 pb-4 pt-3">
        <h3 className="line-clamp-1 text-[15px] font-extrabold leading-tight text-[#1a2b4c]">{item.title}</h3>
        <p className="mt-1 line-clamp-2 text-[12.5px] leading-snug text-[#5d667d]">{item.subtitle}</p>
        <p className="mt-3 text-[18px] font-extrabold text-[var(--cnc-primary)]">{formatBrlCompact(item.price)}</p>
        <p className="mt-2 inline-flex items-center gap-1 text-[12.5px] font-medium text-[#5d667d]">
          <IconPin className="h-3.5 w-3.5 shrink-0 text-[var(--cnc-primary)]" aria-hidden />
          {locationLabel}
        </p>
      </div>
    </Link>
  );
}

export function FinancingLandingPageClient({
  citySlug,
  cityName,
  cityState,
  initialVehicleValue,
}: FinancingLandingPageClientProps) {
  const router = useRouter();
  const installmentsRef = useRef<HTMLElement | null>(null);
  const formId = useId();

  const routes = useMemo(() => getTerritorialRoutesForCity(citySlug), [citySlug]);
  const comprarHref = routes.comprar;
  const locationLabel = cityState ? `${cityName} (${cityState})` : cityName;

  const initialV =
    initialVehicleValue != null && initialVehicleValue > 0
      ? clamp(Math.round(initialVehicleValue), VALUE_MIN, VALUE_MAX)
      : 120_000;

  const [vehicleValue, setVehicleValue] = useState(initialV);
  const [downPayment, setDownPayment] = useState(Math.round(initialV * 0.2));
  const [monthlyRatePct, setMonthlyRatePct] = useState(1.29);
  const [selectedTerm, setSelectedTerm] = useState<FinancingTerm>(36);

  const [vehicleRaw, setVehicleRaw] = useState(formatBrlInput(initialV));
  const [downRaw, setDownRaw] = useState(formatBrlInput(Math.round(initialV * 0.2)));
  const [rateRaw, setRateRaw] = useState(formatRateInput(1.29));

  useEffect(() => {
    if (initialVehicleValue == null || initialVehicleValue <= 0) return;
    const v = clamp(Math.round(initialVehicleValue), VALUE_MIN, VALUE_MAX);
    setVehicleValue(v);
    const d = Math.round(v * 0.2);
    setDownPayment(d);
    setVehicleRaw(formatBrlInput(v));
    setDownRaw(formatBrlInput(d));
  }, [initialVehicleValue]);

  useEffect(() => {
    setDownPayment((dp) => Math.min(dp, vehicleValue));
  }, [vehicleValue]);

  useEffect(() => {
    setDownRaw(formatBrlInput(downPayment));
  }, [downPayment]);

  const financed = Math.max(vehicleValue - downPayment, 0);

  const installments = useMemo(() => {
    return FINANCING_TERM_OPTIONS.map((term) => {
      const monthly = computeMonthlyInstallment(financed, monthlyRatePct, term);
      const totalPaid = computeTotalPaid(monthly, term, downPayment);
      return { term, monthly, totalPaid };
    });
  }, [financed, monthlyRatePct, downPayment]);

  const entryPercent =
    vehicleValue > 0 ? Math.min(999, Math.round((downPayment / vehicleValue) * 100)) : 0;

  const syncVehicleFromRaw = useCallback(() => {
    const v = clamp(parseBrlInput(vehicleRaw || "0"), VALUE_MIN, VALUE_MAX);
    setVehicleValue(v);
    setVehicleRaw(formatBrlInput(v));
  }, [vehicleRaw]);

  const syncDownFromRaw = useCallback(() => {
    const parsed = clamp(parseBrlInput(downRaw || "0"), 0, vehicleValue);
    setDownPayment(parsed);
  }, [downRaw, vehicleValue]);

  const syncRateFromRaw = useCallback(() => {
    const r = clamp(parseRateInput(rateRaw || "0"), 0, 15);
    setMonthlyRatePct(Number(r.toFixed(4)));
    setRateRaw(formatRateInput(r));
  }, [rateRaw]);

  const applySimulate = useCallback(() => {
    syncVehicleFromRaw();
    syncDownFromRaw();
    syncRateFromRaw();
    installmentsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [syncDownFromRaw, syncRateFromRaw, syncVehicleFromRaw]);

  return (
    <div className="relative bg-[#f5f7fb] text-[#1a2b4c]">
      <main className="mx-auto w-full max-w-[640px] px-4 pb-[calc(7.5rem+env(safe-area-inset-bottom))] pt-4 sm:px-5 lg:max-w-[960px] lg:px-6 lg:pb-12">
        {/* Page heading */}
        <header className="mb-6">
          <div className="flex items-start gap-3">
            <button
              type="button"
              onClick={() => {
                if (typeof window !== "undefined" && window.history.length > 1) router.back();
                else router.push("/");
              }}
              className="mt-0.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] border border-[#edf0f7] bg-white text-[#1a2b4c] shadow-[0_6px_18px_rgba(15,23,42,0.07)] transition hover:border-[#dce4f4] hover:shadow-[0_8px_22px_rgba(15,23,42,0.09)]"
              aria-label="Voltar"
            >
              <svg viewBox="0 0 24 24" width={22} height={22} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="m15 6-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="text-[24px] font-extrabold leading-[1.15] tracking-[-0.03em] text-[#12203e] sm:text-[28px]">
                Simulador de financiamento
              </h1>
              <p className="mt-2 text-[14px] font-medium leading-relaxed text-[#6b7894] sm:text-[15px]">
                Simule parcelas e encontre carros dentro do seu orçamento.
              </p>
            </div>
          </div>
        </header>

        {/* Simulator card */}
        <section
          aria-labelledby={`${formId}-title`}
          className="rounded-[22px] border border-[#dce8ff] bg-white p-4 shadow-[0_18px_48px_rgba(14,40,80,0.07)] sm:p-5"
        >
          <h2 id={`${formId}-title`} className="sr-only">
            Parâmetros do financiamento
          </h2>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FieldShell label="Valor do veículo">
              <div className="relative">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#7a869f]">
                  <IconCarFront className="h-5 w-5" />
                </span>
                <input
                  inputMode="decimal"
                  value={vehicleRaw}
                  onChange={(e) => setVehicleRaw(e.target.value)}
                  onBlur={syncVehicleFromRaw}
                  className="h-12 w-full rounded-[14px] border border-[#e3e9f5] bg-[#fbfcff] pl-12 pr-3 text-[15px] font-bold text-[#1a2b4c] outline-none ring-0 transition placeholder:text-[#9aa3b8] focus:border-[var(--cnc-primary)] focus:bg-white focus:shadow-[0_0_0_4px_rgba(14,98,216,0.12)]"
                  aria-label="Valor do veículo"
                  autoComplete="off"
                />
              </div>
            </FieldShell>

            <FieldShell
              label="Entrada"
              hint={
                <span className="inline-flex w-fit rounded-lg bg-[#eaf2ff] px-2.5 py-1 text-[11px] font-bold text-[var(--cnc-primary)]">
                  {entryPercent}% do valor do veículo
                </span>
              }
            >
              <input
                inputMode="decimal"
                value={downRaw}
                onChange={(e) => setDownRaw(e.target.value)}
                onBlur={syncDownFromRaw}
                className="h-12 w-full rounded-[14px] border border-[#e3e9f5] bg-[#fbfcff] px-3 text-[15px] font-bold text-[#1a2b4c] outline-none transition focus:border-[var(--cnc-primary)] focus:bg-white focus:shadow-[0_0_0_4px_rgba(14,98,216,0.12)]"
                aria-label="Entrada"
                autoComplete="off"
              />
            </FieldShell>

            <FieldShell label="Taxa de juros (a.m.)">
              <div className="relative">
                <input
                  inputMode="decimal"
                  value={rateRaw}
                  onChange={(e) => setRateRaw(e.target.value)}
                  onBlur={syncRateFromRaw}
                  className="h-12 w-full rounded-[14px] border border-[#e3e9f5] bg-[#fbfcff] pr-10 pl-3 text-[15px] font-bold text-[#1a2b4c] outline-none transition focus:border-[var(--cnc-primary)] focus:bg-white focus:shadow-[0_0_0_4px_rgba(14,98,216,0.12)]"
                  aria-label="Taxa de juros mensal"
                  autoComplete="off"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[13px] font-bold text-[#8893ad]">
                  %
                </span>
              </div>
            </FieldShell>

            <FieldShell label="Prazo">
              <div className="relative">
                <select
                  value={selectedTerm}
                  onChange={(e) => setSelectedTerm(Number(e.target.value) as FinancingTerm)}
                  className="h-12 w-full appearance-none rounded-[14px] border border-[#e3e9f5] bg-[#fbfcff] px-3 pr-10 text-[15px] font-bold text-[#1a2b4c] outline-none transition focus:border-[var(--cnc-primary)] focus:bg-white focus:shadow-[0_0_0_4px_rgba(14,98,216,0.12)]"
                  aria-label="Prazo do financiamento"
                >
                  {FINANCING_TERM_OPTIONS.map((t) => (
                    <option key={t} value={t}>
                      {t} meses
                    </option>
                  ))}
                </select>
                <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[#6b7894]">
                  <svg viewBox="0 0 20 20" width={18} height={18} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                    <path d="m5 7 5 6 5-6" strokeLinecap="round" />
                  </svg>
                </span>
              </div>
            </FieldShell>
          </div>

          <button
            type="button"
            onClick={applySimulate}
            className="mt-6 flex h-[52px] w-full items-center justify-center gap-2 rounded-[14px] bg-[var(--cnc-primary)] text-[15px] font-extrabold text-white shadow-[0_18px_36px_rgba(14,98,216,0.28)] transition hover:bg-[var(--cnc-primary-strong)] active:scale-[0.99]"
          >
            <IconCalculator className="h-5 w-5 text-white" />
            Simular parcelas
          </button>
        </section>

        {/* Installments table */}
        <section
          ref={installmentsRef}
          className="mt-5 rounded-[22px] border border-[#e7ecf5] bg-white p-4 shadow-[0_16px_44px_rgba(14,40,80,0.06)] sm:p-5"
          aria-label="Parcelas simuladas"
        >
          <div className="flex items-center gap-2">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[#eef4ff] text-[var(--cnc-primary)]">
              <IconCarFront className="h-5 w-5" />
            </span>
            <h2 className="text-[16px] font-extrabold tracking-tight text-[#12203e] sm:text-[17px]">Parcelas simuladas</h2>
            <InfoHintIcon className="ml-0.5 h-[18px] w-[18px] text-[#a0abbf]" />
          </div>

          <div className="mt-4 overflow-x-auto rounded-[16px] border border-[#eef1f7] [-ms-overflow-style:none] [scrollbar-width:thin]">
            <table className="w-full min-w-[340px] border-collapse text-left text-[12px] sm:text-[13px]">
              <thead>
                <tr className="border-b border-[#eef1f7] bg-[#fafbfd] text-[11px] font-extrabold uppercase tracking-wide text-[#7a869f]">
                  <th className="w-10 px-2 py-2.5 sm:px-3" scope="col">
                    <span className="sr-only">Selecionar</span>
                  </th>
                  <th className="px-2 py-2.5 sm:px-3" scope="col">
                    Prazo
                  </th>
                  <th className="px-2 py-2.5 text-right sm:px-3" scope="col">
                    Valor da parcela
                  </th>
                  <th className="px-2 py-2.5 text-right sm:px-3" scope="col">
                    Total pago
                  </th>
                </tr>
              </thead>
              <tbody>
                {installments.map((row) => {
                  const active = row.term === selectedTerm;
                  return (
                    <tr
                      key={row.term}
                      className={`border-b border-[#f0f3f9] transition last:border-b-0 ${
                        active ? "bg-[#eef6ff]" : "bg-white hover:bg-[#fafbfd]"
                      }`}
                    >
                      <td className="px-2 py-2.5 sm:px-3">
                        <button
                          type="button"
                          onClick={() => setSelectedTerm(row.term as FinancingTerm)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full"
                          aria-label={`Selecionar ${row.term} parcelas`}
                          aria-pressed={active}
                        >
                          <span
                            className={`inline-flex h-[18px] w-[18px] items-center justify-center rounded-full border-2 ${
                              active ? "border-[var(--cnc-primary)] bg-white" : "border-[#cfd7e8] bg-white"
                            }`}
                          >
                            {active ? (
                              <span className="h-2.5 w-2.5 rounded-full bg-[var(--cnc-primary)]" />
                            ) : null}
                          </span>
                        </button>
                      </td>
                      <td className="px-2 py-2.5 font-extrabold text-[#1a2b4c] sm:px-3">{row.term}x</td>
                      <td
                        className={`px-2 py-2.5 text-right font-extrabold sm:px-3 ${
                          active ? "text-[var(--cnc-primary)]" : "text-[#1a2b4c]"
                        }`}
                      >
                        {formatBrlPrecise(row.monthly)}
                      </td>
                      <td className="px-2 py-2.5 text-right font-semibold text-[#5d667d] sm:px-3">
                        {formatBrlPrecise(row.totalPaid)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-start gap-2.5 rounded-[14px] border border-[#eef1f7] bg-[#f8fafc] px-3.5 py-3 text-[12px] font-medium leading-relaxed text-[#6b7894] sm:text-[13px]">
            <IconShield className="mt-0.5 h-5 w-5 shrink-0 text-[var(--cnc-primary)]" aria-hidden />
            <p>Cálculo estimado. Valores sujeitos à análise de crédito.</p>
          </div>
        </section>

        {/* Compatible vehicles */}
        <section className="mt-8 pb-2" aria-label="Carros compatíveis com sua parcela">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#eef4ff] text-[var(--cnc-primary)]">
                <IconCarFront className="h-5 w-5" />
              </span>
              <h2 className="text-[16px] font-extrabold leading-tight tracking-tight text-[#12203e] sm:text-[17px]">
                Carros compatíveis com sua parcela
              </h2>
            </div>
            <Link
              href={comprarHref}
              className="inline-flex shrink-0 items-center gap-0.5 text-[13px] font-extrabold text-[var(--cnc-primary)] transition hover:text-[var(--cnc-primary-strong)]"
            >
              Ver todos
              <IconChevronRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {SHOWCASE_VEHICLES.map((vehicle) => (
              <CompatibleVehicleCard key={vehicle.id} item={vehicle} locationLabel={locationLabel} exploreHref={comprarHref} />
            ))}
          </div>
        </section>
      </main>

      <FinancingSimulatorBottomDock />
    </div>
  );
}

export default FinancingLandingPageClient;
