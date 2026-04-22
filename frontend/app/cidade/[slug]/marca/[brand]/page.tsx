import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
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
  ) => {
    try {
      return await fetchCityBrandTerritorialPage(slug, brand, searchParams);
    } catch (err) {
      if ((err as Record<string, unknown>)?.statusCode === 404) return null;
      throw err;
    }
  }
);

export async function generateMetadata({
  params,
  searchParams,
}: CityBrandPageProps): Promise<Metadata> {
  const data = await getCityBrandPageData(params.slug, params.brand, searchParams);
  if (!data) return { title: "Página não encontrada | Carros na Cidade" };
  return buildTerritorialMetadata(data, "brand");
}

export default async function CityBrandPage({ params, searchParams }: CityBrandPageProps) {
  const initialData = await getCityBrandPageData(params.slug, params.brand, searchParams);
  if (!initialData) notFound();

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
