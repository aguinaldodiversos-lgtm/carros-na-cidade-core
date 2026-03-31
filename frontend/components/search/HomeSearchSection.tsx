// frontend/components/search/HomeSearchSection.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { DEFAULT_PUBLIC_CITY_LABEL, DEFAULT_PUBLIC_CITY_SLUG } from "@/lib/site/public-config";

type FeaturedCity = {
  id: number;
  name: string;
  slug: string;
};

interface HomeSearchSectionProps {
  featuredCities: FeaturedCity[];
  defaultCitySlug: string;
  defaultCityLabel?: string;
}

const BRAND_OPTIONS = [
  "Toyota",
  "Honda",
  "Jeep",
  "Volkswagen",
  "Chevrolet",
  "Hyundai",
  "Fiat",
  "Nissan",
  "BMW",
  "Audi",
];

const MODEL_OPTIONS: Record<string, string[]> = {
  Toyota: ["Corolla", "Hilux", "Yaris", "SW4"],
  Honda: ["Civic", "HR-V", "City", "Fit"],
  Jeep: ["Compass", "Renegade", "Commander"],
  Volkswagen: ["T-Cross", "Nivus", "Virtus", "Taos"],
  Chevrolet: ["Onix", "Tracker", "Cruze", "S10"],
  Hyundai: ["HB20", "Creta", "Tucson"],
  Fiat: ["Pulse", "Fastback", "Toro", "Strada"],
  Nissan: ["Kicks", "Sentra", "Versa"],
  BMW: ["320i", "X1", "X3"],
  Audi: ["A3", "Q3", "Q5"],
};

const YEAR_OPTIONS = ["2024", "2023", "2022", "2021", "2020", "2019", "2018"];

const PRICE_OPTIONS = [
  { label: "Selecionar", value: "" },
  { label: "Até R$ 40 mil", value: "40000" },
  { label: "Até R$ 60 mil", value: "60000" },
  { label: "Até R$ 80 mil", value: "80000" },
  { label: "Até R$ 100 mil", value: "100000" },
  { label: "Até R$ 150 mil", value: "150000" },
  { label: "Até R$ 200 mil", value: "200000" },
];

const TYPE_OPTIONS = [
  { label: "Selecionar", value: "" },
  { label: "Usados", value: "used" },
  { label: "Seminovos", value: "seminovos" },
  { label: "Novos", value: "new" },
];

const CATEGORY_OPTIONS = [
  { label: "Selecionar", value: "" },
  { label: "Sedã", value: "sedan" },
  { label: "SUV", value: "suv" },
  { label: "Hatch", value: "hatch" },
  { label: "Picape", value: "pickup" },
  { label: "Utilitário", value: "utilitario" },
];

