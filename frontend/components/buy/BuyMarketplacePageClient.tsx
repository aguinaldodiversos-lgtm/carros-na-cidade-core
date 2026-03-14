// frontend/components/buy/BuyMarketplacePageClient.tsx
"use client";

import Link from "next/link";
import { useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import type {
  AdItem,
  AdsFacetsResponse,
  AdsSearchFilters,
  AdsSearchResponse,
} from "@/lib/search/ads-search";
import {
  buildSearchQueryString,
  mergeSearchFilters,
} from "@/lib/search/ads-search-url";
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

function parseNumber(value?: string | number | null) {
  if (typeof value === "number") return value;
  if (!value) return 0;
  const parsed = Number(String(value).replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseDate(value?: string | null) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function getPlanValue(item: CatalogItem) {
  const raw = String(item.plan || "").toLowerCase();
  if (!raw) return "";
  return raw;
}

function isDealer(item: CatalogItem) {
  return Boolean(
    item.dealership_id ||
      item.dealer_name ||
      item.dealership_name ||
      item.seller_type === "dealer" ||
      item.seller_type === "dealership"
  );
}

function getAdWeight(item: CatalogItem): 1 | 2 | 3 | 4 {
  if (item.highlight_until) return 4;

  const plan = getPlanValue(item);
  const premiumSignals = ["premium", "pro", "complete", "enterprise", "plus", "master"];

  if (premiumSignals.some((signal) => plan.includes(signal))) {
    return 3;
  }

  if (isDealer(item)) {
    return 2;
  }

  return 1;
}

function sortCatalogItems(items: CatalogItem[]) {
  return [...items].sort((a, b) => {
    const weightA = getAdWeight(a);
    const weightB = getAdWeight(b);

    if (weightA !== weightB) return weightB - weightA;

    const belowFipeA = a.below_fipe ? 1 : 0;
    const belowFipeB = b.below_fipe ? 1 : 0;
    if (belowFipeA !== belowFipeB) return belowFipeB - belowFipeA;

    const createdA = parseDate(a.created_at);
    const createdB = parseDate(b.created_at);
    if (createdA !== createdB) return createdB - createdA;

    const priceA = parseNumber(a.price);
    const priceB = parseNumber(b.price);
    return priceB - priceA;
  });
}

function formatTotal(total?: number) {
  return new Intl.NumberFormat("pt-BR").format(total || 0);
}

function TopPromoBanner() {
  return (
    <div className="relative overflow-hidden rounded-[20px] border border-[#E5E9F2] bg-white px-7 py-6 shadow-[0_12px_24px_rgba(18,34,72,0.05)]">
      <div className="absolute right-0 top-0 h-full w-[120px] overflow-hidden">
        <div className="absolute right-[-20px] top-[-10px] h-[88px] w-[88px] rounded-full border-[12px] border-[#2F67F6]/25" />
        <div className="absolute right-[-6px] top-[12px] h-[74px] w-[74px] rounded-full border-[10px] border-[#2F67F6]/55" />
        <div className="absolute bottom-[-26px] right-[-18px] h-[90px] w-[90px] rounded-full bg-[#F5A623]" />
      </div>

      <div className="relative flex items-center justify-between gap-6">
        <div>
          <h3 className="text-[22px] font-extrabold leading-tight text-[#1D2440]">
            Venda mais rápido
          </h3>
          <p className="mt-1 text-[16px] text-[#5F6780]">
            com anúncios em <span className="font-extrabold text-[#1F66E5]">destaque</span>
          </p>
        </div>

        <Link
          href="/planos"
          className="inline-flex h-[48px] shrink-0 items-center justify-center rounded-[12px] bg-[#1F66E5] px-6 text-[16px] font-bold text-white transition hover:bg-[#1758CC]"
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
    <div className="mb-5 flex flex-col gap-3 rounded-[18px] border border-[#E5E9F2] bg-white px-4 py-3 shadow-[0_10px_22px_rgba(18,34,72,0.05)] md:flex-row md:items-center md:justify-between">
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
          value={filters.sort || "recent"}
          onChange={(event) => onSortChange(event.target.value)}
          className="h-[44px] rounded-[12px] border border-[#E5E9F2] bg-white px-4 text-[14px] font-semibold text-[#47506A] outline-none"
        >
          <option value="recent">Últimos</option>
          <option value="relevance">Relevância</option>
          <option value="price_asc">Menor preço</option>
          <option value="price_desc">Maior preço</option>
          <option value="mileage_asc">Menos rodado</option>
          <option value="year_desc">Mais novo</option>
        </select>
      </div>

      <button
        type="button"
        className="inline-flex h-[44px] items-center justify-center gap-2 rounded-[12px] border border-[#E5E9F2] bg-[#F6F8FC] px-4 text-[14px] font-bold text-[#47506A] transition hover:bg-[#EEF3FB]"
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

function SidebarSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b border-[#EEF1F6] pb-5 last:border-b-0 last:pb-0">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-[17px] font-extrabold text-[#1D2440]">{title}</h3>
        <svg
          viewBox="0 0 20 20"
          className="h-4 w-4 text-[#7A8398]"
          fill="currentColor"
        >
          <path d="m5 7 5 6 5-6H5Z" />
        </svg>
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

export default function BuyMarketplacePageClient({
  initialResults,
  initialFacets,
  initialFilters,
  city,
}: BuyMarketplacePageClientProps) {
  const router = useRouter();
  const pathname = usePathname();

  const items = useMemo(
    () => sortCatalogItems((initialResults.data || []) as CatalogItem[]),
    [initialResults.data]
  );

  const firstRow = items.slice(0, 2);
  const remaining = items.slice(2);

  const brandOptions = useMemo(() => {
    const brands = (initialFacets?.brands || []) as BrandFacet[];
    const options = brands.slice(0, 12).map((item) => ({
      label: `${item.brand} (${formatTotal(item.total)})`,
      value: item.brand,
    }));

    return [{ label: "Selecionar marca", value: "" }, ...options];
  }, [initialFacets?.brands]);

  const modelOptions = useMemo(() => {
    const models = (initialFacets?.models || []) as ModelFacet[];
    const filtered = initialFilters.brand
      ? models.filter((item) => item.brand === initialFilters.brand)
      : models;

    const options = filtered.slice(0, 12).map((item) => ({
      label: `${item.model} (${formatTotal(item.total)})`,
      value: item.model,
    }));

    return [{ label: "Selecionar modelo", value: "" }, ...options];
  }, [initialFacets?.models, initialFilters.brand]);

  const popularBrands = useMemo(
    () => ((initialFacets?.brands || []) as BrandFacet[]).slice(0, 5),
    [initialFacets?.brands]
  );

  const catalogStats = useMemo(() => {
    const newest = items.length;
    const cheaper = items.filter((item) => parseNumber(item.price) <= 100000).length;
    const lessMileage = items.filter((item) => parseNumber(item.mileage) > 0 && parseNumber(item.mileage) <= 40000).length;

    return {
      newest,
      cheaper,
      lessMileage,
    };
  }, [items]);

  function pushFilters(patch: Partial<AdsSearchFilters>, resetPage = true) {
    const merged = mergeSearchFilters(initialFilters, {
      ...patch,
      ...(resetPage ? { page: 1 } : {}),
    });

    const queryString = buildSearchQueryString(merged);
    router.push(queryString ? `${pathname}?${queryString}` : pathname);
  }

  return (
    <main className="bg-[#F5F7FB]">
      <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
        <section className="mb-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_540px] lg:items-start">
          <div>
            <h1 className="max-w-3xl text-[34px] font-extrabold leading-[1.08] tracking-[-0.03em] text-[#1D2440] md:text-[46px]">
              Carros usados e seminovos em {city.name}
            </h1>
            <p className="mt-4 text-[22px] font-medium text-[#6E748A]">
              {formatTotal(initialResults.pagination?.total || items.length)} anúncios encontrados
            </p>
          </div>

          <TopPromoBanner />
        </section>

        <section className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="rounded-[22px] border border-[#E5E9F2] bg-white p-5 shadow-[0_14px_28px_rgba(18,34,72,0.05)]">
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
                  <span className="mb-2 block text-[14px] font-semibold text-[#4E5A73]">
                    Tipo
                  </span>
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
                onChange={() => null}
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
                {popularBrands.map((item) => (
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
                  <button
                    key={`popular-${item.brand}`}
                    type="button"
                    onClick={() => pushFilters({ brand: item.brand })}
                    className="rounded-[14px] border border-[#E5E9F2] bg-[#FAFBFE] px-3 py-4 text-center text-[14px] font-bold text-[#33405A] transition hover:border-[#C8D5F3] hover:bg-white"
                  >
                    {item.brand}
                  </button>
                ))}
              </div>
            </SidebarSection>
          </aside>

          <div>
            <Toolbar
              filters={initialFilters}
              onSortChange={(value) => pushFilters({ sort: value })}
            />

            {firstRow.length > 0 ? (
              <div className="mb-5 grid gap-5 lg:grid-cols-2">
                {firstRow.map((item) => (
                  <CatalogVehicleCard
                    key={`featured-${item.id}`}
                    item={item}
                    featured
                    weight={getAdWeight(item)}
                  />
                ))}
              </div>
            ) : null}

            {remaining.length > 0 ? (
              <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                {remaining.map((item) => (
                  <CatalogVehicleCard
                    key={`card-${item.id}`}
                    item={item}
                    weight={getAdWeight(item)}
                  />
                ))}
              </div>
            ) : firstRow.length === 0 ? (
              <div className="rounded-[22px] border border-[#E5E9F2] bg-white px-6 py-12 text-center shadow-[0_14px_28px_rgba(18,34,72,0.05)]">
                <h2 className="text-[24px] font-extrabold text-[#1D2440]">
                  Nenhum anúncio encontrado
                </h2>
                <p className="mt-3 text-[16px] text-[#6E748A]">
                  Ajuste os filtros ou tente outra combinação para encontrar ofertas na sua cidade.
                </p>
              </div>
            ) : null}

            <section className="mt-8 overflow-hidden rounded-[22px] border border-[#DCE4F2] bg-[#1F66E5] shadow-[0_18px_36px_rgba(31,102,229,0.20)]">
              <div className="flex flex-col gap-5 px-6 py-6 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="text-[12px] font-extrabold uppercase tracking-[0.18em] text-white/75">
                    Conversão comercial
                  </div>
                  <h3 className="mt-2 text-[24px] font-extrabold leading-tight text-white md:text-[30px]">
                    Destaque seu estoque ou simule a próxima compra com contexto local.
                  </h3>
                  <p className="mt-2 max-w-2xl text-[15px] leading-7 text-white/86">
                    Aumente a visibilidade dos seus anúncios, compare oportunidades e ganhe
                    mais velocidade na sua cidade.
                  </p>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row">
                  <Link
                    href="/planos"
                    className="inline-flex h-[48px] items-center justify-center rounded-[12px] bg-white px-5 text-[16px] font-bold text-[#1F66E5] transition hover:bg-[#EEF4FF]"
                  >
                    Anunciar agora
                  </Link>
                  <Link
                    href={`/simulador-financiamento/${city.slug}`}
                    className="inline-flex h-[48px] items-center justify-center rounded-[12px] border border-white/35 bg-[#164DB6] px-5 text-[16px] font-bold text-white transition hover:bg-[#123F97]"
                  >
                    Simular financiamento
                  </Link>
                </div>
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}
