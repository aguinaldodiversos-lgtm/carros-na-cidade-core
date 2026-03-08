import type { Metadata } from "next";
import { cache } from "react";
import { TerritorialResultsPageClient } from "../../../components/search/TerritorialResultsPageClient";
import { TerritorialSeoJsonLd } from "../../../components/seo/TerritorialSeoJsonLd";
import { fetchCityTerritorialPage } from "../../../lib/search/territorial-public";
import { buildTerritorialMetadata } from "../../../lib/seo/territorial-seo";

interface CityPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const getCityPageData = cache(
  async (
    slug: string,
    searchParams: Record<string, string | string[] | undefined>
  ) => {
    return fetchCityTerritorialPage(slug, searchParams);
  }
);

export async function generateMetadata({
  params,
  searchParams,
}: CityPageProps): Promise<Metadata> {
  const { slug } = await params;
  const resolvedSearchParams = await searchParams;
  const data = await getCityPageData(slug, resolvedSearchParams);

  return buildTerritorialMetadata(data, "city");
}

export default async function CityPage({ params, searchParams }: CityPageProps) {
  const { slug } = await params;
  const resolvedSearchParams = await searchParams;

  const initialData = await getCityPageData(slug, resolvedSearchParams);

  return (
    <>
      <TerritorialSeoJsonLd data={initialData} mode="city" />
      <TerritorialResultsPageClient
        mode="city"
        slug={slug}
        initialData={initialData}
      />
    </>
  );
}
