import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import BuyMarketplacePageClient from "@/components/buy/BuyMarketplacePageClient";
import { BelowFipeCatalogSeo } from "@/components/seo/BelowFipeCatalogSeo";
import { FaqBlock } from "@/components/seo/FaqBlock";
import { isRegionalPageEnabled } from "@/lib/env/feature-flags";
import { normalizePublicAd } from "@/lib/public-contracts";
import { loadCityCatalogData } from "@/lib/buy/city-catalog-loader";
import { isValidBrazilianCitySlug, type SearchParams } from "@/lib/buy/territory-variant";
import { buildBelowFipeFaqEntries, buildFaqPageJsonLd } from "@/lib/seo/faq";
import { loadLocalSeoLanding } from "@/lib/seo/local-seo-data";
import {
  buildBaratosBreadcrumbJsonLd,
  buildLocalSeoJsonLd,
  buildLocalSeoMetadata,
} from "@/lib/seo/local-seo-metadata";
import { toAbsoluteUrl } from "@/lib/seo/site";
import { enforceBelowFipeCatalogFilters } from "@/lib/seo/below-fipe-catalog-filters";

/**
 * A página é canônica de si mesma e continua sendo resolvida por requisição.
 * NÃO usar ISR: Next 14 pode responder 200 para cidades inexistentes (soft-404).
 */
export const dynamic = "force-dynamic";

type PageProps = {
  params: { slug: string };
  searchParams?: SearchParams;
};

const loadModel = cache((slug: string) => loadLocalSeoLanding(slug, "baratos"));

export async function generateMetadata({
  params,
  searchParams = {},
}: PageProps): Promise<Metadata> {
  if (!isValidBrazilianCitySlug(params.slug)) notFound();
  return buildLocalSeoMetadata(await loadModel(params.slug), searchParams);
}

/**
 * A mesma vitrine premium de /carros-em/[slug], mas com uma restrição de
 * produto permanente e escopo local EXATO. O filtro não depende da query,
 * portanto ?below_fipe=false ou ?raio=25 não podem ampliar este recorte.
 * Metadata, canonical, H1 e FAQ continuam específicos de "carros baratos".
 */
export default async function CarrosBaratosCidadePage({
  params,
  searchParams = {},
}: PageProps) {
  const slug = String(params.slug || "").trim();
  if (!isValidBrazilianCitySlug(slug)) notFound();

  const [model, catalog] = await Promise.all([
    loadModel(slug),
    loadCityCatalogData(
      slug,
      enforceBelowFipeCatalogFilters(searchParams),
      { applyTerritoryFallback: false }
    ),
  ]);

  const { ctx, filters, initialResults: rawResults, initialFacets } = catalog;
  const initialResults = {
    ...rawResults,
    data: (rawResults.data || []).filter((ad) => normalizePublicAd(ad) !== null),
  };

  // O ItemList descreve SOMENTE veículos realmente mostrados nesta URL.
  // Se a busca estiver vazia, não declarar uma lista de itens fantasmas.
  const jsonLd: Record<string, unknown> = { ...buildLocalSeoJsonLd(model) };
  const itemListElement = initialResults.data.slice(0, 20).map((ad, index) => ({
    "@type": "ListItem",
    position: index + 1,
    url: toAbsoluteUrl(`/veiculo/${ad.slug || ad.id}`),
    name: ad.title || `${ad.brand ?? ""} ${ad.model ?? ""}`.trim() || "Veículo",
  }));

  if (itemListElement.length) {
    jsonLd.mainEntity = {
      "@type": "ItemList",
      name: `Carros abaixo da FIPE em ${ctx.name}`,
      numberOfItems: itemListElement.length,
      itemListElement,
    };
  } else {
    delete jsonLd.mainEntity;
  }

  const breadcrumbJsonLd = buildBaratosBreadcrumbJsonLd(model);
  const faqEntries = buildBelowFipeFaqEntries({ cityName: model.cityName });
  const faqJsonLd = faqEntries.length ? buildFaqPageJsonLd(faqEntries) : null;

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      {breadcrumbJsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
        />
      ) : null}
      {faqJsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
        />
      ) : null}

      <BuyMarketplacePageClient
        initialResults={initialResults}
        initialFacets={initialFacets}
        initialFilters={filters}
        city={ctx}
        variant="cidade"
        stateUf={ctx.state}
        belowFipeLanding
        regionalEnabled={isRegionalPageEnabled()}
      />

      <BelowFipeCatalogSeo model={model} />
      {faqEntries.length ? (
        <FaqBlock
          title={`Perguntas frequentes sobre carros abaixo da FIPE em ${model.cityName}`}
          entries={faqEntries}
        />
      ) : null}
    </>
  );
}
