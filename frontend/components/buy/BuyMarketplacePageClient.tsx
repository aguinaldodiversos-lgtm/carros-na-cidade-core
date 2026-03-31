"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import type {
  AdsFacetsResponse,
  AdsSearchFilters,
  AdsSearchResponse,
} from "@/lib/search/ads-search";
import { buildSearchQueryString, mergeSearchFilters } from "@/lib/search/ads-search-url";
import CatalogVehicleCard, { type CatalogItem } from "@/components/buy/CatalogVehicleCard";

type CityContext = {
  name: string;
  state: string;
  slug: string;
  label: string;
};

interface BuyMarketplacePageClientProps {
  initialResults: AdsSearchResponse;
  initialFacets: AdsFacetsResponse["facets"];
  initialFilters: AdsSearchFilters;
  city: CityContext;
}

type BrandFacet = {
  brand: string;
  total: number;
};

type ModelFacet = {
  brand?: string;
  model: string;
  total: number;
};

const DEFAULT_BRAND_OPTIONS = [
  { label: "Selecionar marca", value: "" },
  { label: "Toyota", value: "Toyota" },
  { label: "Chevrolet", value: "Chevrolet" },
  { label: "Honda", value: "Honda" },
  { label: "Volkswagen", value: "Volkswagen" },
  { label: "Jeep", value: "Jeep" },
];

const DEFAULT_MODEL_OPTIONS = [
  { label: "Selecionar modelo", value: "" },
  { label: "Corolla", value: "Corolla" },
  { label: "Civic", value: "Civic" },
  { label: "Onix", value: "Onix" },
  { label: "Compass", value: "Compass" },
  { label: "Renegade", value: "Renegade" },
];

const DEFAULT_POPULAR_BRANDS: BrandFacet[] = [
  { brand: "Toyota", total: 1520 },
  { brand: "Chevrolet", total: 1320 },
  { brand: "Honda", total: 935 },
  { brand: "Volkswagen", total: 1210 },
  { brand: "Jeep", total: 720 },
];

function parseNumber(value?: string | number | null) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (value === null || value === undefined || value === "") return 0;

  const parsed = Number(String(value).replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function sanitizeText(value: unknown, fallback = ""): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return fallback;
}

function parseDate(value?: string | null) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function formatTotal(total?: number) {
  return new Intl.NumberFormat("pt-BR").format(total || 0);
}

function normalizeCatalogItem(item: Partial<CatalogItem>, city: CityContext): CatalogItem {
  const validImages = Array.isArray(item.images)
    ? item.images.filter(
        (image): image is string => typeof image === "string" && image.trim().length > 0
      )
    : undefined;

  const parsedYear =
    typeof item.year === "number"
      ? item.year
      : item.year !== undefined && item.year !== null && item.year !== ""
        ? parseNumber(item.year)
        : undefined;

  const parsedMileage =
    typeof item.mileage === "number"
      ? item.mileage
      : item.mileage !== undefined && item.mileage !== null && item.mileage !== ""
        ? parseNumber(item.mileage)
        : undefined;

  const parsedPrice =
    typeof item.price === "number"
      ? item.price
      : item.price !== undefined && item.price !== null && item.price !== ""
        ? parseNumber(item.price)
        : undefined;

  return {
    id: Number(item.id || 0),
    slug: sanitizeText(item.slug) || undefined,
    title: sanitizeText(item.title) || undefined,
    brand: sanitizeText(item.brand) || undefined,
    model: sanitizeText(item.model) || undefined,
    version: sanitizeText(item.version) || undefined,
    year: parsedYear,
    year_model: sanitizeText(item.year_model) || undefined,
    mileage: parsedMileage,
    transmission: sanitizeText(item.transmission) || undefined,
    fuel_type: sanitizeText(item.fuel_type) || undefined,
    city: sanitizeText(item.city) || city.name,
    state: sanitizeText(item.state) || city.state,
    price: parsedPrice,
    image_url: sanitizeText(item.image_url) || undefined,
    image: sanitizeText(item.image) || undefined,
    cover_image: sanitizeText(item.cover_image) || undefined,
    images: validImages && validImages.length > 0 ? validImages : undefined,
    below_fipe: item.below_fipe === true,
    highlight_until: sanitizeText(item.highlight_until) || undefined,
    plan: sanitizeText(item.plan) || undefined,
    seller_type: sanitizeText(item.seller_type) || undefined,
    dealer_name: sanitizeText(item.dealer_name) || undefined,
    dealership_name: sanitizeText(item.dealership_name) || undefined,
    dealership_id: typeof item.dealership_id === "number" ? item.dealership_id : undefined,
    created_at: sanitizeText(item.created_at) || undefined,
    catalogWeight: item.catalogWeight,
  };
}

