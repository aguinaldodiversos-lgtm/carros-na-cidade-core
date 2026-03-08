import { TerritorialResultsPageClient } from "../../../components/search/TerritorialResultsPageClient";
import { fetchCityTerritorialPage } from "../../../lib/search/territorial-public";

interface CityPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function CityPage({ params, searchParams }: CityPageProps) {
  const { slug } = await params;
  const resolvedSearchParams = await searchParams;

  const initialData = await fetchCityTerritorialPage(slug, resolvedSearchParams);

  return (
    <TerritorialResultsPageClient
      mode="city"
      slug={slug}
      initialData={initialData}
    />
  );
}
