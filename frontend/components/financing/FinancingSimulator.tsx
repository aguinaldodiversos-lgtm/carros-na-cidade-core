"use client";

import { useEffect, useMemo, useState, type ChangeEvent } from "react";

/**
 * FinancingSimulator — núcleo interativo do simulador de financiamento,
 * COMPARTILHADO entre /simulador-financiamento/[cidade] e a página do anúncio.
 *
 * Fonte ÚNICA do cálculo de parcela. Antes, a mesma fórmula estava triplicada
 * com taxas padrão divergentes (1,29% no simulador, 1,45% e 1,99% em componentes
 * órfãos) — ou seja, o usuário via parcelas diferentes conforme a tela. Isso era
 * bug de produção, não dívida técnica; esta unificação elimina as três cópias.
 *
 * Taxa padrão: DEFAULT_MONTHLY_RATE = 1,29% a.m. — escolhida por ser a ÚNICA que
 * já era visível em produção (o /simulador); as outras duas viviam só em código
 * morto. Trocar para uma taxa mais realista é decisão de produto à parte.
 *
 * Renderiza o card de parâmetros (Valor/Entrada/Taxa/Prazo) + a tabela de
 * parcelas 12/24/36/48/60x. `valueEditable=false` fixa o valor do veículo (preço
 * do anúncio) — o usuário só mexe em entrada/taxa/prazo. `onResultChange` expõe a
 * simulação atual (ex.: para compor o texto do WhatsApp no anúncio).
 */

const TERMS = [12, 24, 36, 48, 60] as const;
type TermOption = (typeof TERMS)[number];

const VALUE_MIN = 5_000;
const VALUE_MAX = 500_000;
const DOWN_MIN = 0;
const RATE_MIN = 0.5;
const RATE_MAX = 3.5;

/** Taxa mensal padrão (a.m.). Ver nota de unificação no topo do arquivo. */
export const DEFAULT_MONTHLY_RATE = 1.29;

export type SimulationResult = {
  vehicleValue: number;
  downPayment: number;
  monthlyRate: number;
  term: number;
  installment: number;
};

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

function formatBRL(value: number, fractionDigits: number = 2) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

/** Parcela mensal pela fórmula de amortização (Price). Fonte única de cálculo. */
function calculateMonthlyPayment(financedAmount: number, monthlyRatePct: number, months: number) {
  if (financedAmount <= 0 || months <= 0) return 0;
  const monthlyRate = monthlyRatePct / 100;
  if (monthlyRate === 0) return financedAmount / months;
  return (financedAmount * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -months));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function CarPrefixIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 14V12l2-5a2 2 0 0 1 1.9-1.4h10.2A2 2 0 0 1 19 7l2 5v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
      <path d="M6 11h12" />
      <circle cx="7.5" cy="14" r="1" />
      <circle cx="16.5" cy="14" r="1" />
    </svg>
  );
}

function CalculatorIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M8 7h8M8 11h2M12 11h4M8 15h2M12 15h4M8 19h2M12 19h4" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v.01M12 11v5" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3 5 6v6c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6l-7-3Z" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function CarSectionIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 14V12l2-5a2 2 0 0 1 1.9-1.4h10.2A2 2 0 0 1 19 7l2 5v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
      <path d="M6 11h12" />
      <circle cx="7.5" cy="14" r="1" />
      <circle cx="16.5" cy="14" r="1" />
    </svg>
  );
}

