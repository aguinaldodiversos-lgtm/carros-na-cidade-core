import { TerritorialResultsPageClient } from "../../../../../components/search/TerritorialResultsPageClient";
import { fetchCityBelowFipeTerritorialPage } from "../../../../../lib/search/territorial-public";

interface CityBelowFipePageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function CityBelowFipePage({
  params,
  searchParams,
}: CityBelowFipePageProps) {
  const { slug } = await params;
  const resolvedSearchParams = await searchParams;

  const initialData = await fetchCityBelowFipeTerritorialPage(
    slug,
    resolvedSearchParams
  );

  return (
    <TerritorialResultsPageClient
      mode="below_fipe"
      slug={slug}
      initialData={initialData}
    />
  );
}
