import { TerritorialResultsPageClient } from "../../../../../components/search/TerritorialResultsPageClient";
import { fetchCityOpportunitiesTerritorialPage } from "../../../../../lib/search/territorial-public";

interface CityOpportunitiesPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function CityOpportunitiesPage({
  params,
  searchParams,
}: CityOpportunitiesPageProps) {
  const { slug } = await params;
  const resolvedSearchParams = await searchParams;

  const initialData = await fetchCityOpportunitiesTerritorialPage(
    slug,
    resolvedSearchParams
  );

  return (
    <TerritorialResultsPageClient
      mode="opportunities"
      slug={slug}
      initialData={initialData}
    />
  );
}
