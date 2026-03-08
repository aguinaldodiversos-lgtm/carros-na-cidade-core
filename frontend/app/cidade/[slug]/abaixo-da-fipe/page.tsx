import type { Metadata } from "next";
import { cache } from "react";
import { TerritorialResultsPageClient } from "../../../../../components/search/TerritorialResultsPageClient";
import { TerritorialSeoJsonLd } from "../../../../../components/seo/TerritorialSeoJsonLd";
import { fetchCityBelowFipeTerritorialPage } from "../../../../../lib/search/territorial-public";
import { buildTerritorialMetadata } from "../../../../../lib/seo/territorial-seo";

interface CityBelowFipePageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const getCityBelowFipePageData = cache(
  async (
    slug: string,
    searchParams: Record<string, string | string[] | undefined>
  ) => {
    return fetchCityBelowFipeTerritorialPage(slug, searchParams);
  }
);

export async function generateMetadata({
  params,
  searchParams,
}: CityBelowFipePageProps): Promise<Metadata> {
  const { slug } = await params;
  const resolvedSearchParams = await searchParams;
  const data = await getCityBelowFipePageData(slug, resolvedSearchParams);

  return buildTerritorialMetadata(data, "below_fipe");
}

export default async function CityBelowFipePage({
  params,
  searchParams,
}: CityBelowFipePageProps) {
  const { slug } = await params;
  const resolvedSearchParams = await searchParams;

  const initialData = await getCityBelowFipePageData(
    slug,
    resolvedSearchParams
  );

  return (
    <>
      <TerritorialSeoJsonLd data={initialData} mode="below_fipe" />
      <TerritorialResultsPageClient
        mode="below_fipe"
        slug={slug}
        initialData={initialData}
      />
    </>
  );
}
