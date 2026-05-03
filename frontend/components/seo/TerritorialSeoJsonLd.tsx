import { buildTerritorialJsonLd } from "@/lib/seo/territorial-seo";
import type { TerritorialPagePayload } from "@/lib/search/territorial-public";

export type TerritorialSeoMode = "city" | "brand" | "model" | "opportunities" | "below_fipe";

export interface TerritorialSeoJsonLdProps {
  data: TerritorialPagePayload;
  mode?: TerritorialSeoMode;
  /**
   * Path relativo para canonical no JSON-LD. Se omitido, usa
   * `data.seo.canonicalPath`. Necessário em rotas de transição
   * (ex.: /cidade/[slug] → /comprar/cidade/[slug]).
   */
  canonicalPathOverride?: string;
}

export function TerritorialSeoJsonLd({
  data,
  mode = "city",
  canonicalPathOverride,
}: TerritorialSeoJsonLdProps) {
  if (!data) return null;

  const jsonLd = buildTerritorialJsonLd(data, mode, { canonicalPathOverride });

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}

export default TerritorialSeoJsonLd;
