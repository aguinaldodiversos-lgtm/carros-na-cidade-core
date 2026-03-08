import { TerritorialResultsPageClient } from "../../../../../components/search/TerritorialResultsPageClient";
import { fetchCityBrandTerritorialPage } from "../../../../../lib/search/territorial-public";

interface CityBrandPageProps {
  params: Promise<{ slug: string; brand: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function CityBrandPage({
  params,
  searchParams,
}: CityBrandPageProps) {
  const { slug, brand } = await params;
  const resolvedSearchParams = await searchParams;

  const initialData = await fetchCityBrandTerritorialPage(
    slug,
    brand,
    resolvedSearchParams
  );

  return (
    <TerritorialResultsPageClient
      mode="brand"
      slug={slug}
      brand={brand}
      initialData={initialData}
    />
  );
}
