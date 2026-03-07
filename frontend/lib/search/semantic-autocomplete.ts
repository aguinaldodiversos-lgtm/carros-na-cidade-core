// frontend/lib/search/semantic-autocomplete.ts

export type AutocompleteSuggestionType =
  | "brand"
  | "model"
  | "city"
  | "composed";

export interface FlatAutocompleteSuggestion {
  type: AutocompleteSuggestionType;
  label: string;
  value: string;
  brand: string | null;
  model: string | null;
  city: string | null;
  slug: string | null;
  path: string | null;
  total: number;
  score: number;
}

export interface SemanticRecognizedCity {
  id: number | null;
  name: string;
  slug: string | null;
  state: string | null;
}

export interface SemanticRecognizedPriceRange {
  min: number | null;
  max: number | null;
}

export interface SemanticRecognizedYearRange {
  min: number | null;
  max: number | null;
}

export interface SemanticRecognized {
  brand?: string | null;
  model?: string | null;
  city?: SemanticRecognizedCity | null;
  priceRange?: SemanticRecognizedPriceRange | null;
  yearRange?: SemanticRecognizedYearRange | null;
  belowFipe?: boolean | null;
  fuelType?: string | null;
  transmission?: string | null;
  bodyType?: string | null;
}

export interface SemanticParserMeta {
  original_q?: string | null;
  parsed?: boolean;
  safe?: boolean;
  inferred?: Record<string, unknown>;
}

export interface SemanticAutocompleteData {
  query: string;
  semantic: {
    recognized: SemanticRecognized;
    applicableFilters: Record<string, unknown>;
    parser?: SemanticParserMeta;
  };
  suggestions: {
    brands: FlatAutocompleteSuggestion[];
    models: FlatAutocompleteSuggestion[];
    cities: FlatAutocompleteSuggestion[];
    composed: FlatAutocompleteSuggestion[];
  };
}

export interface SemanticAutocompleteResponse {
  success: boolean;
  data: SemanticAutocompleteData;
}

export interface FlatAutocompleteResponse {
  success: boolean;
  suggestions: FlatAutocompleteSuggestion[];
}

function getApiBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "") || "http://localhost:4000"
  );
}

export async function fetchSemanticAutocomplete(
  query: string,
  options?: {
    currentCitySlug?: string | null;
    limit?: number;
    signal?: AbortSignal;
  }
): Promise<SemanticAutocompleteData> {
  const apiBase = getApiBaseUrl();
  const params = new URLSearchParams();

  params.set("q", query);
  params.set("limit", String(options?.limit ?? 8));

  if (options?.currentCitySlug) {
    params.set("current_city_slug", options.currentCitySlug);
  }

  const response = await fetch(
    `${apiBase}/api/ads/autocomplete/semantic?${params.toString()}`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
      signal: options?.signal,
      cache: "no-store",
    }
  );

  if (!response.ok) {
    throw new Error(`Autocomplete semantic failed with status ${response.status}`);
  }

  const json = (await response.json()) as SemanticAutocompleteResponse;

  if (!json.success || !json.data) {
    throw new Error("Autocomplete semantic returned invalid payload");
  }

  return json.data;
}

export async function fetchFlatAutocomplete(
  query: string,
  options?: {
    currentCitySlug?: string | null;
    limit?: number;
    signal?: AbortSignal;
  }
): Promise<FlatAutocompleteSuggestion[]> {
  const apiBase = getApiBaseUrl();
  const params = new URLSearchParams();

  params.set("q", query);
  params.set("limit", String(options?.limit ?? 8));

  if (options?.currentCitySlug) {
    params.set("current_city_slug", options.currentCitySlug);
  }

  const response = await fetch(
    `${apiBase}/api/ads/autocomplete?${params.toString()}`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
      signal: options?.signal,
      cache: "no-store",
    }
  );

  if (!response.ok) {
    throw new Error(`Autocomplete failed with status ${response.status}`);
  }

  const json = (await response.json()) as FlatAutocompleteResponse;

  if (!json.success || !Array.isArray(json.suggestions)) {
    throw new Error("Autocomplete returned invalid payload");
  }

  return json.suggestions;
}
