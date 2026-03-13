// frontend/components/search/HomeSearchSection.tsx
"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type FeaturedCity = {
  id: number;
  name: string;
  slug: string;
};

interface HomeSearchSectionProps {
  featuredCities: FeaturedCity[];
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

const YEAR_OPTIONS = [
  "2024",
  "2023",
  "2022",
  "2021",
  "2020",
  "2019",
  "2018",
];

const PRICE_OPTIONS = [
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
  { label: "Categoria", value: "" },
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
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
}) {
  return (
    <label className="block">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-[52px] w-full rounded-[12px] border border-[#dbe2ed] bg-white px-4 text-[16px] font-medium text-[#2b3650] outline-none transition focus:border-[#0e62d8]"
      >
        <option value="">{label}</option>
        {options.map((option) => (
          <option key={`${label}-${option.value}`} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function HomeSearchSection({ featuredCities }: HomeSearchSectionProps) {
  const router = useRouter();

  const cityOptions = useMemo(() => {
    if (featuredCities?.length) {
      return featuredCities.map((city) => ({
        label: city.name,
        value: city.slug,
      }));
    }

    return [{ label: "São Paulo", value: "sao-paulo-sp" }];
  }, [featuredCities]);

  const [citySlug, setCitySlug] = useState(cityOptions[0]?.value || "sao-paulo-sp");
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

  return (
    <div className="rounded-[20px] border border-[#dce3ee] bg-white px-5 py-5 shadow-[0_16px_34px_rgba(16,28,58,0.08)] md:px-6 md:py-6">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <SelectField
          label="Cidade"
          value={citySlug}
          onChange={setCitySlug}
          options={cityOptions}
        />
        <SelectField
          label="Marca"
          value={brand}
          onChange={(value) => {
            setBrand(value);
            setModel("");
          }}
          options={BRAND_OPTIONS.map((item) => ({ label: item, value: item }))}
        />
        <SelectField
          label="Modelo"
          value={model}
          onChange={setModel}
          options={modelOptions}
        />
        <SelectField
          label="Ano"
          value={year}
          onChange={setYear}
          options={YEAR_OPTIONS.map((item) => ({ label: item, value: item }))}
        />
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_1fr_220px]">
        <SelectField
          label="Preço até"
          value={maxPrice}
          onChange={setMaxPrice}
          options={PRICE_OPTIONS}
        />
        <SelectField
          label="Selecionar"
          value={type}
          onChange={setType}
          options={TYPE_OPTIONS}
        />
        <SelectField
          label="Categoria"
          value={category}
          onChange={setCategory}
          options={CATEGORY_OPTIONS}
        />

        <button
          type="button"
          onClick={handleSubmit}
          className="inline-flex h-[52px] items-center justify-center rounded-[12px] bg-[#0e62d8] px-6 text-[18px] font-extrabold text-white shadow-[0_12px_28px_rgba(14,98,216,0.24)] transition hover:bg-[#0c4fb0]"
        >
          <span>Pesquisar</span>
          <svg viewBox="0 0 24 24" className="ml-2 h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m9 6 6 6-6 6" />
          </svg>
        </button>
      </div>
    </div>
  );
}
