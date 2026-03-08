// frontend/components/seo/TerritorialSeoJsonLd.tsx

import type { TerritorialPagePayload } from "../../lib/search/territorial-public";
import { buildTerritorialJsonLd } from "../../lib/seo/territorial-seo";

type TerritorialSeoMode =
  | "city"
  | "brand"
  | "model"
  | "opportunities"
  | "below_fipe";

interface TerritorialSeoJsonLdProps {
  data: TerritorialPagePayload;
  mode: TerritorialSeoMode;
}

export function TerritorialSeoJsonLd({
  data,
  mode,
}: TerritorialSeoJsonLdProps) {
  const jsonLd = buildTerritorialJsonLd(data, mode);

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(jsonLd),
      }}
    />
  );
}
