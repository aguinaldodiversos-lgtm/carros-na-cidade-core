import { buildTerritorialJsonLd } from "@/lib/seo/territorial-seo";
import type { TerritorialPagePayload } from "@/lib/search/territorial-public";

export type TerritorialSeoJsonLdProps = {
  data: TerritorialPagePayload;
  mode?: "city" | "brand" | "model" | "opportunities" | "below_fipe";
};

export function TerritorialSeoJsonLd({
  data,
  mode = "city",
}: TerritorialSeoJsonLdProps) {
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
