import type { Metadata } from "next";
import { cache } from "react";
import { TerritorialResultsPageClient } from "@/components/search/TerritorialResultsPageClient";
import { TerritorialSeoJsonLd } from "@/components/seo/TerritorialSeoJsonLd";
import { fetchCityModelTerritorialPage } from "@/lib/search/territorial-public";
import { buildTerritorialMetadata } from "@/lib/seo/territorial-seo";

interface CityModelPageProps {
  params: { slug: string; brand: string; model: string };
  searchParams: Record<string, string | string[] | undefined>;
}

const getCityModelPageData = cache(
  async (
    slug: string,
    brand: string,
    model: string,
    searchParams: Record<string, string | string[] | undefined>
  ) => fetchCityModelTerritorialPage(slug, brand, model, searchParams)
);

export async function generateMetadata({
  params,
  searchParams,
}: CityModelPageProps): Promise<Metadata> {
  const data = await getCityModelPageData(params.slug, params.brand, params.model, searchParams);

  return buildTerritorialMetadata(data, "model");
}

export default async function CityModelPage({ params, searchParams }: CityModelPageProps) {
  const initialData = await getCityModelPageData(
    params.slug,
    params.brand,
    params.model,
    searchParams
  );

  return (
    <>
      <TerritorialSeoJsonLd data={initialData} mode="model" />
      <TerritorialResultsPageClient
        mode="model"
        slug={params.slug}
        brand={params.brand}
        model={params.model}
        initialData={initialData}
      />
    </>
  );
}
