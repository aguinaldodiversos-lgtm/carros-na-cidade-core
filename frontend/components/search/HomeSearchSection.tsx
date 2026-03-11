"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

const cityOptions = [
  { label: "São Paulo", value: "sao-paulo-sp" },
  { label: "Campinas", value: "campinas-sp" },
  { label: "Atibaia", value: "atibaia-sp" },
  { label: "Sorocaba", value: "sorocaba-sp" },
  { label: "Belo Horizonte", value: "belo-horizonte-mg" },
];

const brandOptions = [
  "Toyota",
  "Honda",
  "Volkswagen",
  "Chevrolet",
  "Jeep",
  "Hyundai",
  "Fiat",
  "Nissan",
  "BYD",
];

const modelOptionsByBrand: Record<string, string[]> = {
  Toyota: ["Corolla", "Yaris", "Hilux", "Corolla Cross"],
  Honda: ["Civic", "HR-V", "City", "WR-V"],
  Volkswagen: ["T-Cross", "Nivus", "Polo", "Taos"],
  Chevrolet: ["Onix", "Tracker", "Cruze", "S10"],
  Jeep: ["Compass", "Renegade", "Commander"],
  Hyundai: ["HB20", "Creta", "Tucson"],
  Fiat: ["Pulse", "Fastback", "Toro", "Argo"],
  Nissan: ["Kicks", "Sentra", "Versa"],
  BYD: ["Dolphin", "Yuan Plus", "Song Plus"],
};

const yearOptions = ["2025", "2024", "2023", "2022", "2021", "2020", "2019"];
const priceOptions = [
  { label: "Até R$ 50 mil", value: "50000" },
  { label: "Até R$ 80 mil", value: "80000" },
  { label: "Até R$ 120 mil", value: "120000" },
  { label: "Até R$ 180 mil", value: "180000" },
  { label: "Até R$ 250 mil", value: "250000" },
];
const categoryOptions = [
  { label: "Hatch", value: "hatch" },
  { label: "Sedã", value: "sedan" },
  { label: "SUV", value: "suv" },
  { label: "Picape", value: "pickup" },
  { label: "Elétrico", value: "electric" },
  { label: "Híbrido", value: "hybrid" },
];

function SearchField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <label className="mb-2 block text-sm font-semibold text-[#53607a]">{label}</label>
      {children}
    </div>
  );
}

function BaseSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`h-[56px] w-full rounded-xl border border-[#d8dee9] bg-white px-4 text-[16px] font-medium text-[#2f3a54] outline-none transition focus:border-[#0e62d8] ${props.className || ""}`}
    />
  );
}

export function HomeSearchSection() {
  const router = useRouter();

  const [citySlug, setCitySlug] = useState("sao-paulo-sp");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [yearMin, setYearMin] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [bodyType, setBodyType] = useState("");

  const modelOptions = useMemo(() => {
    if (!brand) return [];
    return modelOptionsByBrand[brand] || [];
  }, [brand]);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const params = new URLSearchParams();
    if (citySlug) params.set("city_slug", citySlug);
    if (brand) params.set("brand", brand);
    if (model) params.set("model", model);
    if (yearMin) params.set("year_min", yearMin);
    if (maxPrice) params.set("max_price", maxPrice);
    if (bodyType) params.set("body_type", bodyType);

    router.push(`/comprar?${params.toString()}`);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-[28px] border border-[#e2e8f0] bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,0.05)] md:p-6"
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
        <SearchField label="Cidade">
          <BaseSelect value={citySlug} onChange={(e) => setCitySlug(e.target.value)}>
            {cityOptions.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </BaseSelect>
        </SearchField>

        <SearchField label="Marca">
          <BaseSelect
            value={brand}
            onChange={(e) => {
              setBrand(e.target.value);
              setModel("");
            }}
          >
            <option value="">- Selecionar -</option>
            {brandOptions.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </BaseSelect>
        </SearchField>

        <SearchField label="Modelo">
          <BaseSelect value={model} onChange={(e) => setModel(e.target.value)} disabled={!brand}>
            <option value="">Modelo</option>
            {modelOptions.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </BaseSelect>
        </SearchField>

        <SearchField label="Ano">
          <BaseSelect value={yearMin} onChange={(e) => setYearMin(e.target.value)}>
            <option value="">Ano</option>
            {yearOptions.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </BaseSelect>
        </SearchField>

        <SearchField label="Preço até">
          <BaseSelect value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)}>
            <option value="">Preço até</option>
            {priceOptions.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </BaseSelect>
        </SearchField>

        <SearchField label="Categoria">
          <BaseSelect value={bodyType} onChange={(e) => setBodyType(e.target.value)}>
            <option value="">Categoria</option>
            {categoryOptions.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </BaseSelect>
        </SearchField>
      </div>

      <div className="mt-5 flex justify-end">
        <button
          type="submit"
          className="inline-flex h-[56px] min-w-[220px] items-center justify-center rounded-xl bg-[#0e62d8] px-6 text-[18px] font-bold text-white shadow-[0_10px_26px_rgba(14,98,216,0.22)] transition hover:bg-[#0c4fb0]"
        >
          Pesquisar
        </button>
      </div>
    </form>
  );
}
