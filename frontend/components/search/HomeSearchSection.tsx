"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

const cityOptions = [
  { label: "São Paulo (SP)", value: "sao-paulo-sp" },
  { label: "Rio de Janeiro (RJ)", value: "rio-de-janeiro-rj" },
  { label: "Belo Horizonte (MG)", value: "belo-horizonte-mg" },
  { label: "Campinas (SP)", value: "campinas-sp" },
  { label: "Curitiba (PR)", value: "curitiba-pr" },
  { label: "Porto Alegre (RS)", value: "porto-alegre-rs" },
  { label: "Goiânia (GO)", value: "goiania-go" },
  { label: "Florianópolis (SC)", value: "florianopolis-sc" },
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
const fuelOptions = [
  { label: "Selecionar -", value: "" },
  { label: "Flex", value: "flex" },
  { label: "Gasolina", value: "gasoline" },
  { label: "Diesel", value: "diesel" },
  { label: "Elétrico", value: "electric" },
  { label: "Híbrido", value: "hybrid" },
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
    <div className="min-w-0 rounded-[10px] border border-[#d9deea] bg-white px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
      <div className="mb-1 text-[12px] font-semibold text-[#6b7488]">{label}</div>
      {children}
    </div>
  );
}

function BaseSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`h-6 w-full rounded-none bg-transparent px-0 text-[15px] font-semibold text-[#2f3a54] outline-none transition focus:text-[#163467] ${props.className || ""}`}
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
  const [fuelType, setFuelType] = useState("");
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
    if (fuelType) params.set("fuel_type", fuelType);
    if (bodyType) params.set("body_type", bodyType);

    router.push(`/anuncios?${params.toString()}`);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-[12px] border border-[#dfe4ec] bg-white p-3 shadow-[0_2px_18px_rgba(20,30,60,0.06)] md:p-4"
    >
      <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
        <div>
          <SearchField label="Cidade">
            <BaseSelect value={citySlug} onChange={(e) => setCitySlug(e.target.value)} aria-label="Cidade">
              {cityOptions.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </BaseSelect>
          </SearchField>
        </div>

        <div>
          <SearchField label="Marca">
            <BaseSelect
              value={brand}
              aria-label="Marca"
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
        </div>

        <div>
          <SearchField label="Modelo">
            <BaseSelect
              value={model}
              onChange={(e) => setModel(e.target.value)}
              disabled={!brand}
              aria-label="Modelo"
            >
              <option value="">Modelo</option>
              {modelOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </BaseSelect>
          </SearchField>
        </div>

        <div>
          <SearchField label="Ano">
            <BaseSelect value={yearMin} onChange={(e) => setYearMin(e.target.value)} aria-label="Ano">
              <option value="">Ano</option>
              {yearOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </BaseSelect>
          </SearchField>
        </div>

        <div>
          <SearchField label="Preço até">
            <BaseSelect value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} aria-label="Preço até">
              <option value="">Preço até</option>
              {priceOptions.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </BaseSelect>
          </SearchField>
        </div>

        <div>
          <SearchField label="Selecionar -">
            <BaseSelect value={fuelType} onChange={(e) => setFuelType(e.target.value)} aria-label="Combustível">
              {fuelOptions.map((item) => (
                <option key={item.label} value={item.value}>
                  {item.label}
                </option>
              ))}
            </BaseSelect>
          </SearchField>
        </div>

        <div>
          <SearchField label="Categoria">
            <BaseSelect value={bodyType} onChange={(e) => setBodyType(e.target.value)} aria-label="Categoria">
              <option value="">Categoria</option>
              {categoryOptions.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </BaseSelect>
          </SearchField>
        </div>

        <div>
          <button
            type="submit"
            className="inline-flex h-full min-h-[58px] w-full items-center justify-center gap-2 rounded-[10px] bg-[#0e62d8] px-6 text-[17px] font-extrabold text-white shadow-[0_12px_24px_rgba(14,98,216,0.22)] transition hover:bg-[#0c4fb0]"
          >
            Pesquisar
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
              <path d="M7 4 13 10 7 16" />
            </svg>
          </button>
        </div>
      </div>
    </form>
  );
}
