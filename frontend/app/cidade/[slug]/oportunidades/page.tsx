import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import { TerritorialResultsPageClient } from "@/components/search/TerritorialResultsPageClient";
import { TerritorialSeoJsonLd } from "@/components/seo/TerritorialSeoJsonLd";
import { fetchCityOpportunitiesTerritorialPage } from "@/lib/search/territorial-public";
import { buildTerritorialMetadata } from "@/lib/seo/territorial-seo";

interface CityOpportunitiesPageProps {
  params: { slug: string };
  searchParams: Record<string, string | string[] | undefined>;
}

const getCityOpportunitiesPageData = cache(
  async (slug: string, searchParams: Record<string, string | string[] | undefined>) => {
    try {
      return await fetchCityOpportunitiesTerritorialPage(slug, searchParams);
    } catch (err) {
      if ((err as Record<string, unknown>)?.statusCode === 404) return null;
      throw err;
    }
  }
);

export async function generateMetadata({
  params,
  searchParams,
}: CityOpportunitiesPageProps): Promise<Metadata> {
  const data = await getCityOpportunitiesPageData(params.slug, searchParams);
  if (!data) return { title: "Página não encontrada | Carros na Cidade" };
  return buildTerritorialMetadata(data, "opportunities");
}

export default async function CityOpportunitiesPage({
  params,
  searchParams,
}: CityOpportunitiesPageProps) {
  const initialData = await getCityOpportunitiesPageData(params.slug, searchParams);
  if (!initialData) notFound();

  return (
    <>
      <TerritorialSeoJsonLd data={initialData} mode="opportunities" />
      <TerritorialResultsPageClient
        mode="opportunities"
        slug={params.slug}
        initialData={initialData}
      />
    </>
  );
}
