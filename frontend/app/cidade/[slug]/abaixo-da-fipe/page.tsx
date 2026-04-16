import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import { TerritorialResultsPageClient } from "@/components/search/TerritorialResultsPageClient";
import { TerritorialSeoJsonLd } from "@/components/seo/TerritorialSeoJsonLd";
import { fetchCityBelowFipeTerritorialPage } from "@/lib/search/territorial-public";
import { buildTerritorialMetadata } from "@/lib/seo/territorial-seo";

interface CityBelowFipePageProps {
  params: { slug: string };
  searchParams: Record<string, string | string[] | undefined>;
}

const getCityBelowFipePageData = cache(
  async (slug: string, searchParams: Record<string, string | string[] | undefined>) => {
    try {
      return await fetchCityBelowFipeTerritorialPage(slug, searchParams);
    } catch (err) {
      if ((err as Record<string, unknown>)?.statusCode === 404) return null;
      throw err;
    }
  }
);

export async function generateMetadata({
  params,
  searchParams,
}: CityBelowFipePageProps): Promise<Metadata> {
  const data = await getCityBelowFipePageData(params.slug, searchParams);
  if (!data) return { title: "Página não encontrada | Carros na Cidade" };
  return buildTerritorialMetadata(data, "below_fipe");
}

export default async function CityBelowFipePage({ params, searchParams }: CityBelowFipePageProps) {
  const initialData = await getCityBelowFipePageData(params.slug, searchParams);
  if (!initialData) notFound();

  return (
    <>
      <TerritorialSeoJsonLd data={initialData} mode="below_fipe" />
      <TerritorialResultsPageClient
        mode="below_fipe"
        slug={params.slug}
        initialData={initialData}
      />
    </>
  );
}