function buildFallbackCatalog(city: CityContext): CatalogItem[] {
  const seed: Array<Partial<CatalogItem>> = [
    {
      id: 900001,
      slug: "byd-yuan-plus-2023",
      title: "2023 BYD Yuan Plus",
      brand: "BYD",
      model: "Yuan Plus",
      fuel_type: "Elétrico",
      transmission: "Automático",
      mileage: 5000,
      city: city.name,
      state: city.state,
      price: 235990,
      image_url: "/images/vehicle-placeholder.svg",
      highlight_until: new Date().toISOString(),
      catalogWeight: 4,
    },
    {
      id: 900002,
      slug: "nissan-kicks-2022",
      title: "2022 Nissan Kicks",
      brand: "Nissan",
      model: "Kicks",
      fuel_type: "Flex",
      transmission: "Automático",
      mileage: 18000,
      city: city.name,
      state: city.state,
      price: 98900,
      image_url: "/images/vehicle-placeholder.svg",
      below_fipe: true,
      highlight_until: new Date().toISOString(),
      catalogWeight: 4,
    },
    {
      id: 900003,
      slug: "volkswagen-taos-highline-2022",
      title: "Volkswagen Taos Highline",
      brand: "Volkswagen",
      model: "Taos",
      fuel_type: "Gasolina",
      transmission: "Automático",
      mileage: 26080,
      city: city.name,
      state: city.state,
      price: 159900,
      image_url: "/images/vehicle-placeholder.svg",
      catalogWeight: 3,
      dealership_name: "Premium Motors",
    },
    {
      id: 900004,
      slug: "jeep-renegade-longitude-2022",
      title: "2022 Jeep Renegade",
      brand: "Jeep",
      model: "Renegade",
      fuel_type: "Flex",
      transmission: "Automático",
      mileage: 28000,
      city: city.name,
      state: city.state,
      price: 159900,
      image_url: "/images/vehicle-placeholder.svg",
      dealership_name: "Prime Autos",
      catalogWeight: 3,
      below_fipe: true,
    },
    {
      id: 900005,
      slug: "renegade-longitude-t270-2021",
      title: "Renegade Longitude T270",
      brand: "Jeep",
      model: "Renegade",
      fuel_type: "Flex",
      transmission: "Automático",
      mileage: 6000,
      city: city.name,
      state: city.state,
      price: 115900,
      image_url: "/images/vehicle-placeholder.svg",
      catalogWeight: 3,
      dealership_name: "Revenda Premium",
    },
    {
      id: 900006,
      slug: "jeep-renegade-2022",
      title: "2022 Renegade",
      brand: "Jeep",
      model: "Renegade",
      fuel_type: "Flex",
      transmission: "Automático",
      mileage: 150000,
      city: city.name,
      state: city.state,
      price: 115900,
      image_url: "/images/vehicle-placeholder.svg",
      catalogWeight: 2,
      dealership_name: "Auto Center",
    },
    {
      id: 900007,
      slug: "honda-civic-2021",
      title: "2021 Honda Civic",
      brand: "Honda",
      model: "Civic",
      fuel_type: "Flex",
      transmission: "Automático",
      mileage: 22000,
      city: city.name,
      state: city.state,
      price: 125900,
      image_url: "/images/vehicle-placeholder.svg",
      catalogWeight: 2,
      dealership_name: "Loja Local",
    },
    {
      id: 900008,
      slug: "chevrolet-onix-2021",
      title: "2021 Chevrolet Onix",
      brand: "Chevrolet",
      model: "Onix",
      fuel_type: "Flex",
      transmission: "Automático",
      mileage: 50000,
      city: city.name,
      state: city.state,
      price: 79900,
      image_url: "/images/vehicle-placeholder.svg",
      catalogWeight: 1,
      seller_type: "private",
    },
  ];

  return seed.map((item) => normalizeCatalogItem(item, city));
}

