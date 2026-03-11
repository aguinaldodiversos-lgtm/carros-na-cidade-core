"use client";

import type { AdItem } from "../../lib/search/ads-search";
import { AdGrid } from "../ads/AdGrid";

interface SearchResultsListProps {
  items: AdItem[];
}

export function SearchResultsList({ items }: SearchResultsListProps) {
  return <AdGrid items={items} priorityFirstRow />;
}
