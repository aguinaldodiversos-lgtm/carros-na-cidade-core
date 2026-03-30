import type { Metadata } from "next";
import { cache } from "react";
import { TerritorialResultsPageClient } from "@/components/search/TerritorialResultsPageClient";
import { TerritorialSeoJsonLd } from "@/components/seo/TerritorialSeoJsonLd";
import { fetchCityTerritorialPage } from "@/lib/search/territorial-public";
import { buildTerritorialMetadata } from "@/lib/seo/territorial-seo";

interface CityPageProps {
  params: { slug: string };
  searchParams: Record<string, string | string[] | undefined>;
}

const getCityPageData = cache(
  async (slug: string, searchParams: Record<string, string | string[] | undefined>) =>
    fetchCityTerritorialPage(slug, searchParams)
);

export async function generateMetadata({ params, searchParams }: CityPageProps): Promise<Metadata> {
  const data = await getCityPageData(params.slug, searchParams);
  return buildTerritorialMetadata(data, "city");
}

export default async function CityPage({ params, searchParams }: CityPageProps) {
  const initialData = await getCityPageData(params.slug, searchParams);

  return (
    <>
      <TerritorialSeoJsonLd data={initialData} mode="city" />
      <TerritorialResultsPageClient mode="city" slug={params.slug} initialData={initialData} />
    </>
  );
}
