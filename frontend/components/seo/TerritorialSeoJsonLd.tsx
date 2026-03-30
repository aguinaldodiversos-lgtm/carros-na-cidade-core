import { buildTerritorialJsonLd } from "@/lib/seo/territorial-seo";
import type { TerritorialPagePayload } from "@/lib/search/territorial-public";

export type TerritorialSeoMode = "city" | "brand" | "model" | "opportunities" | "below_fipe";

export interface TerritorialSeoJsonLdProps {
  data: TerritorialPagePayload;
  mode?: TerritorialSeoMode;
}

export function TerritorialSeoJsonLd({ data, mode = "city" }: TerritorialSeoJsonLdProps) {
  if (!data) return null;

  const jsonLd = buildTerritorialJsonLd(data, mode);

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}

export default TerritorialSeoJsonLd;