export default function FinancingSimulator({
  initialVehicleValue,
  valueEditable = true,
  onResultChange,
}: {
  initialVehicleValue?: number;
  /** Quando false, o valor do veículo é fixo (preço do anúncio) — não editável. */
  valueEditable?: boolean;
  onResultChange?: (result: SimulationResult) => void;
}) {
  const initialValue =
    initialVehicleValue != null && initialVehicleValue > 0
      ? clamp(Math.round(initialVehicleValue), VALUE_MIN, VALUE_MAX)
      : 120_000;

  const [vehicleValue, setVehicleValue] = useState(initialValue);
  const [downPayment, setDownPayment] = useState(Math.round(initialValue * 0.2));
  const [monthlyRate, setMonthlyRate] = useState(DEFAULT_MONTHLY_RATE);
  const [selectedTerm, setSelectedTerm] = useState<TermOption>(12);

  // Valor read-only (anúncio): mantém o preço sincronizado se a prop mudar,
  // sem deixar a entrada passar do valor do veículo.
  useEffect(() => {
    if (valueEditable) return;
    if (initialVehicleValue == null || initialVehicleValue <= 0) return;
    const next = clamp(Math.round(initialVehicleValue), VALUE_MIN, VALUE_MAX);
    setVehicleValue(next);
    setDownPayment((prev) => Math.min(prev, next));
  }, [valueEditable, initialVehicleValue]);

  const effectiveFinanced = Math.max(vehicleValue - downPayment, 0);
  const downPaymentPct = vehicleValue > 0 ? Math.round((downPayment / vehicleValue) * 100) : 0;

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

  const selectedInstallment =
    installmentTable.find((row) => row.term === selectedTerm)?.monthly ?? 0;

  useEffect(() => {
    onResultChange?.({
      vehicleValue,
      downPayment,
      monthlyRate,
      term: selectedTerm,
      installment: selectedInstallment,
    });
  }, [onResultChange, vehicleValue, downPayment, monthlyRate, selectedTerm, selectedInstallment]);

  return (
    <>
      {/* Form card */}
      <section
        aria-label="Parâmetros do financiamento"
        className="rounded-2xl border border-cnc-line bg-white p-4 shadow-card sm:p-5"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {valueEditable ? (
            <CurrencyField
              label="Valor do veículo"
              value={vehicleValue}
              onChange={(v) => {
                const next = clamp(v, VALUE_MIN, VALUE_MAX);
                setVehicleValue(next);
                if (downPayment > next) setDownPayment(next);
              }}
            />
          ) : (
            <ReadOnlyValueField label="Valor do veículo" value={formatBRL(vehicleValue, 2)} />
          )}

          <div>
            <CurrencyField
              label="Entrada"
              value={downPayment}
              onChange={(v) => setDownPayment(clamp(v, DOWN_MIN, vehicleValue))}
            />
            <p className="mt-1 inline-flex rounded-md bg-primary-soft px-2 py-0.5 text-[11px] font-semibold leading-tight text-primary">
              {downPaymentPct}% do valor do veículo
            </p>
          </div>

          <RateField
            label="Taxa de juros (a.m.)"
            value={monthlyRate}
            onChange={(v) => setMonthlyRate(clamp(Number(v.toFixed(2)), RATE_MIN, RATE_MAX))}
          />

          <SelectField
            label="Prazo"
            value={selectedTerm}
            onChange={(v) => setSelectedTerm(v as TermOption)}
            options={TERMS.map((t) => ({ value: t, label: `${t} meses` }))}
          />
        </div>

        <button
          type="button"
          className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-[15px] font-bold text-white shadow-card transition hover:bg-primary-strong"
        >
          <CalculatorIcon />
          Simular parcelas
        </button>
      </section>

      {/* Parcelas simuladas card */}
      <section
        aria-label="Parcelas simuladas"
        className="mt-5 rounded-2xl border border-cnc-line bg-white p-4 shadow-card sm:p-5"
      >
        <div className="flex items-center gap-2">
          <span className="text-cnc-text-strong">
            <CarSectionIcon />
          </span>
          <h2 className="text-[16px] font-extrabold leading-tight text-cnc-text-strong sm:text-[18px]">
            Parcelas simuladas
          </h2>
          <button
            type="button"
            aria-label="Como o cálculo é feito"
            className="text-cnc-muted-soft transition hover:text-cnc-text-strong"
          >
            <InfoIcon />
          </button>
        </div>

        {/* Header row */}
        <div className="mt-3 grid grid-cols-[2.25rem_minmax(0,0.7fr)_minmax(0,1.2fr)_minmax(0,1fr)] items-center gap-x-2 px-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-cnc-muted-soft">
          <span aria-hidden="true" />
          <span>Prazo</span>
          <span>Valor da parcela</span>
          <span className="text-right">Total pago</span>
        </div>

        {/* Rows */}
        <div className="space-y-1">
          {installmentTable.map((row) => {
            const isActive = row.term === selectedTerm;
            return (
              <button
                key={row.term}
                type="button"
                onClick={() => setSelectedTerm(row.term)}
                aria-pressed={isActive}
                className={`grid w-full grid-cols-[2.25rem_minmax(0,0.7fr)_minmax(0,1.2fr)_minmax(0,1fr)] items-center gap-x-2 rounded-xl px-1 py-3 text-left transition ${
                  isActive ? "bg-primary-soft" : "hover:bg-cnc-bg"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`inline-flex h-5 w-5 items-center justify-center rounded-full border-2 transition ${
                    isActive ? "border-primary bg-white" : "border-cnc-muted-soft bg-white"
                  }`}
                >
                  {isActive ? <span className="h-2.5 w-2.5 rounded-full bg-primary" /> : null}
                </span>
                <span
                  className={`text-[14px] font-semibold ${
                    isActive ? "text-primary" : "text-cnc-text-strong"
                  }`}
                >
                  {row.term}x
                </span>
                <span
                  className={`text-[15px] font-extrabold tabular-nums ${
                    isActive ? "text-primary" : "text-cnc-text-strong"
                  }`}
                >
                  {formatBRL(row.monthly)}
                </span>
                <span className="text-right text-[13px] tabular-nums text-cnc-muted">
                  {formatBRL(row.total)}
                </span>
              </button>
            );
          })}
        </div>

        {/* Disclaimer */}
        <p className="mt-3 flex items-center gap-2 rounded-xl bg-primary-soft px-3 py-2.5 text-[12.5px] leading-snug text-cnc-muted">
          <span className="text-primary">
            <ShieldIcon />
          </span>
          <span>Cálculo estimado. Valores sujeitos à análise de crédito.</span>
        </p>
      </section>
    </>
  );
}

/* ----------------------------------------------------------------------
 * Inputs
 * ---------------------------------------------------------------------- */

/**
 * Hook auxiliar: mantém uma string-rascunho enquanto o input está focado para
 * que o cursor não pule a cada keystroke por causa de re-formatação.
 */
function useDraftValue<T>(
  formatted: string,
  parse: (raw: string) => T | null,
  commit: (next: T) => void
) {
  const [draft, setDraft] = useState<string | null>(null);
  const display = draft !== null ? draft : formatted;

  return {
    value: display,
    onChange: (e: ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      setDraft(raw);
      const parsed = parse(raw);
      if (parsed !== null) commit(parsed);
    },
    onFocus: () => setDraft(formatted),
    onBlur: () => setDraft(null),
  };
}

/** Campo de valor read-only (preço do anúncio) — espelha o visual do CurrencyField. */
function ReadOnlyValueField({ label, value }: { label: string; value: string }) {
  return (
    <label className="block">
      <span className="block text-[12px] font-semibold leading-tight text-cnc-muted">{label}</span>
      <span className="mt-1.5 flex items-center gap-2 rounded-xl border border-cnc-line bg-cnc-bg px-3 py-2.5">
        <span className="shrink-0 text-cnc-muted-soft">
          <CarPrefixIcon />
        </span>
        <span className="w-full text-[15px] font-bold tabular-nums text-cnc-text-strong">
          {value}
        </span>
        <span className="shrink-0 text-[11px] font-semibold text-cnc-muted-soft">
          preço do anúncio
        </span>
      </span>
    </label>
  );
}

function CurrencyField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
}) {
  const draft = useDraftValue<number>(
    formatBRL(value, 2),
    (raw) => {
      const parsed = parseMoney(raw);
      return Number.isFinite(parsed) ? parsed : null;
    },
    onChange
  );

  return (
    <label className="block">
      <span className="block text-[12px] font-semibold leading-tight text-cnc-muted">{label}</span>
      <span className="mt-1.5 flex items-center gap-2 rounded-xl border border-cnc-line bg-white px-3 py-2.5 transition focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
        <span className="shrink-0 text-cnc-muted-soft">
          <CarPrefixIcon />
        </span>
        <input
          type="text"
          inputMode="numeric"
          value={draft.value}
          onChange={draft.onChange}
          onFocus={draft.onFocus}
          onBlur={draft.onBlur}
          className="w-full bg-transparent text-[15px] font-bold tabular-nums text-cnc-text-strong outline-none placeholder:text-cnc-muted-soft"
        />
      </span>
    </label>
  );
}

function RateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
}) {
  const draft = useDraftValue<number>(
    value.toFixed(2).replace(".", ","),
    (raw) => {
      const cleaned = raw.replace(/[^\d,.-]/g, "").replace(",", ".");
      const n = Number(cleaned);
      return Number.isFinite(n) ? n : null;
    },
    onChange
  );

  return (
    <label className="block">
      <span className="block text-[12px] font-semibold leading-tight text-cnc-muted">{label}</span>
      <span className="mt-1.5 flex items-center gap-2 rounded-xl border border-cnc-line bg-white px-3 py-2.5 transition focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
        <input
          type="text"
          inputMode="decimal"
          value={draft.value}
          onChange={draft.onChange}
          onFocus={draft.onFocus}
          onBlur={draft.onBlur}
          className="w-full bg-transparent text-[15px] font-bold tabular-nums text-cnc-text-strong outline-none placeholder:text-cnc-muted-soft"
        />
        <span className="shrink-0 text-[13px] font-semibold text-cnc-muted-soft">%</span>
      </span>
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
  options: ReadonlyArray<{ value: number; label: string }>;
}) {
  return (
    <label className="block">
      <span className="block text-[12px] font-semibold leading-tight text-cnc-muted">{label}</span>
      <span className="relative mt-1.5 flex items-center gap-2 rounded-xl border border-cnc-line bg-white px-3 py-2.5 transition focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
        <select
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full appearance-none bg-transparent pr-6 text-[15px] font-bold text-cnc-text-strong outline-none"
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-3 text-cnc-muted-soft"
        >
          <ChevronDownIcon />
        </span>
      </span>
    </label>
  );
}
