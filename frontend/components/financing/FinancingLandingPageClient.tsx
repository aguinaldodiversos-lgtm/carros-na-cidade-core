// frontend/components/financing/FinancingLandingPageClient.tsx
"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { AdItem } from "@/lib/search/ads-search";

interface FinancingLandingPageClientProps {
  citySlug: string;
  cityName: string;
  cityLabel: string;
  heroVehicle: AdItem;
  highlightAds: AdItem[];
  opportunityAds: AdItem[];
}

type VehicleTypeOption = "SUV" | "Hatch" | "Sedã" | "Picape" | "Utilitário";
type VehicleConditionOption = "Novo" | "Novo ou semi" | "Seminovo" | "Usado";
type TermOption = 12 | 24 | 36 | 48 | 60 | 72;

type FormState = {
  vehicleType: VehicleTypeOption;
  pricePreset: string;
  vehicleValue: number;
  downPayment: number;
  condition: VehicleConditionOption;
  term: TermOption;
  monthlyRate: number;
};

const VEHICLE_TYPES: VehicleTypeOption[] = [
  "SUV",
  "Hatch",
  "Sedã",
  "Picape",
  "Utilitário",
];

const VALUE_PRESETS = [
  { label: "Valor do Veículo", value: "" },
  { label: "Até R$ 60.000", value: "60000" },
  { label: "Até R$ 80.000", value: "80000" },
  { label: "Até R$ 100.000", value: "100000" },
  { label: "Até R$ 120.000", value: "120000" },
  { label: "Até R$ 150.000", value: "150000" },
  { label: "Até R$ 200.000", value: "200000" },
];

const DOWN_PAYMENT_PRESETS = [
  { label: "R$ 10.000", value: 10000 },
  { label: "R$ 15.000", value: 15000 },
  { label: "R$ 20.000", value: 20000 },
  { label: "R$ 30.000", value: 30000 },
  { label: "R$ 40.000", value: 40000 },
];

const VEHICLE_CONDITIONS: VehicleConditionOption[] = [
  "Novo",
  "Novo ou semi",
  "Seminovo",
  "Usado",
];

const TERMS: TermOption[] = [12, 24, 36, 48, 60, 72];
const RATES = [1.29, 1.39, 1.59, 1.79, 1.99, 2.19, 2.39];

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

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

function formatMileage(value?: number | string) {
  const numeric = parseMoney(value);
  if (!numeric) return "28.856 km";
  return `${Math.round(numeric).toLocaleString("pt-BR")} km`;
}

function resolveImage(item?: AdItem) {
  if (item?.image_url) return item.image_url;
  if (Array.isArray(item?.images) && item.images[0]) return item.images[0];
  return "/images/hero.jpeg";
}

function resolveTitle(item?: AdItem) {
  if (!item) return "2022/2023 Volkswagen T-Cross";
  if (item.title) return item.title;
  const pieces = [item.year, item.brand, item.model].filter(Boolean);
  return pieces.join(" ") || "Volkswagen T-Cross";
}

function resolveLink(item?: AdItem) {
  if (!item) return "/comprar";
  if (item.slug) return `/veiculo/${item.slug}`;
  return `/anuncios/${item.id}`;
}

function calculateMonthlyPayment(financedAmount: number, monthlyRatePct: number, months: number) {
  if (financedAmount <= 0 || months <= 0) return 0;

  const monthlyRate = monthlyRatePct / 100;

  if (monthlyRate === 0) return financedAmount / months;

  return (
    (financedAmount * monthlyRate) /
    (1 - Math.pow(1 + monthlyRate, -months))
  );
}

function buildOpportunityItems(items: AdItem[], cityName: string): AdItem[] {
  if (items.length > 0) return items.slice(0, 3);

  return [
    {
      id: 999101,
      title: "2022 Hyundai Creta",
      city: cityName,
      state: "SP",
      price: 89900,
      below_fipe: true,
      image_url: "/images/hero.jpeg",
    },
    {
      id: 999102,
      title: "2021 Volkswagen T-Cross",
      city: cityName,
      state: "SP",
      price: 85900,
      below_fipe: true,
      image_url: "/images/hero.jpeg",
    },
    {
      id: 999103,
      title: "2023 Nissan Kicks",
      city: cityName,
      state: "SP",
      price: 97900,
      below_fipe: true,
      image_url: "/images/hero.jpeg",
    },
  ];
}

