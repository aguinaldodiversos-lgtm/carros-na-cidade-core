import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import BuyMarketplacePageClient from "@/components/buy/BuyMarketplacePageClient";
import { LocalSeoLanding } from "@/components/seo/LocalSeoLanding";
import { AlsoInRegionBlock } from "@/components/territorial/AlsoInRegionBlock";
import { TerritorialFooterLinks } from "@/components/territorial/TerritorialFooterLinks";
import { isRegionalPageEnabled } from "@/lib/env/feature-flags";
import { loadCityCatalogData } from "@/lib/buy/city-catalog-loader";
import { isValidCitySlug, hasRestrictiveFilters, type SearchParams } from "@/lib/buy/territory-variant";
import {
  buildLocalSeoBreadcrumbJsonLd,
  buildLocalSeoJsonLd,
  buildLocalSeoMetadata,
} from "@/lib/seo/local-seo-metadata";
import { loadLocalSeoLanding } from "@/lib/seo/local-seo-data";
import { LOCAL_SEO_REVALIDATE } from "@/lib/seo/local-seo-route";
import { toAbsoluteUrl } from "@/lib/seo/site";

/**
 * `/carros-em/[slug]` é a URL CANÔNICA da intenção "comprar carros em
 * [cidade]". Briefing territorial 2026-05-20 transformou esta rota num
 * catálogo híbrido:
 *
 *   1. Topo = catálogo transacional (`BuyMarketplacePageClient` com
 *      variant="cidade") — espelha a imagem `atualização-catalogo.png`:
 *      breadcrumb + H1 + subtítulo + CTA "Veículos na região de [cidade]"
 *      + busca + chips + cards horizontais + bottom nav.
 *   2. Meio (condicional) = bloco "Também na região de [cidade]" quando
 *      a cidade tem poucos anúncios e a flag regional está ativa.
 *   3. Final = `LocalSeoLanding` em modo `compactBelow` — preserva o
 *      conteúdo SEO textual (parágrafos, top brands, links irmãos) sem
 *      duplicar hero/H1 que o catálogo já renderiza.
 *   4. Footer = `TerritorialFooterLinks` (CTA regional + estado).
 *
 * Variantes irmãs (`/carros-baratos-em/`, `/carros-automaticos-em/`)
 * continuam usando a factory `createLocalSeoPage` stand-alone — nesta
 * fase não recebem catálogo porque resolvem intenções específicas
 * (preço/câmbio) e a hierarquia territorial não se aplica.
 */

const FEW_ADS_THRESHOLD = 5;

interface PageProps {
  params: { slug: string };
  searchParams?: SearchParams;
}

export const revalidate = LOCAL_SEO_REVALIDATE;

const loadSeoModel = cache((slug: string) => loadLocalSeoLanding(slug, "em"));

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const model = await loadSeoModel(params.slug);
  return buildLocalSeoMetadata(model);
}

export default async function CarrosEmCidadePage({
  params,
  searchParams = {},
}: PageProps) {
  const slug = String(params.slug || "").trim();
  if (!isValidCitySlug(slug)) notFound();

  // SEO model carrega em paralelo com o catálogo. Falha aqui chama
  // notFound() internamente, então usamos try/catch no caller.
  const regionalEnabled = isRegionalPageEnabled();

  const [model, catalog] = await Promise.all([
    loadSeoModel(slug),
    loadCityCatalogData(slug, searchParams),
  ]);

  const { ctx, filters, initialResults, initialFacets, fallbackTerritory } = catalog;

  const totalAds = initialResults.pagination.total || 0;
  const noFilters = !hasRestrictiveFilters(filters);
  const showAlsoInRegion =
    regionalEnabled && noFilters && !fallbackTerritory && totalAds < FEW_ADS_THRESHOLD;

  // BreadcrumbList canônico — usa o builder existente do LocalSeoLanding
  // (mesma estrutura usada na variant SEO stand-alone). ItemList só é
  // emitido fora de modo fallback territorial: o schema descreveria
  // anúncios de uma cidade vizinha sob a URL da cidade pedida e poluiria
  // o sinal de conteúdo local.
  const jsonLd = buildLocalSeoJsonLd(model);
  const breadcrumbJsonLd = buildLocalSeoBreadcrumbJsonLd(model);

  const itemListJsonLd = fallbackTerritory
    ? null
    : {
        "@context": "https://schema.org",
        "@type": "ItemList",
        name: `Carros usados em ${ctx.name}`,
        numberOfItems: totalAds,
        itemListElement: initialResults.data.slice(0, 20).map((ad, index) => ({
          "@type": "ListItem",
          position: index + 1,
          url: toAbsoluteUrl(`/veiculo/${ad.slug || ad.id}`),
          name: ad.title || `${ad.brand ?? ""} ${ad.model ?? ""}`.trim() || "Veículo",
        })),
      };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {breadcrumbJsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
        />
      ) : null}
      {itemListJsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
        />
      ) : null}

      <BuyMarketplacePageClient
        initialResults={initialResults}
        initialFacets={initialFacets}
        initialFilters={filters}
        city={ctx}
        variant="cidade"
        stateUf={ctx.state}
        fallbackTerritory={fallbackTerritory}
        regionalEnabled={regionalEnabled}
      />

      {/* Wrapper com pb-20 md:pb-0 — o `BuyPageShell` reserva esse
          espaço internamente porque o `SiteBottomNav` mobile é fixed,
          mas tudo que renderiza DEPOIS do shell precisa replicar o
          mesmo padding para não ficar coberto pela bottom nav. */}
      <div className="bg-cnc-bg pb-20 md:pb-0">
        {showAlsoInRegion ? (
          <AlsoInRegionBlock
            slug={slug}
            cityName={ctx.name}
            cityAdsTotal={totalAds}
          />
        ) : null}

        <LocalSeoLanding model={model} compactBelow />

        <TerritorialFooterLinks
          slug={model.slug}
          cityName={model.cityName}
          state={model.state}
        />
      </div>
    </>
  );
}
