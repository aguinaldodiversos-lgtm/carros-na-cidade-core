import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import { TerritorialResultsPageClient } from "@/components/search/TerritorialResultsPageClient";
import { TerritorialSeoJsonLd } from "@/components/seo/TerritorialSeoJsonLd";
import { fetchCityTerritorialPage } from "@/lib/search/territorial-public";
import { buildTerritorialMetadata } from "@/lib/seo/territorial-seo";

interface CityPageProps {
  params: { slug: string };
  searchParams: Record<string, string | string[] | undefined>;
}

const getCityPageData = cache(
  async (slug: string, searchParams: Record<string, string | string[] | undefined>) => {
    try {
      return await fetchCityTerritorialPage(slug, searchParams);
    } catch (err) {
      if ((err as Record<string, unknown>)?.statusCode === 404) return null;
      throw err;
    }
  }
);

export async function generateMetadata({ params, searchParams }: CityPageProps): Promise<Metadata> {
  const data = await getCityPageData(params.slug, searchParams);
  if (!data) return { title: "Cidade não encontrada | Carros na Cidade" };
  return buildTerritorialMetadata(data, "city");
}

export default async function CityPage({ params, searchParams }: CityPageProps) {
  const initialData = await getCityPageData(params.slug, searchParams);
  if (!initialData) notFound();

  return (
    <>
      <TerritorialSeoJsonLd data={initialData} mode="city" />
      <TerritorialResultsPageClient mode="city" slug={params.slug} initialData={initialData} />
    </>
  );
}