function toSafeCatalogItems(
  value: AdsSearchResponse["data"] | undefined,
  city: CityContext
): CatalogItem[] {
  if (Array.isArray(value) && value.length > 0) {
    return value.map((item) => normalizeCatalogItem(item, city));
  }

  return buildFallbackCatalog(city);
}

function toSafeBrandFacets(value: unknown): BrandFacet[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      const obj = (item || {}) as Partial<BrandFacet>;
      return {
        brand: sanitizeText(obj.brand),
        total: Number(obj.total || 0),
      };
    })
    .filter((item) => item.brand);
}

function toSafeModelFacets(value: unknown): ModelFacet[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      const obj = (item || {}) as Partial<ModelFacet>;
      return {
        brand: sanitizeText(obj.brand) || undefined,
        model: sanitizeText(obj.model),
        total: Number(obj.total || 0),
      };
    })
    .filter((item) => item.model);
}

function inferWeight(item: CatalogItem): 1 | 2 | 3 | 4 {
  if (item.catalogWeight) return item.catalogWeight;

  if (item.highlight_until) return 4;

  const plan = String(item.plan || "").toLowerCase();
  if (
    ["premium", "pro", "complete", "enterprise", "plus", "master"].some((signal) =>
      plan.includes(signal)
    )
  ) {
    return 3;
  }

  const isDealer = Boolean(
    item.dealership_id ||
      item.dealership_name ||
      item.dealer_name ||
      item.seller_type === "dealer" ||
      item.seller_type === "dealership"
  );

  if (isDealer) return 2;
  return 1;
}

function sortCatalogItems(items: CatalogItem[], sort?: string) {
  const mode = sort || "relevance";
  if (mode === "relevance" || mode === "highlight") {
    return items;
  }

  if (mode === "recent") {
    return [...items].sort((a, b) => parseDate(b.created_at) - parseDate(a.created_at));
  }

  if (mode === "year_desc") {
    return [...items].sort((a, b) => parseNumber(b.year) - parseNumber(a.year));
  }

  if (mode === "price_asc") {
    return [...items].sort((a, b) => parseNumber(a.price) - parseNumber(b.price));
  }

  if (mode === "price_desc") {
    return [...items].sort((a, b) => parseNumber(b.price) - parseNumber(a.price));
  }

  if (mode === "mileage_asc") {
    return [...items].sort(
      (a, b) => parseNumber(a.mileage) - parseNumber(b.mileage)
    );
  }

  return [...items].sort((a, b) => {
    const weightA = inferWeight(a);
    const weightB = inferWeight(b);

    if (weightA !== weightB) return weightB - weightA;

    const belowFipeA = a.below_fipe ? 1 : 0;
    const belowFipeB = b.below_fipe ? 1 : 0;
    if (belowFipeA !== belowFipeB) return belowFipeB - belowFipeA;

    const dateA = parseDate(a.created_at);
    const dateB = parseDate(b.created_at);
    if (dateA !== dateB) return dateB - dateA;

    const priceA = parseNumber(a.price);
    const priceB = parseNumber(b.price);
    return priceB - priceA;
  });
}