export function FinancingLandingPageClient({
  citySlug,
  cityName,
  cityLabel,
  heroVehicle,
  opportunityAds,
}: FinancingLandingPageClientProps) {
  const initialPrice = parseMoney(heroVehicle.price) || 105900;

  const [form, setForm] = useState<FormState>({
    vehicleType: "SUV",
    pricePreset: "100000",
    vehicleValue: 100000,
    downPayment: 20000,
    condition: "Novo ou semi",
    term: 36,
    monthlyRate: 1.99,
  });

  const displayHeroTitle = resolveTitle(heroVehicle);
  const displayHeroImage = resolveImage(heroVehicle);

  const simulated = useMemo(() => {
    const entry = Math.min(form.downPayment, form.vehicleValue);
    const financedAmount = Math.max(form.vehicleValue - entry, 0);
    const monthlyPayment = calculateMonthlyPayment(
      financedAmount,
      form.monthlyRate,
      form.term
    );
    const totalPaid = monthlyPayment * form.term + entry;
    const financedPct = form.vehicleValue > 0 ? (entry / form.vehicleValue) * 100 : 0;

    const localDiscount =
      initialPrice > 0
        ? Math.max(
            0,
            Math.round(((initialPrice - form.vehicleValue) / initialPrice) * 100)
          )
        : 20;

    return {
      entry,
      financedAmount,
      monthlyPayment,
      totalPaid,
      financedPct,
      localDiscount: localDiscount || 20,
    };
  }, [form, initialPrice]);

  const cards = useMemo(
    () => buildOpportunityItems(opportunityAds, cityName),
    [opportunityAds, cityName]
  );

  return (
    <main className="bg-[#f5f7fc]">
      <section className="relative overflow-hidden border-b border-[#e7ebf3] bg-[linear-gradient(180deg,#fbfcff_0%,#f3f6fb_100%)]">
        <div
          className="absolute inset-x-0 top-0 h-[420px] bg-cover bg-center opacity-20"
          style={{ backgroundImage: "url('/images/hero.jpeg')" }}
        />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.92),rgba(245,247,252,0.82)_44%,rgba(245,247,252,0.98)_100%)]" />

        <div className="relative mx-auto w-full max-w-7xl px-4 pb-10 pt-10 sm:px-6 md:pb-14 md:pt-12">
          <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_430px]">
            <div>
              <h1 className="max-w-4xl text-[40px] font-extrabold leading-[1.06] tracking-[-0.035em] text-[#1e2547] md:text-[64px]">
                Simule o financiamento do seu carro
              </h1>

              <p className="mt-5 max-w-3xl text-[18px] leading-8 text-[#5f6780] md:text-[22px]">
                Descubra as parcelas, taxas e condições para realizar o sonho do
                carro novo ou usado.
              </p>

              <div className="mt-8 rounded-[24px] border border-[#e6eaf2] bg-white p-6 shadow-[0_18px_40px_rgba(30,37,71,0.08)] md:p-7">
                <h2 className="text-[26px] font-extrabold text-[#1e2547]">
                  Simulador de Financiamento
                </h2>

                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <FieldLabel label="Tipo de Veículo">
                    <select
                      value={form.vehicleType}
                      onChange={(e) =>
                        setForm((current) => ({
                          ...current,
                          vehicleType: e.target.value as VehicleTypeOption,
                        }))
                      }
                      className={selectClassName}
                    >
                      {VEHICLE_TYPES.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                  </FieldLabel>

                  <FieldLabel label="Valor do Veículo">
                    <select
                      value={form.pricePreset}
                      onChange={(e) => {
                        const nextValue = e.target.value;
                        setForm((current) => ({
                          ...current,
                          pricePreset: nextValue,
                          vehicleValue: nextValue ? Number(nextValue) : current.vehicleValue,
                        }));
                      }}
                      className={selectClassName}
                    >
                      {VALUE_PRESETS.map((item) => (
                        <option key={item.label} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </FieldLabel>

                  <FieldLabel label="">
                    <input
                      value={formatCurrency(form.vehicleValue)}
                      onChange={(e) =>
                        setForm((current) => ({
                          ...current,
                          vehicleValue: parseMoney(e.target.value),
                          pricePreset: "",
                        }))
                      }
                      className={inputClassName}
                    />
                  </FieldLabel>

                  <FieldLabel label="">
                    <select
                      value={String(form.downPayment)}
                      onChange={(e) =>
                        setForm((current) => ({
                          ...current,
                          downPayment: Number(e.target.value),
                        }))
                      }
                      className={selectClassName}
                    >
                      {DOWN_PAYMENT_PRESETS.map((item) => (
                        <option key={item.value} value={item.value}>
                          {formatCurrency(item.value)}
                        </option>
                      ))}
                    </select>
                  </FieldLabel>

                  <FieldLabel label="Entrada">
                    <input
                      value={formatCurrency(form.downPayment)}
                      onChange={(e) =>
                        setForm((current) => ({
                          ...current,
                          downPayment: parseMoney(e.target.value),
                        }))
                      }
                      className={inputClassName}
                    />
                  </FieldLabel>

                  <FieldLabel label="">
                    <select
                      value={form.condition}
                      onChange={(e) =>
                        setForm((current) => ({
                          ...current,
                          condition: e.target.value as VehicleConditionOption,
                        }))
                      }
                      className={selectClassName}
                    >
                      {VEHICLE_CONDITIONS.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                  </FieldLabel>

                  <FieldLabel label="Prazo de Pagamento">
                    <div className="grid grid-cols-[1fr_150px] gap-0 rounded-[14px] border border-[#e6eaf2] bg-white">
                      <div className="flex items-center px-4 text-[16px] font-medium text-[#1e2547]">
                        Prazo de Pagamento
                      </div>
                      <select
                        value={String(form.term)}
                        onChange={(e) =>
                          setForm((current) => ({
                            ...current,
                            term: Number(e.target.value) as TermOption,
                          }))
                        }
                        className="h-[58px] rounded-r-[14px] border-l border-[#e6eaf2] bg-white px-4 text-[16px] font-semibold text-[#1e2547] outline-none"
                      >
                        {TERMS.map((item) => (
                          <option key={item} value={item}>
                            {item} meses
                          </option>
                        ))}
                      </select>
                    </div>
                  </FieldLabel>

                  <div />
                </div>

                <div className="mt-5 grid items-center gap-4 rounded-[16px] bg-[#fafbfe] p-4 ring-1 ring-[#eef1f6] md:grid-cols-[1fr_180px]">
                  <div className="text-[18px] font-semibold text-[#3a4561]">
                    Taxa de Juros (a.m.)
                  </div>

                  <select
                    value={String(form.monthlyRate)}
                    onChange={(e) =>
                      setForm((current) => ({
                        ...current,
                        monthlyRate: Number(e.target.value),
                      }))
                    }
                    className="h-[54px] rounded-[12px] border border-[#e6eaf2] bg-white px-4 text-right text-[18px] font-extrabold text-[#1e2547] outline-none"
                  >
                    {RATES.map((rate) => (
                      <option key={rate} value={rate}>
                        {rate.toFixed(2)} %
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="button"
                  className="mt-5 inline-flex h-[56px] w-full items-center justify-center rounded-[14px] bg-[#f5a623] px-6 text-[22px] font-extrabold text-white shadow-[0_14px_28px_rgba(245,166,35,0.26)] transition hover:bg-[#eb9e16]"
                >
                  Simular parcelas
                </button>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <FeatureMiniCard
                  iconColor="orange"
                  title="Compra segura"
                  description="Negociar direto sem intermediadores, anúncios verificados"
                  ctaLabel="Anuncie agora"
                  ctaHref="/planos"
                  ctaVariant="orange"
                />

                <FeatureMiniCard
                  iconColor="blue"
                  title="Foco na sua cidade"
                  description={`Encontre o veículo perfeito, perto de você em ${cityName}`}
                  ctaLabel="Ver ofertas"
                  ctaHref={`/comprar?city_slug=${citySlug}`}
                  ctaVariant="blue"
                />
              </div>
            </div>

            <div className="relative">
              <div className="overflow-hidden rounded-[28px] border border-[#e6eaf2] bg-white shadow-[0_24px_52px_rgba(30,37,71,0.10)]">
                <div className="relative aspect-[1.16/0.84] overflow-hidden bg-[#eef2f8]">
                  <img
                    src={displayHeroImage}
                    alt={displayHeroTitle}
                    className="h-full w-full object-cover"
                  />
                </div>

                <div className="px-6 pb-6 pt-4">
                  <h3 className="text-[18px] font-extrabold text-[#1e2547] md:text-[22px]">
                    {displayHeroTitle}
                  </h3>

                  <p className="mt-2 text-[16px] text-[#646d83]">{cityLabel}</p>

                  <div className="mt-5 flex items-center justify-between gap-4">
                    <div>
                      <div className="text-[34px] font-extrabold leading-none text-[#153e9f] md:text-[46px]">
                        {formatCurrency(form.vehicleValue)}
                      </div>
                      <p className="mt-2 text-[16px] text-[#5c6580]">
                        em {form.term}x {form.downPayment > 0 ? "com entrada" : "sem entrada"} (
                        {form.monthlyRate.toFixed(2)}% a.m.)
                      </p>
                    </div>

                    <div className="inline-flex h-[58px] items-center justify-center rounded-[14px] bg-[#3fae7b] px-5 text-[18px] font-extrabold text-white shadow-[0_12px_24px_rgba(63,174,123,0.22)]">
                      – {simulated.localDiscount}%
                    </div>
                  </div>

                  <div className="mt-6 space-y-4 rounded-[18px] border border-[#ebeff6] bg-[#fbfcff] p-4">
                    <FinanceRow
                      label="Entrada"
                      value={formatCurrency(simulated.entry)}
                      icon="calendar"
                    />
                    <FinanceRow
                      label="Financiamento"
                      value={formatCurrency(simulated.financedAmount)}
                      icon="dot"
                    />
                    <FinanceRow
                      label="Prazo"
                      value={`${form.term} meses`}
                      icon="doc"
                    />
                    <FinanceRow
                      label="Valor da Parcela"
                      value={formatCurrencyPrecise(simulated.monthlyPayment)}
                      icon="clock"
                      strong
                    />

                    <div className="rounded-[12px] bg-[#f2f7f3] px-4 py-3 text-[14px] text-[#52705b]">
                      Condição promocional local com taxa a partir de{" "}
                      <span className="font-bold">{form.monthlyRate.toFixed(2)}% a.m.</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <section className="mt-10">
            <h2 className="text-[28px] font-extrabold text-[#1e2547] md:text-[34px]">
              Algumas ofertas de oportunidades
            </h2>

            <div className="mt-5 grid gap-5 lg:grid-cols-3">
              {cards.map((item, index) => {
                const price = parseMoney(item.price) || 89900 + index * 5000;
                const entry = price * 0.2;
                const financed = price - entry;
                const parcel = calculateMonthlyPayment(financed, 1.39, 60);

                return (
                  <OpportunityCard
                    key={`${item.id}-${index}`}
                    item={item}
                    cityLabel={cityLabel}
                    parcel={parcel}
                  />
                );
              })}
            </div>

            <div className="mt-5">
              <Link
                href={`/comprar?city_slug=${citySlug}&below_fipe=true`}
                className="inline-flex items-center gap-2 text-[18px] font-semibold text-[#2f67f6] transition hover:text-[#214fca]"
              >
                <span>Ver mais oportunidades abaixo da tabela Fipe</span>
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="m9 6 6 6-6 6" />
                </svg>
              </Link>
            </div>
          </section>

          <section className="mt-10 overflow-hidden rounded-[28px] border border-[#dfe5f0] bg-[#1e2547] shadow-[0_22px_50px_rgba(30,37,71,0.16)]">
            <div
              className="relative flex min-h-[240px] flex-col gap-6 px-6 py-8 md:min-h-[260px] md:flex-row md:items-center md:justify-between md:px-8"
              style={{
                backgroundImage:
                  "linear-gradient(90deg, rgba(30,37,71,0.90) 0%, rgba(30,37,71,0.74) 36%, rgba(30,37,71,0.18) 100%), url('/images/hero.jpeg')",
                backgroundSize: "cover",
                backgroundPosition: "center",
              }}
            >
              <div className="max-w-[660px]">
                <h3 className="text-[28px] font-extrabold leading-tight text-white md:text-[42px]">
                  Simule o financiamento, veja ofertas ou anuncie grátis seu carro!
                </h3>
              </div>

              <div className="flex w-full max-w-[320px] flex-col gap-3">
                <Link
                  href={`/comprar?city_slug=${citySlug}`}
                  className="inline-flex h-[58px] items-center justify-center rounded-[14px] bg-[#3f455f] px-5 text-[20px] font-bold text-white transition hover:bg-[#353b53]"
                >
                  Ver ofertas de carros
                </Link>

                <Link
                  href="/planos"
                  className="inline-flex h-[58px] items-center justify-center rounded-[14px] bg-[#2f67f6] px-5 text-[20px] font-bold text-white transition hover:bg-[#2457dc]"
                >
                  Anunciar grátis agora!
                </Link>
              </div>
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}

function FieldLabel({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      {label ? (
        <span className="mb-2 block text-[15px] font-semibold text-[#59627a]">
          {label}
        </span>
      ) : null}
      {children}
    </label>
  );
}

function FeatureMiniCard({
  iconColor,
  title,
  description,
  ctaLabel,
  ctaHref,
  ctaVariant,
}: {
  iconColor: "orange" | "blue";
  title: string;
  description: string;
  ctaLabel: string;
  ctaHref: string;
  ctaVariant: "orange" | "blue";
}) {
  return (
    <div className="rounded-[22px] border border-[#e6eaf2] bg-white p-5 shadow-[0_16px_32px_rgba(30,37,71,0.06)]">
      <div className="flex items-start gap-4">
        <div
          className={cn(
            "inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full",
            iconColor === "orange"
              ? "bg-[#fff3df] text-[#f5a623]"
              : "bg-[#eaf1ff] text-[#2f67f6]"
          )}
        >
          {iconColor === "orange" ? (
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.9">
              <path d="M12 3l8 3v5c0 5.25-3.1 9.1-8 11-4.9-1.9-8-5.75-8-11V6l8-3Z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.9">
              <path d="M12 21s7-4.5 7-10a7 7 0 1 0-14 0c0 5.5 7 10 7 10Z" />
              <path d="M12 14a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
            </svg>
          )}
        </div>

        <div className="min-w-0">
          <h4 className="text-[18px] font-extrabold text-[#1e2547] md:text-[20px]">
            {title}
          </h4>
          <p className="mt-2 text-[15px] leading-6 text-[#646d83]">{description}</p>
        </div>
      </div>

      <Link
        href={ctaHref}
        className={cn(
          "mt-5 inline-flex h-[52px] w-full items-center justify-center rounded-[14px] text-[20px] font-bold text-white transition",
          ctaVariant === "orange"
            ? "bg-[#f5a623] hover:bg-[#eb9e16]"
            : "bg-[#2f67f6] hover:bg-[#2457dc]"
        )}
      >
        {ctaLabel}
      </Link>
    </div>
  );
}

function FinanceRow({
  label,
  value,
  icon,
  strong = false,
}: {
  label: string;
  value: string;
  icon: "calendar" | "dot" | "doc" | "clock";
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-[#edf1f7] pb-3 last:border-b-0 last:pb-0">
      <div className="flex items-center gap-3 text-[17px] text-[#505a73]">
        <span className="inline-flex h-5 w-5 items-center justify-center text-[#8b95aa]">
          {icon === "calendar" ? (
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M4 7h16M7 4v6M17 4v6M5 11h14v8H5z" />
            </svg>
          ) : icon === "dot" ? (
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
              <circle cx="12" cy="12" r="6" />
            </svg>
          ) : icon === "doc" ? (
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M7 3h7l5 5v13H7z" />
              <path d="M14 3v5h5" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M12 8v5l3 2" />
              <path d="M21 12a9 9 0 1 1-9-9" />
            </svg>
          )}
        </span>
        <span>{label}</span>
      </div>

      <div
        className={cn(
          "text-right text-[18px] font-semibold text-[#1e2547]",
          strong && "text-[22px] font-extrabold"
        )}
      >
        {value}
      </div>
    </div>
  );
}

function OpportunityCard({
  item,
  cityLabel,
  parcel,
}: {
  item: AdItem;
  cityLabel: string;
  parcel: number;
}) {
  const title = item.title || [item.year, item.brand, item.model].filter(Boolean).join(" ") || "Veículo";
  const image = resolveImage(item);
  const href = resolveLink(item);
  const price = parseMoney(item.price) || 0;

  return (
    <Link
      href={href}
      className="group overflow-hidden rounded-[22px] border border-[#e6eaf2] bg-white shadow-[0_16px_34px_rgba(30,37,71,0.07)] transition hover:-translate-y-0.5 hover:shadow-[0_20px_42px_rgba(30,37,71,0.10)]"
    >
      <div className="relative aspect-[1.28/0.86] overflow-hidden">
        <img
          src={image}
          alt={title}
          className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
        />

        <div className="absolute inset-x-0 top-0 flex items-start justify-between p-3">
          <span className="inline-flex rounded-full bg-[#3fae7b] px-3 py-1 text-[12px] font-extrabold text-white shadow-sm">
            -9% abaixo da FIPE
          </span>

          <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/92 text-[#8892a7] shadow-sm">
            <svg viewBox="0 0 24 24" className="h-[16px] w-[16px]" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M12 20.5s-7.25-4.35-7.25-10.1a4.2 4.2 0 0 1 7.25-2.7 4.2 4.2 0 0 1 7.25 2.7c0 5.75-7.25 10.1-7.25 10.1Z" />
            </svg>
          </span>
        </div>
      </div>

      <div className="px-5 pb-5 pt-4">
        <h3 className="text-[18px] font-extrabold text-[#1e2547] md:text-[20px]">
          {title}
        </h3>

        <p className="mt-2 text-[16px] text-[#646d83]">{cityLabel}</p>

        <div className="mt-4 flex items-end justify-between gap-3">
          <div className="text-[28px] font-extrabold leading-none text-[#153e9f]">
            {formatCurrency(price)}
          </div>

          <div className="rounded-[10px] bg-[#f2f4fa] px-3 py-2 text-[12px] font-bold text-[#6b7489]">
            {formatMileage(item.mileage)}
          </div>
        </div>

        <button
          type="button"
          className="mt-4 inline-flex h-[50px] w-full items-center justify-center rounded-[14px] bg-[#eef1f7] px-5 text-[18px] font-semibold text-[#47526f] transition hover:bg-[#e6ebf5]"
        >
          Ver parcelas
        </button>

        <div className="mt-3 rounded-[12px] bg-[#f8fafd] px-4 py-3 text-[13px] text-[#5d6780] ring-1 ring-[#edf1f7]">
          a partir de <span className="font-bold text-[#153e9f]">{formatCurrencyPrecise(parcel)}</span>{" "}
          a.m.
        </div>
      </div>
    </Link>
  );
}

const inputClassName =
  "h-[58px] w-full rounded-[14px] border border-[#e6eaf2] bg-white px-4 text-[16px] font-semibold text-[#1e2547] outline-none transition focus:border-[#2f67f6]";

const selectClassName =
  "h-[58px] w-full rounded-[14px] border border-[#e6eaf2] bg-white px-4 text-[16px] font-semibold text-[#1e2547] outline-none transition focus:border-[#2f67f6]";
