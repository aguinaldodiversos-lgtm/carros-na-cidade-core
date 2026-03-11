import {
  fetchAdsFacets,
  fetchAdsSearch,
} from "@/lib/search/ads-search";
import { parseAdsSearchFiltersFromSearchParams } from "@/lib/search/ads-search-url";
import { VehicleSearchResultsPage } from "../../components/search/VehicleSearchResultsPage";

type SearchParams = Record<string, string | string[] | undefined>;

function toReader(searchParams: SearchParams) {
  return {
    get(name: string) {
      const value = searchParams[name];
      if (Array.isArray(value)) return value[0] ?? null;
      return value ?? null;
    },
  };
}

type ComprarPageProps = {
  searchParams: SearchParams;
};

export const revalidate = 60;

export default async function ComprarPage({ searchParams }: ComprarPageProps) {
  const filters = parseAdsSearchFiltersFromSearchParams(toReader(searchParams));

  const [initialResults, initialFacetsResponse] = await Promise.all([
    fetchAdsSearch(filters),
    fetchAdsFacets(filters).catch(() => null),
  ]);

  return (
    <VehicleSearchResultsPage
      initialResults={initialResults}
      initialFacets={initialFacetsResponse?.facets || null}
    />
  );
}