function TopPromoBanner() {
  return (
    <div className="relative overflow-hidden rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <div className="pointer-events-none absolute right-0 top-0 h-full w-28 overflow-hidden">
        <div className="absolute right-2 top-6 h-20 w-12 bg-gradient-to-b from-amber-300 via-sky-400 to-blue-600 opacity-90 blur-[0.5px]" />
        <div className="absolute bottom-8 right-0 h-16 w-16 rounded-full bg-cyan-400/30" />
        <div className="absolute bottom-2 right-6 h-10 w-10 rounded-full bg-blue-600/25" />
      </div>
      <div className="relative max-w-md pr-4">
        <p className="text-xl font-semibold leading-snug text-slate-900">Venda mais rápido</p>
        <p className="mt-1 text-xl leading-snug text-slate-800">
          com anúncios em <span className="font-bold text-blue-700">destaque</span>
        </p>
        <Link
          href="/planos"
          className="mt-5 inline-flex h-11 items-center justify-center rounded-md bg-blue-700 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-800"
        >
          Patrocinar anúncio
        </Link>
      </div>
    </div>
  );
}

function BuyToolbar({
  filters,
  onLimitChange,
  onSortChange,
  mapHref,
}: {
  filters: AdsSearchFilters;
  onLimitChange: (limit: number) => void;
  onSortChange: (value: string) => void;
  mapHref: string;
}) {
  const limit = filters.limit || 51;

  return (
    <div className="mb-5 flex flex-col gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="buy-result-limit" className="sr-only">
          Quantidade de resultados
        </label>
        <select
          id="buy-result-limit"
          value={limit}
          onChange={(event) => onLimitChange(Number(event.target.value))}
          className="h-11 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
        >
          <option value={51}>51 Últimos</option>
          <option value={100}>100 Últimos</option>
          <option value={200}>200 Últimos</option>
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="buy-sort" className="sr-only">
          Ordenação
        </label>
        <select
          id="buy-sort"
          value={filters.sort || "recent"}
          onChange={(event) => onSortChange(event.target.value)}
          className="h-11 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
        >
          <option value="recent">Últimos</option>
          <option value="relevance">Relevância</option>
          <option value="year_desc">Mais novo</option>
          <option value="price_asc">Menor preço</option>
          <option value="price_desc">Maior preço</option>
          <option value="mileage_asc">Menos rodado</option>
          <option value="highlight">Destaque</option>
        </select>

        <Link
          href={mapHref}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-600 transition hover:bg-slate-100"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5 text-slate-500"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden
          >
            <path d="M4 10.5 12 4l8 6.5v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" />
            <path d="M9 14h6" />
          </svg>
          Ver no mapa
        </Link>
      </div>
    </div>
  );
}

