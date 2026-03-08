import type { Metadata } from "next";
import { cache } from "react";
import { TerritorialResultsPageClient } from "../../../../../../../components/search/TerritorialResultsPageClient";
import { TerritorialSeoJsonLd } from "../../../../../../../components/seo/TerritorialSeoJsonLd";
import { fetchCityModelTerritorialPage } from "../../../../../../../lib/search/territorial-public";
import { buildTerritorialMetadata } from "../../../../../../../lib/seo/territorial-seo";

interface CityModelPageProps {
  params: Promise<{ slug: string; brand: string; model: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const getCityModelPageData = cache(
  async (
    slug: string,
    brand: string,
    model: string,
    searchParams: Record<string, string | string[] | undefined>
  ) => {
    return fetchCityModelTerritorialPage(slug, brand, model, searchParams);
  }
);

export async function generateMetadata({
  params,
  searchParams,
}: CityModelPageProps): Promise<Metadata> {
  const { slug, brand, model } = await params;
  const resolvedSearchParams = await searchParams;
  const data = await getCityModelPageData(
    slug,
    brand,
    model,
    resolvedSearchParams
  );

  return buildTerritorialMetadata(data, "model");
}

export default async function CityModelPage({
  params,
  searchParams,
}: CityModelPageProps) {
  const { slug, brand, model } = await params;
  const resolvedSearchParams = await searchParams;

  const initialData = await getCityModelPageData(
    slug,
    brand,
    model,
    resolvedSearchParams
  );

  return (
    <>
      <TerritorialSeoJsonLd data={initialData} mode="model" />
      <TerritorialResultsPageClient
        mode="model"
        slug={slug}
        brand={brand}
        model={model}
        initialData={initialData}
      />
    </>
  );
}
