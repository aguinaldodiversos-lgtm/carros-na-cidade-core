import type { Metadata } from "next";
import { cache } from "react";
import { TerritorialResultsPageClient } from "@/components/search/TerritorialResultsPageClient";
import { TerritorialSeoJsonLd } from "@/components/seo/TerritorialSeoJsonLd";
import { fetchCityBrandTerritorialPage } from "@/lib/search/territorial-public";
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
  const data = await getCityBrandPageData(
    params.slug,
    params.brand,
    searchParams
  );

  return buildTerritorialMetadata(data, "brand");
}

export default async function CityBrandPage({
  params,
  searchParams,
}: CityBrandPageProps) {
  const initialData = await getCityBrandPageData(
    params.slug,
    params.brand,
    searchParams
  );

  return (
    <>
      <TerritorialSeoJsonLd data={initialData} mode="brand" />
      <TerritorialResultsPageClient
        mode="brand"
        slug={params.slug}
        brand={params.brand}
        initialData={initialData}
      />
    </>
  );
}
