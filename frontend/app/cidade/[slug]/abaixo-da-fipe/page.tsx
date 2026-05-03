import type { Metadata } from "next";
import { cache } from "react";
import { TerritorialResultsPageClient } from "@/components/search/TerritorialResultsPageClient";
import { TerritorialSeoJsonLd } from "@/components/seo/TerritorialSeoJsonLd";
import { fetchCityBelowFipeTerritorialPage } from "@/lib/search/territorial-public";
import { buildTerritorialMetadata } from "@/lib/seo/territorial-seo";

interface CityBelowFipePageProps {
  params: { slug: string };
  searchParams: Record<string, string | string[] | undefined>;
}

const getCityBelowFipePageData = cache(
  async (slug: string, searchParams: Record<string, string | string[] | undefined>) =>
    fetchCityBelowFipeTerritorialPage(slug, searchParams)
);

/**
 * Política de canonical de transição (Fase 1 da auditoria territorial em
 * docs/runbooks/territorial-canonical-audit.md): /cidade/[slug]/abaixo-da-fipe
 * permanece noindex,follow e canonicaliza para /carros-baratos-em/[slug],
 * a única indexável da intenção "barato/abaixo-da-fipe". Sem 301 nesta
 * etapa. /carros-baratos-em é INTERMEDIÁRIA, não definitiva.
 */
function transitionCanonicalPath(slug: string): string {
  return `/carros-baratos-em/${encodeURIComponent(slug)}`;
}

export async function generateMetadata({
  params,
  searchParams,
}: CityBelowFipePageProps): Promise<Metadata> {
  const data = await getCityBelowFipePageData(params.slug, searchParams);
  return buildTerritorialMetadata(data, "below_fipe", {
    canonicalPathOverride: transitionCanonicalPath(params.slug),
  });
}

export default async function CityBelowFipePage({ params, searchParams }: CityBelowFipePageProps) {
  const initialData = await getCityBelowFipePageData(params.slug, searchParams);
  const canonicalPathOverride = transitionCanonicalPath(params.slug);

  return (
    <>
      <TerritorialSeoJsonLd
        data={initialData}
        mode="below_fipe"
        canonicalPathOverride={canonicalPathOverride}
      />
      <TerritorialResultsPageClient
        mode="below_fipe"
        slug={params.slug}
        initialData={initialData}
      />
    </>
  );
}
