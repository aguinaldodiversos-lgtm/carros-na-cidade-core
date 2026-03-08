import { TerritorialResultsPageClient } from "../../../../../../../components/search/TerritorialResultsPageClient";
import { fetchCityModelTerritorialPage } from "../../../../../../../lib/search/territorial-public";

interface CityModelPageProps {
  params: Promise<{ slug: string; brand: string; model: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function CityModelPage({
  params,
  searchParams,
}: CityModelPageProps) {
  const { slug, brand, model } = await params;
  const resolvedSearchParams = await searchParams;

  const initialData = await fetchCityModelTerritorialPage(
    slug,
    brand,
    model,
    resolvedSearchParams
  );

  return (
    <TerritorialResultsPageClient
      mode="model"
      slug={slug}
      brand={brand}
      model={model}
      initialData={initialData}
    />
  );
}