function SelectField({
  label,
  value,
  onChange,
  options,
  placeholderOption,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
  /** Texto da primeira opção vazia (ex.: "- Selecionar -") */
  placeholderOption?: string;
}) {
  const emptyLabel = placeholderOption ?? label;
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[12px] font-semibold uppercase tracking-wide text-[#6b7280]">{label}</span>
      <label className="sr-only" htmlFor={`field-${label}`}>
        {label}
      </label>
      <select
        id={`field-${label}`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-[48px] w-full cursor-pointer rounded-[11px] border border-[#d5deeb] bg-[#fafbfd] px-3 text-[15px] font-medium text-[#1b2436] outline-none transition hover:border-[#c5d0e0] focus:border-[#0e62d8] focus:bg-white focus:ring-2 focus:ring-[#0e62d8]/18 md:h-[52px] md:px-4"
      >
        <option value="">{emptyLabel}</option>
        {options.map((option) => (
          <option key={`${label}-${option.value || "empty"}-${option.label}`} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function HomeSearchSection({
  featuredCities,
  defaultCitySlug,
  defaultCityLabel,
}: HomeSearchSectionProps) {
  const router = useRouter();

  const cityOptions = useMemo(() => {
    let base = featuredCities?.length
      ? featuredCities.map((city) => ({
          label: city.name,
          value: city.slug,
        }))
      : [{ label: DEFAULT_PUBLIC_CITY_LABEL, value: DEFAULT_PUBLIC_CITY_SLUG }];

    if (defaultCitySlug && !base.some((o) => o.value === defaultCitySlug)) {
      base = [
        {
          label: defaultCityLabel || defaultCitySlug,
          value: defaultCitySlug,
        },
        ...base,
      ];
    }
    return base;
  }, [featuredCities, defaultCitySlug, defaultCityLabel]);

  const [citySlug, setCitySlug] = useState(() => defaultCitySlug || DEFAULT_PUBLIC_CITY_SLUG);

  /** Sincroniza só quando a cidade padrão vinda do servidor muda — não depender de `cityOptions` (nova referência a cada render quebrava os selects). */
  useEffect(() => {
    setCitySlug(defaultCitySlug || DEFAULT_PUBLIC_CITY_SLUG);
  }, [defaultCitySlug]);

  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [type, setType] = useState("");
  const [category, setCategory] = useState("");

  const modelOptions = useMemo(() => {
    const options = brand ? MODEL_OPTIONS[brand] || [] : [];
    return options.map((item) => ({ label: item, value: item }));
  }, [brand]);

  function handleSubmit() {
    const params = new URLSearchParams();

    if (citySlug) params.set("city_slug", citySlug);
    if (brand) params.set("brand", brand);
    if (model) params.set("model", model);
    if (year) params.set("year_min", year);
    if (maxPrice) params.set("max_price", maxPrice);
    if (type === "used") params.set("condition", "used");
    if (type === "seminovos") params.set("condition", "seminovos");
    if (type === "new") params.set("condition", "new");
    if (category) params.set("body_type", category);

    const query = params.toString();
    router.push(query ? `/comprar?${query}` : "/comprar");
  }

  const brandSelectOptions = BRAND_OPTIONS.map((item) => ({ label: item, value: item }));
  const yearSelectOptions = YEAR_OPTIONS.map((item) => ({ label: item, value: item }));

  return (
    <section
      id="home-quick-search"
      className="relative isolate z-30 -mt-8 rounded-[20px] border border-[#dce3ee] bg-white px-4 py-6 shadow-[0_20px_48px_rgba(16,28,58,0.11)] sm:-mt-10 sm:px-6 sm:py-7 md:-mt-[52px]"
      aria-labelledby="home-search-heading"
    >
      <h2 id="home-search-heading" className="sr-only">
        Busca rápida de veículos
      </h2>
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4 lg:gap-4">
        <SelectField
          label="Cidade"
          placeholderOption="- Selecionar -"
          value={citySlug}
          onChange={setCitySlug}
          options={cityOptions}
        />
        <SelectField
          label="Marca"
          placeholderOption="- Selecionar -"
          value={brand}
          onChange={(value) => {
            setBrand(value);
            setModel("");
          }}
          options={brandSelectOptions}
        />
        <SelectField
          label="Modelo"
          placeholderOption="- Selecionar -"
          value={model}
          onChange={setModel}
          options={modelOptions}
        />
        <SelectField
          label="Ano"
          placeholderOption="- Selecionar -"
          value={year}
          onChange={setYear}
          options={yearSelectOptions}
        />
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:mt-4 lg:grid-cols-[1fr_1fr_1fr_minmax(160px,200px)]">
        <SelectField
          label="Preço até"
          placeholderOption="Selecionar"
          value={maxPrice}
          onChange={setMaxPrice}
          options={PRICE_OPTIONS}
        />
        <SelectField
          label="Condição"
          placeholderOption="Selecionar"
          value={type}
          onChange={setType}
          options={TYPE_OPTIONS}
        />
        <SelectField
          label="Categoria"
          placeholderOption="- Selecionar -"
          value={category}
          onChange={setCategory}
          options={CATEGORY_OPTIONS}
        />

        <div className="flex flex-col justify-end lg:col-span-1">
          <span className="mb-1.5 hidden text-[12px] font-semibold uppercase tracking-wide text-transparent lg:block">
            &nbsp;
          </span>
          <button
            type="button"
            onClick={handleSubmit}
            className="inline-flex h-[48px] w-full items-center justify-center gap-2 rounded-[11px] bg-[#0e62d8] px-4 text-[16px] font-extrabold text-white shadow-[0_12px_28px_rgba(14,98,216,0.28)] transition hover:bg-[#0c4fb0] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0e62d8] md:h-[52px] md:text-[17px]"
          >
            Pesquisar
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m9 6 6 6-6 6" />
            </svg>
          </button>
        </div>
      </div>
    </section>
  );
}
