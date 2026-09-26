import type { Metadata } from "next";

import { BuyPageShell } from "@/components/buy/BuyPageShell";
import { ModelLandingCatalog } from "@/components/buy/ModelLandingCatalog";
import { ModelLandingEmpty } from "@/components/buy/ModelLandingEmpty";
import { ModelLandingExplore } from "@/components/buy/ModelLandingExplore";
import { ModelLandingHeader } from "@/components/buy/ModelLandingHeader";
import { ModelLandingInventory } from "@/components/buy/ModelLandingInventory";
import BreadcrumbJsonLd from "@/components/seo/BreadcrumbJsonLd";
import { TerritorialSeoJsonLd } from "@/components/seo/TerritorialSeoJsonLd";
import { SiteBottomNav } from "@/components/shell/SiteBottomNav";
import {
  buildModelLandingBreadcrumbs,
  buildModelLandingCopy,
  buildModelLandingExploreLinks,
  buildPopularBrandLinks,
  countActiveUserFilters,
  hasRegionalResults,
  modelLandingPath,
  summarizeModelListing,
  type ModelLandingSearchParams,
} from "@/lib/buy/model-landing";
import { loadModelLanding, type ModelLandingData } from "@/lib/buy/model-landing-loader";
import { isRegionalPageEnabled } from "@/lib/env/feature-flags";
import type { TerritorialPagePayload } from "@/lib/search/territorial-public";
import { getCanonicalCityPath } from "@/lib/seo/canonical-city-path";
import { getSeoThreshold } from "@/lib/seo/sitemap-min-ads";
import { buildTerritorialMetadata } from "@/lib/seo/territorial-seo";

/**
 * Landing SEO `/cidade/[slug]/marca/[brand]/modelo/[model]` — "Onix em
 * Atibaia", "HB20 em Bragança Paulista". UM template para qualquer combinação
 * válida: nenhuma cidade, marca ou modelo aparece escrito neste arquivo.
 *
 *   identidade + SEO   backend territorial (canonical limpa; indexa quando o
 *                      estoque PRÓPRIO da cidade atinge o limiar — regra
 *                      existente, preservada)
 *   anúncios           `/api/ads/search`, o mesmo do catálogo: a cidade vai
 *                      como origem e o Search Policy Engine decide quais
 *                      cidades entram. A página não calcula território.
 *   UI                 blocos do catálogo (sidebar, card, grid, paginação)
 *                      + topo compacto e bloco de estoque depois da listagem.
 *
 * O 404 real (cidade inexistente/sem estoque, slug inválido) é do middleware.
 * Combinação sem anúncio responde 200 + noindex, como sempre respondeu.
 */

interface CityModelPageProps {
  params: { slug: string; brand: string; model: string };
  searchParams: ModelLandingSearchParams;
}

/**
 * Payload para metadata e JSON-LD: o SEO do backend com os anúncios que a
 * página REALMENTE renderiza (o `ItemList` e a imagem OG saem deles), e a copy
 * de fallback quando o backend não mandou `seo`.
 */
function toSeoPayload(data: ModelLandingData): TerritorialPagePayload {
  const { identity, territorial, results } = data;
  const copy = buildModelLandingCopy(identity);
  const seo = territorial.seo ?? {};

  return {
    ...territorial,
    brand: { name: identity.brandName, slug: identity.brandSlug },
    model: { name: identity.modelName, slug: identity.modelSlug },
    seo: {
      ...seo,
      title: seo.title || copy.fallbackTitle,
      description: seo.description || copy.fallbackDescription,
      canonicalPath: seo.canonicalPath || modelLandingPath(identity),
    },
    sections: { ...territorial.sections, ads: results.data },
  };
}

export async function generateMetadata({
  params,
  searchParams,
}: CityModelPageProps): Promise<Metadata> {
  const data = await loadModelLanding(params.slug, params.brand, params.model, searchParams);

  // Indexação: a regra do backend (estoque próprio ≥ limiar) + URL sem filtro,
  // ambas dentro de `buildTerritorialMetadata`. O reforço daqui é defensivo:
  // uma listagem vazia nunca indexa, qualquer que seja o motivo.
  return buildTerritorialMetadata(toSeoPayload(data), "model", {
    searchParams,
    forceNoindex: data.results.data.length === 0,
  });
}

export default async function CityModelPage({ params, searchParams }: CityModelPageProps) {
  const data = await loadModelLanding(params.slug, params.brand, params.model, searchParams);
  const { identity, filters, results, facets } = data;

  const copy = buildModelLandingCopy(identity);
  const summary = summarizeModelListing(results);
  const regional = hasRegionalResults(results);
  const breadcrumbs = buildModelLandingBreadcrumbs(identity);
  const exploreLinks = buildModelLandingExploreLinks(identity);
  const popularBrandLinks = buildPopularBrandLinks(
    facets.brands,
    identity.citySlug,
    getSeoThreshold("brand")
  );
  const vehicle = `${identity.brandName} ${identity.modelName}`;
  const brandPath = `/cidade/${identity.citySlug}/marca/${identity.brandSlug}`;
  const city = {
    name: identity.cityName,
    state: identity.cityState,
    slug: identity.citySlug,
    label: identity.cityState ? `${identity.cityName} (${identity.cityState})` : identity.cityName,
  };

  return (
    <>
      <TerritorialSeoJsonLd data={toSeoPayload(data)} mode="model" />
      <BreadcrumbJsonLd
        items={breadcrumbs.map((item) => ({ name: item.label, href: item.href }))}
      />

      <BuyPageShell mobileFilterTrigger={<SiteBottomNav />}>
        <ModelLandingHeader
          copy={copy}
          breadcrumbs={breadcrumbs}
          summary={summary}
          regional={regional}
          cityName={identity.cityName}
        />

        <ModelLandingCatalog
          city={city}
          filters={filters}
          results={results}
          facets={facets}
          popularBrandLinks={popularBrandLinks}
          regionalEnabled={isRegionalPageEnabled()}
          searchPlaceholder="Buscar nos resultados"
          sidebarFooter={
            <ModelLandingExplore
              cityName={identity.cityName}
              links={exploreLinks}
              headingId="model-landing-explore-sidebar"
            />
          }
          emptyState={
            <ModelLandingEmpty
              vehicle={vehicle}
              cityName={identity.cityName}
              hasFilters={countActiveUserFilters(filters) > 0}
              clearHref={modelLandingPath(identity)}
              brandLink={{
                label: `Ver ${identity.brandName} em ${identity.cityName}`,
                href: brandPath,
              }}
              cityLink={{
                label: `Todos os carros em ${identity.cityName}`,
                href: getCanonicalCityPath(identity.citySlug) ?? `/cidade/${identity.citySlug}`,
              }}
            />
          }
        >
          {summary ? (
            <ModelLandingInventory
              heading={copy.inventoryHeading}
              summary={summary}
              regional={regional}
            />
          ) : null}
          <ModelLandingExplore
            cityName={identity.cityName}
            links={exploreLinks}
            headingId="model-landing-explore-content"
            className="mt-6 lg:hidden"
          />
        </ModelLandingCatalog>
      </BuyPageShell>
    </>
  );
}
