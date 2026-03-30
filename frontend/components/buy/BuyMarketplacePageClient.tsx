"use client";

import Link from "next/link";
import { useCallback, useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";

import type {
  AdsFacetsResponse,
  AdsSearchFilters,
  AdsSearchResponse,
} from "@/lib/search/ads-search";
import { buildSearchQueryString, mergeSearchFilters } from "@/lib/search/ads-search-url";
import CatalogVehicleCard, { type CatalogItem } from "@/components/buy/CatalogVehicleCard";
import { REGIONAL_BRAND_TAGLINE } from "@/lib/site/public-config";
import { SITE_ROUTES } from "@/lib/site/site-navigation";

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
      image_url: "/images/banner1.jpg",
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
      image_url: "/images/banner2.jpg",
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
      image_url: "/images/compass.jpeg",
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
      image_url: "/images/corolla.jpeg",
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
      image_url: "/images/civic.jpeg",
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
      image_url: "/images/banner2.jpg",
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
      image_url: "/images/civic.jpeg",
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
      image_url: "/images/corolla.jpeg",
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
    <div className="relative overflow-hidden rounded-[18px] border border-[#E5E9F2] bg-white px-7 py-6 shadow-[0_10px_22px_rgba(18,34,72,0.05)]">
      <div className="absolute right-0 top-0 h-full w-[118px] overflow-hidden">
        <div className="absolute right-[-14px] top-[2px] h-[88px] w-[88px] rounded-full border-[12px] border-[#2F67F6]/22" />
        <div className="absolute right-[8px] top-[18px] h-[72px] w-[72px] rounded-full border-[10px] border-[#2F67F6]/55" />
        <div className="absolute bottom-[-26px] right-[-16px] h-[88px] w-[88px] rounded-full bg-[#F5A623]" />
      </div>

      <div className="relative flex items-center justify-between gap-6">
        <div>
          <h3 className="text-[22px] font-extrabold text-[#1D2440]">Destaque na região</h3>
          <p className="mt-1 text-[16px] text-[#5F6780]">
            Seja encontrado por quem busca carro na{" "}
            <span className="font-extrabold text-[#1F66E5]">cidade certa</span>
          </p>
        </div>

        <Link
          href="/planos"
          className="inline-flex h-[46px] shrink-0 items-center justify-center rounded-[12px] bg-[#1F66E5] px-6 text-[16px] font-bold text-white transition hover:bg-[#1758CC]"
        >
          Patrocinar anúncio
        </Link>
      </div>
    </div>
  );
}

function Toolbar({
  filters,
  onSortChange,
}: {
  filters: AdsSearchFilters;
  onSortChange: (value: string) => void;
}) {
  return (
    <div className="mb-5 flex flex-col gap-3 rounded-[16px] border border-[#E5E9F2] bg-white px-4 py-3 shadow-[0_8px_18px_rgba(18,34,72,0.05)] md:flex-row md:items-center md:justify-between">
      <div className="flex flex-wrap items-center gap-3">
        <select className="h-[44px] rounded-[12px] border border-[#E5E9F2] bg-white px-4 text-[14px] font-semibold text-[#47506A] outline-none">
          <option>51 últimos</option>
          <option>100 últimos</option>
          <option>200 últimos</option>
        </select>

        <div className="hidden items-center gap-2 text-[#6E748A] md:flex">
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <path d="M4 6h16M7 12h10M10 18h4" />
          </svg>
        </div>

        <select
          value={filters.sort || "relevance"}
          onChange={(event) => onSortChange(event.target.value)}
          className="h-[44px] rounded-[12px] border border-[#E5E9F2] bg-white px-4 text-[14px] font-semibold text-[#47506A] outline-none"
        >
          <option value="relevance">Relevância (plano + destaque + região)</option>
          <option value="highlight">Destaque ativo primeiro</option>
          <option value="recent">Últimos</option>
          <option value="price_asc">Menor preço</option>
          <option value="price_desc">Maior preço</option>
          <option value="mileage_asc">Menos rodado</option>
          <option value="year_desc">Mais novo</option>
        </select>
      </div>

      <button
        type="button"
        className="inline-flex h-[44px] items-center justify-center gap-2 rounded-[12px] border border-[#E5E9F2] bg-[#F7F9FC] px-4 text-[14px] font-bold text-[#47506A] transition hover:bg-[#EEF3FB]"
      >
        <svg
          viewBox="0 0 24 24"
          className="h-5 w-5 text-[#6E748A]"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <path d="M4 10.5 12 4l8 6.5v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" />
          <path d="M9 14h6" />
        </svg>
        Ver no mapa
      </button>
    </div>
  );
}

function SidebarSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-[#EEF1F6] pb-6 last:border-b-0 last:pb-0">
      <div className="mb-4 border-b border-[#F4F7FB] pb-3">
        <h3 className="text-[15px] font-extrabold tracking-tight text-[#1D2440]">{title}</h3>
      </div>
      {children}
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
      <span className="mb-2 block text-[14px] font-semibold text-[#4E5A73]">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-[52px] w-full rounded-[12px] border border-[#E5E9F2] bg-white px-4 text-[15px] font-medium text-[#33405A] outline-none transition focus:border-[#1F66E5]"
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
      className="flex w-full items-center justify-between rounded-[12px] px-1 py-2 text-left transition hover:bg-[#F7F9FC]"
    >
      <span className="text-[15px] font-medium text-[#33405A]">{label}</span>
      <span className="inline-flex min-w-[52px] items-center justify-center rounded-full bg-[#F1F4FA] px-3 py-1 text-[12px] font-bold text-[#7A8398]">
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
      className="rounded-[14px] border border-[#E5E9F2] bg-[#FAFBFE] px-3 py-4 text-center transition hover:border-[#CFD9F0] hover:bg-white"
    >
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-[#EEF4FF] text-[15px] font-extrabold text-[#1F66E5]">
        {initial}
      </div>
      <div className="mt-2 text-[13px] font-bold text-[#33405A]">{label}</div>
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

  const items = useMemo(() => sortCatalogItems(rawItems), [rawItems]);

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

  return (
    <main className="bg-[#F5F7FB]">
      <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 xl:px-8 md:py-10">
        <section className="mb-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_540px] lg:items-start">
          <div>
            <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-[#1F66E5]">
              {REGIONAL_BRAND_TAGLINE}
            </p>
            <h1 className="mt-2 max-w-3xl text-[34px] font-extrabold leading-[1.08] tracking-[-0.03em] text-[#1D2440] md:text-[46px]">
              Usados e seminovos em {city.name}
            </h1>
            <p className="mt-4 max-w-2xl text-[17px] leading-relaxed text-[#5C6678]">
              Catálogo ancorado em <span className="font-semibold text-[#1D2440]">{city.name}</span>{" "}
              ({city.state}): cada listagem traz cidade e estado para você comparar com o que
              importa na sua rotina.
            </p>
            <p className="mt-3 text-[22px] font-semibold text-[#6E748A]">
              {formatTotal(totalAds)} anúncios neste território
            </p>
            <p className="mt-3 text-[14px] text-[#6E748A]">
              <Link
                href={`/cidade/${city.slug}`}
                className="font-bold text-[#1F66E5] underline-offset-2 hover:underline"
              >
                Ver hub de {city.name}
              </Link>
              <span className="text-[#9AA3B5]"> — marcas, oportunidades e rotas locais</span>
            </p>
          </div>

          <TopPromoBanner />
        </section>

        <section
          className="mb-6 flex flex-col gap-3 rounded-[16px] border border-[#E5E9F2] bg-white px-4 py-4 shadow-[0_8px_18px_rgba(18,34,72,0.04)] sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-x-6"
          aria-label="Confiança na compra"
        >
          <div className="flex flex-col gap-1 sm:max-w-xl">
            <p className="text-[15px] font-extrabold text-[#1D2440]">
              Confiança começa no território certo
            </p>
            <p className="text-[13px] leading-relaxed text-[#6E748A]">
              Preferimos cidade e estado visíveis em cada anúncio. Combine visita presencial e siga
              nosso guia antes de fechar negócio.
            </p>
          </div>
          <Link
            href={SITE_ROUTES.seguranca}
            className="inline-flex shrink-0 items-center justify-center rounded-[12px] border border-[#D8E2FB] bg-[#F5F8FF] px-4 py-3 text-[14px] font-bold text-[#1F66E5] transition hover:bg-[#EEF4FF]"
          >
            Dicas de negociação segura
          </Link>
        </section>

        <section className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="rounded-[22px] border border-[#E5E9F2] bg-white p-5 shadow-[0_12px_26px_rgba(18,34,72,0.05)]">
            <SidebarSection title="Filtros rápidos">
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
                  <span className="mb-2 block text-[14px] font-semibold text-[#4E5A73]">Tipo</span>
                  <div className="grid grid-cols-2 gap-2 rounded-[14px] bg-[#F3F6FB] p-1">
                    <button
                      type="button"
                      className="inline-flex h-[42px] items-center justify-center rounded-[12px] bg-white text-[14px] font-bold text-[#1D2440] shadow-sm"
                    >
                      Carros
                    </button>
                    <button
                      type="button"
                      className="inline-flex h-[42px] items-center justify-center rounded-[12px] text-[14px] font-bold text-[#778199]"
                    >
                      Motos
                    </button>
                  </div>
                </div>
              </div>
            </SidebarSection>

            <SidebarSection title="Localização">
              <FilterSelect
                label=""
                value={city.slug}
                options={[{ label: city.label, value: city.slug }]}
                onChange={() => undefined}
              />
            </SidebarSection>

            <SidebarSection title="O que te interessa ver hoje?">
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
            </SidebarSection>

            <SidebarSection title="Populares">
              <div className="space-y-3">
                {popularBrands.slice(0, 3).map((item) => (
                  <button
                    key={item.brand}
                    type="button"
                    onClick={() => pushFilters({ brand: item.brand })}
                    className="flex w-full items-center justify-between rounded-[12px] px-1 py-2 text-left transition hover:bg-[#F7F9FC]"
                  >
                    <span className="text-[15px] font-medium text-[#33405A]">{item.brand}</span>
                    <span className="text-[14px] font-bold text-[#7A8398]">
                      {formatTotal(item.total)}
                    </span>
                  </button>
                ))}
              </div>
            </SidebarSection>

            <SidebarSection title="Marcas populares">
              <div className="grid grid-cols-2 gap-3">
                {popularBrands.map((item) => (
                  <BrandBadge
                    key={`popular-${item.brand}`}
                    label={item.brand}
                    onClick={() => pushFilters({ brand: item.brand })}
                  />
                ))}
              </div>
            </SidebarSection>
          </aside>

          <div>
            <Toolbar
              filters={initialFilters}
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
