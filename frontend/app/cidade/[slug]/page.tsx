import type { Metadata } from "next";
import { cache } from "react";
import { TerritorialResultsPageClient } from "@/components/search/TerritorialResultsPageClient";
import { TerritorialSeoJsonLd } from "@/components/seo/TerritorialSeoJsonLd";
import { fetchCityTerritorialPage } from "@/lib/search/territorial-public";
import { buildTerritorialMetadata } from "@/lib/seo/territorial-seo";

interface CityPageProps {
  params: { slug: string };
  searchParams: Record<string, string | string[] | undefined>;
}

const getCityPageData = cache(
  async (slug: string, searchParams: Record<string, string | string[] | undefined>) =>
    fetchCityTerritorialPage(slug, searchParams)
);

/**
 * Política de canonical de transição (Fase 1 da auditoria territorial em
 * docs/runbooks/territorial-canonical-audit.md): /cidade/[slug] continua
 * acessível mas canonicaliza para /carros-em/[slug], a canônica
 * intermediária da intenção "comprar carros na cidade". Sem 301 nesta
 * etapa — apenas <link rel="canonical"> e JSON-LD url para consolidar
 * autoridade na URL canônica. /carros-em é INTERMEDIÁRIA, não definitiva
 * (futuro: possível migração para /carros-usados/cidade/[slug]).
 */
function transitionCanonicalPath(slug: string): string {
  return `/carros-em/${encodeURIComponent(slug)}`;
}

export async function generateMetadata({ params, searchParams }: CityPageProps): Promise<Metadata> {
  const data = await getCityPageData(params.slug, searchParams);
  return buildTerritorialMetadata(data, "city", {
    canonicalPathOverride: transitionCanonicalPath(params.slug),
  });
}

export default async function CityPage({ params, searchParams }: CityPageProps) {
  const initialData = await getCityPageData(params.slug, searchParams);
  const canonicalPathOverride = transitionCanonicalPath(params.slug);

  return (
    <>
      <TerritorialSeoJsonLd
        data={initialData}
        mode="city"
        canonicalPathOverride={canonicalPathOverride}
      />
      <TerritorialResultsPageClient mode="city" slug={params.slug} initialData={initialData} />
    </>
  );
}
