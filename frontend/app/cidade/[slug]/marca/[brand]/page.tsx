import type { Metadata } from "next";
import { cache } from "react";
import { TerritorialResultsPageClient } from "@/components/search/TerritorialResultsPageClient";
import { TerritorialSeoJsonLd } from "@/components/seo/TerritorialSeoJsonLd";
import BreadcrumbJsonLd from "@/components/seo/BreadcrumbJsonLd";
import { BrandNeighborCities } from "@/components/search/BrandNeighborCities";
import { fetchCityBrandTerritorialPage } from "@/lib/search/territorial-public";
import {
  BRAND_CITY_MIN_INVENTORY,
  buildTerritorialBreadcrumbs,
  getTerritorialInventoryCount,
} from "@/lib/search/territorial-navigation";
import { buildTerritorialMetadata } from "@/lib/seo/territorial-seo";

interface CityBrandPageProps {
  params: { slug: string; brand: string };
  searchParams: Record<string, string | string[] | undefined>;
}

const getCityBrandPageData = cache(
  async (
    slug: string,
    brand: string,
    searchParams: Record<string, string | string[] | undefined>
  ) => fetchCityBrandTerritorialPage(slug, brand, searchParams)
);

export async function generateMetadata({
  params,
  searchParams,
}: CityBrandPageProps): Promise<Metadata> {
  const data = await getCityBrandPageData(params.slug, params.brand, searchParams);

  // PROTEÇÃO (auditoria SEO 2026-07-03): marca com < 3 anúncios na cidade →
  // noindex,follow. Inventário insuficiente p/ competir + risco de thin
  // content. >= 3 mantém a decisão de indexação do backend (estoque ativo).
  const inventoryCount = getTerritorialInventoryCount(data);
  const forceNoindex = inventoryCount < BRAND_CITY_MIN_INVENTORY;

  return buildTerritorialMetadata(data, "brand", { searchParams, forceNoindex });
}

export default async function CityBrandPage({ params, searchParams }: CityBrandPageProps) {
  const initialData = await getCityBrandPageData(params.slug, params.brand, searchParams);

  // BreadcrumbList (item 4): Home > Anúncios > Cidade > Marca. O ItemList dos
  // anúncios já é emitido pelo TerritorialSeoJsonLd (CollectionPage.mainEntity).
  const breadcrumbItems = buildTerritorialBreadcrumbs(initialData, "brand").map((b) => ({
    name: b.label,
    href: b.href,
  }));

  return (
    <>
      <TerritorialSeoJsonLd data={initialData} mode="brand" />
      <BreadcrumbJsonLd items={breadcrumbItems} />
      <TerritorialResultsPageClient
        mode="brand"
        slug={params.slug}
        brand={params.brand}
        initialData={initialData}
      />
      {/* Item 5 — cluster marca×território: {marca} em cidades vizinhas. */}
      <BrandNeighborCities
        citySlug={params.slug}
        cityUf={initialData.city?.state}
        brandName={initialData.brand?.name || ""}
        brandSlug={params.brand}
      />
    </>
  );
}
