import type { Metadata } from "next";
import { cache } from "react";
import { TerritorialResultsPageClient } from "../../../../../components/search/TerritorialResultsPageClient";
import { TerritorialSeoJsonLd } from "../../../../../components/seo/TerritorialSeoJsonLd";
import { fetchCityOpportunitiesTerritorialPage } from "../../../../../lib/search/territorial-public";
import { buildTerritorialMetadata } from "../../../../../lib/seo/territorial-seo";

interface CityOpportunitiesPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const getCityOpportunitiesPageData = cache(
  async (
    slug: string,
    searchParams: Record<string, string | string[] | undefined>
  ) => {
    return fetchCityOpportunitiesTerritorialPage(slug, searchParams);
  }
);

export async function generateMetadata({
  params,
  searchParams,
}: CityOpportunitiesPageProps): Promise<Metadata> {
  const { slug } = await params;
  const resolvedSearchParams = await searchParams;
  const data = await getCityOpportunitiesPageData(slug, resolvedSearchParams);

  return buildTerritorialMetadata(data, "opportunities");
}

export default async function CityOpportunitiesPage({
  params,
  searchParams,
}: CityOpportunitiesPageProps) {
  const { slug } = await params;
  const resolvedSearchParams = await searchParams;

  const initialData = await getCityOpportunitiesPageData(
    slug,
    resolvedSearchParams
  );

  return (
    <>
      <TerritorialSeoJsonLd data={initialData} mode="opportunities" />
      <TerritorialResultsPageClient
        mode="opportunities"
        slug={slug}
        initialData={initialData}
      />
    </>
  );
}
