import type { Metadata } from "next";
import { cache } from "react";
import { TerritorialResultsPageClient } from "@/components/search/TerritorialResultsPageClient";
import { TerritorialSeoJsonLd } from "@/components/seo/TerritorialSeoJsonLd";
import { fetchCityOpportunitiesTerritorialPage } from "@/lib/search/territorial-public";
import { buildTerritorialMetadata } from "@/lib/seo/territorial-seo";

interface CityOpportunitiesPageProps {
  params: { slug: string };
  searchParams: Record<string, string | string[] | undefined>;
}

const getCityOpportunitiesPageData = cache(
  async (slug: string, searchParams: Record<string, string | string[] | undefined>) =>
    fetchCityOpportunitiesTerritorialPage(slug, searchParams)
);

/**
 * Deduplicação de transição: "oportunidades" e "abaixo da FIPE" representam
 * a mesma intenção de busca (carros com preço abaixo da FIPE na cidade).
 * Esta página continua acessível mas canonicaliza para
 * /cidade/[slug]/abaixo-da-fipe — sem 301 nesta etapa.
 */
function transitionCanonicalPath(slug: string): string {
  return `/cidade/${encodeURIComponent(slug)}/abaixo-da-fipe`;
}

export async function generateMetadata({
  params,
  searchParams,
}: CityOpportunitiesPageProps): Promise<Metadata> {
  const data = await getCityOpportunitiesPageData(params.slug, searchParams);
  return buildTerritorialMetadata(data, "opportunities", {
    canonicalPathOverride: transitionCanonicalPath(params.slug),
  });
}

export default async function CityOpportunitiesPage({
  params,
  searchParams,
}: CityOpportunitiesPageProps) {
  const initialData = await getCityOpportunitiesPageData(params.slug, searchParams);
  const canonicalPathOverride = transitionCanonicalPath(params.slug);

  return (
    <>
      <TerritorialSeoJsonLd
        data={initialData}
        mode="opportunities"
        canonicalPathOverride={canonicalPathOverride}
      />
      <TerritorialResultsPageClient
        mode="opportunities"
        slug={params.slug}
        initialData={initialData}
      />
    </>
  );
}