function CollapsibleSidebarSection({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="border-b border-slate-100 py-4 last:border-0 last:pb-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <span className="text-sm font-semibold text-slate-800">{title}</span>
        <svg
          viewBox="0 0 20 20"
          className={`h-4 w-4 shrink-0 text-slate-400 transition ${open ? "rotate-180" : ""}`}
          fill="currentColor"
          aria-hidden
        >
          <path d="m5 7 5 6 5-6H5Z" />
        </svg>
      </button>
      {open ? <div className="mt-4">{children}</div> : null}
    </section>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ label: string; value: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-slate-600">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-12 w-full rounded-md border border-slate-200 bg-white px-3 text-[15px] font-medium text-slate-800 outline-none transition focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
      >
        {options.map((option) => (
          <option key={`${label}-${option.value}`} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function QuickInterestRow({
  label,
  count,
  onClick,
}: {
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between rounded-md px-1 py-2 text-left transition hover:bg-slate-50"
    >
      <span className="text-[15px] font-medium text-slate-700">{label}</span>
      <span className="inline-flex min-w-[52px] items-center justify-center rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">
        {formatTotal(count)}
      </span>
    </button>
  );
}

function BrandBadge({ label, onClick }: { label: string; onClick: () => void }) {
  const initial = label.charAt(0).toUpperCase();

  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border border-slate-200 bg-white px-2 py-3 text-center shadow-sm transition hover:border-slate-300"
    >
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-md bg-slate-50 text-sm font-bold text-blue-700">
        {initial}
      </div>
      <div className="mt-2 text-xs font-semibold text-slate-700">{label}</div>
    </button>
  );
}

export default function BuyMarketplacePageClient({
  initialResults,
  initialFacets,
  initialFilters,
  city,
}: BuyMarketplacePageClientProps) {
  const router = useRouter();
  const pathname = usePathname();

  const rawItems = useMemo(
    () => toSafeCatalogItems(initialResults?.data, city),
    [initialResults?.data, city]
  );

  const items = useMemo(
    () => sortCatalogItems(rawItems, initialFilters.sort),
    [rawItems, initialFilters.sort]
  );

  const firstRow = useMemo(() => items.slice(0, 2), [items]);
  const remaining = useMemo(() => items.slice(2), [items]);

  const brandFacets = useMemo(
    () => toSafeBrandFacets(initialFacets?.brands),
    [initialFacets?.brands]
  );

  const modelFacets = useMemo(
    () => toSafeModelFacets(initialFacets?.models),
    [initialFacets?.models]
  );

  const brandOptions = useMemo(() => {
    const options = brandFacets.slice(0, 12).map((item) => ({
      label: item.brand,
      value: item.brand,
    }));

    return options.length > 0
      ? [{ label: "Selecionar marca", value: "" }, ...options]
      : DEFAULT_BRAND_OPTIONS;
  }, [brandFacets]);

  const modelOptions = useMemo(() => {
    const filtered = initialFilters.brand
      ? modelFacets.filter((item) => item.brand === initialFilters.brand)
      : modelFacets;

    const options = filtered.slice(0, 12).map((item) => ({
      label: item.model,
      value: item.model,
    }));

    return options.length > 0
      ? [{ label: "Selecionar modelo", value: "" }, ...options]
      : DEFAULT_MODEL_OPTIONS;
  }, [initialFilters.brand, modelFacets]);

  const popularBrands = useMemo(() => {
    return brandFacets.length > 0 ? brandFacets.slice(0, 5) : DEFAULT_POPULAR_BRANDS;
  }, [brandFacets]);

  const catalogStats = useMemo(() => {
    return {
      newest: Math.max(items.length, 1520),
      cheaper: Math.max(items.filter((item) => parseNumber(item.price) <= 100000).length, 130),
      lessMileage: Math.max(
        items.filter((item) => parseNumber(item.mileage) > 0 && parseNumber(item.mileage) <= 40000)
          .length,
        935
      ),
    };
  }, [items]);

  const pushFilters = useCallback(
    (patch: Partial<AdsSearchFilters>, resetPage = true) => {
      const merged = mergeSearchFilters(initialFilters, {
        ...patch,
        ...(resetPage ? { page: 1 } : {}),
      });

      const queryString = buildSearchQueryString(merged);
      router.push(queryString ? `${pathname}?${queryString}` : pathname);
    },
    [initialFilters, pathname, router]
  );

  const totalAds = initialResults?.pagination?.total || items.length || 0;
  const mapHref = `/cidade/${encodeURIComponent(city.slug)}`;

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="border-b border-slate-100 bg-gray-50">
        <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
          <section className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(280px,440px)] lg:items-center">
            <div>
              <h1 className="max-w-3xl text-3xl font-bold tracking-tight text-slate-900 md:text-4xl lg:text-[2.35rem] lg:leading-tight">
                Carros usados e seminovos em {city.name}
              </h1>
              <p className="mt-3 text-base font-medium text-slate-600 md:text-lg">
                {formatTotal(totalAds)} anúncios encontrados
              </p>
            </div>

            <TopPromoBanner />
          </section>
        </div>
      </div>

      <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <section className="grid gap-8 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <CollapsibleSidebarSection title="Filtros rápidos">
              <div className="space-y-4">
                <FilterSelect
                  label="Marca"
                  value={initialFilters.brand || ""}
                  options={brandOptions}
                  onChange={(value) => pushFilters({ brand: value || undefined, model: undefined })}
                />

                <FilterSelect
                  label="Modelo"
                  value={initialFilters.model || ""}
                  options={modelOptions}
                  onChange={(value) => pushFilters({ model: value || undefined })}
                />

                <FilterSelect
                  label="Preço até"
                  value={String(initialFilters.max_price || "")}
                  options={[
                    { label: "Faixa de preço", value: "" },
                    { label: "Até R$ 60.000", value: "60000" },
                    { label: "Até R$ 80.000", value: "80000" },
                    { label: "Até R$ 100.000", value: "100000" },
                    { label: "Até R$ 150.000", value: "150000" },
                    { label: "Até R$ 200.000", value: "200000" },
                  ]}
                  onChange={(value) =>
                    pushFilters({ max_price: value ? Number(value) : undefined })
                  }
                />

                <div>
                  <span className="mb-2 block text-sm font-medium text-slate-600">Tipo</span>
                  <div className="grid grid-cols-2 gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
                    <button
                      type="button"
                      className="inline-flex h-10 items-center justify-center rounded-md bg-white text-sm font-semibold text-slate-900 shadow-sm ring-1 ring-slate-200"
                    >
                      Carros
                    </button>
                    <button
                      type="button"
                      className="inline-flex h-10 items-center justify-center rounded-md text-sm font-medium text-slate-500"
                      disabled
                    >
                      Motos
                    </button>
                  </div>
                </div>
              </div>
            </CollapsibleSidebarSection>

            <CollapsibleSidebarSection title="Localização">
              <FilterSelect
                label=""
                value={city.slug}
                options={[{ label: city.label, value: city.slug }]}
                onChange={() => undefined}
              />
            </CollapsibleSidebarSection>

            <CollapsibleSidebarSection title="O que te interessa ver hoje?">
              <div className="space-y-1">
                <QuickInterestRow
                  label="Mais novo"
                  count={catalogStats.newest}
                  onClick={() => pushFilters({ sort: "year_desc" })}
                />
                <QuickInterestRow
                  label="Mais barato"
                  count={catalogStats.cheaper}
                  onClick={() => pushFilters({ sort: "price_asc" })}
                />
                <QuickInterestRow
                  label="Menos rodado"
                  count={catalogStats.lessMileage}
                  onClick={() => pushFilters({ sort: "mileage_asc" })}
                />
              </div>
            </CollapsibleSidebarSection>

            <CollapsibleSidebarSection title="Populares">
              <div className="space-y-3">
                {popularBrands.slice(0, 3).map((item) => (
                  <button
                    key={item.brand}
                    type="button"
                    onClick={() => pushFilters({ brand: item.brand })}
                    className="flex w-full items-center justify-between rounded-md px-1 py-2 text-left transition hover:bg-slate-50"
                  >
                    <span className="text-[15px] font-medium text-slate-700">{item.brand}</span>
                    <span className="text-sm font-semibold text-slate-500">
                      {formatTotal(item.total)}
                    </span>
                  </button>
                ))}
              </div>
            </CollapsibleSidebarSection>

            <CollapsibleSidebarSection title="Marcas populares">
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                {popularBrands.map((item) => (
                  <BrandBadge
                    key={`popular-${item.brand}`}
                    label={item.brand}
                    onClick={() => pushFilters({ brand: item.brand })}
                  />
                ))}
              </div>
            </CollapsibleSidebarSection>
          </aside>

          <div>
            <BuyToolbar
              filters={initialFilters}
              mapHref={mapHref}
              onLimitChange={(limit) => pushFilters({ limit })}
              onSortChange={(value) => pushFilters({ sort: value })}
            />

            <div className="mb-5 grid gap-5 lg:grid-cols-2">
              {firstRow.map((item, index) => (
                <CatalogVehicleCard
                  key={`featured-${item.id ?? item.slug ?? item.title ?? index}`}
                  item={item}
                  featured
                  weight={inferWeight(item)}
                />
              ))}
            </div>

            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {remaining.map((item, index) => (
                <CatalogVehicleCard
                  key={`card-${item.id ?? item.slug ?? item.title ?? index}`}
                  item={item}
                  weight={inferWeight(item)}
                />
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
