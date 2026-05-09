import type { Metadata } from "next";
import Link from "next/link";
import { cache } from "react";
import { TerritorialResultsPageClient } from "@/components/search/TerritorialResultsPageClient";
import { TerritorialSeoJsonLd } from "@/components/seo/TerritorialSeoJsonLd";
import { isRegionalPageEnabled } from "@/lib/env/feature-flags";
import { fetchCityTerritorialPage } from "@/lib/search/territorial-public";
import { buildTerritorialMetadata } from "@/lib/seo/territorial-seo";

interface CityPageProps {
  params: { slug: string };
  searchParams: Record<string, string | string[] | undefined>;
}

const getCityPageData = cache(
  async (slug: string, searchParams: Record<string, string | string[] | undefined>) =>
    fetchCityTerritorialPage(slug, searchParams)
);

/**
 * Política de canonical de transição (Fase 1 da auditoria territorial em
 * docs/runbooks/territorial-canonical-audit.md): /cidade/[slug] continua
 * acessível mas canonicaliza para /carros-em/[slug], a canônica
 * intermediária da intenção "comprar carros na cidade". Sem 301 nesta
 * etapa — apenas <link rel="canonical"> e JSON-LD url para consolidar
 * autoridade na URL canônica. /carros-em é INTERMEDIÁRIA, não definitiva
 * (futuro: possível migração para /carros-usados/cidade/[slug]).
 */
function transitionCanonicalPath(slug: string): string {
  return `/carros-em/${encodeURIComponent(slug)}`;
}

export async function generateMetadata({ params, searchParams }: CityPageProps): Promise<Metadata> {
  const data = await getCityPageData(params.slug, searchParams);
  return buildTerritorialMetadata(data, "city", {
    canonicalPathOverride: transitionCanonicalPath(params.slug),
  });
}

/**
 * Heurística para extrair o nome legível da cidade do payload territorial.
 * Cobre os shapes comuns sem importar tipos privados — o link é cosmético
 * e a falta de nome não pode quebrar a página: cai no slug formatado.
 */
function getCityDisplayName(
  data: unknown,
  slug: string
): string {
  const obj = (data ?? {}) as Record<string, unknown>;
  const city = (obj.city ?? obj.location ?? {}) as Record<string, unknown>;
  const name = (city as { name?: unknown }).name;
  if (typeof name === "string" && name.trim()) return name;
  // Fallback: capitaliza o slug ("atibaia-sp" → "Atibaia Sp"). Cosmético.
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default async function CityPage({ params, searchParams }: CityPageProps) {
  const initialData = await getCityPageData(params.slug, searchParams);
  const canonicalPathOverride = transitionCanonicalPath(params.slug);
  const regionalEnabled = isRegionalPageEnabled();
  const cityName = getCityDisplayName(initialData, params.slug);

  return (
    <>
      <TerritorialSeoJsonLd
        data={initialData}
        mode="city"
        canonicalPathOverride={canonicalPathOverride}
      />
      <TerritorialResultsPageClient mode="city" slug={params.slug} initialData={initialData} />
      {regionalEnabled && (
        <div className="mx-auto max-w-[1200px] px-4 py-6">
          <Link
            href={`/carros-usados/regiao/${encodeURIComponent(params.slug)}`}
            className="inline-flex items-center gap-2 rounded-lg border border-cnc-line bg-white px-4 py-2 text-sm font-semibold text-cnc-text hover:border-primary hover:text-primary transition-colors"
            aria-label={`Ver carros na região de ${cityName}`}
          >
            Ver carros na região de {cityName}
          </Link>
        </div>
      )}
    </>
  );
}
