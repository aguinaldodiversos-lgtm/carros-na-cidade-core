import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";

import BuyMarketplacePageClient from "@/components/buy/BuyMarketplacePageClient";
import { RegionalAuxiliaryBlocks } from "@/components/territorial/RegionalAuxiliaryBlocks";
import {
  isRegionalPageCanonicalSelf,
  isRegionalPageEnabled,
  shouldIndexRegionalPage,
} from "@/lib/env/feature-flags";
import { loadRegionalCatalogData } from "@/lib/buy/region-catalog-loader";
import type { SearchParams } from "@/lib/buy/territory-variant";
import {
  aggregateBrandsFromAds,
  aggregateCityCountsFromAds,
  pickDynamicOgImage,
} from "@/lib/regions/regional-facets";
import { buildRegionStructuredDataBlocks } from "@/lib/seo/region-structured-data";
import { toAbsoluteUrl } from "@/lib/seo/site";
import { resolveTerritory } from "@/lib/territory/territory-resolver";

import { buildRegionFaqEntries } from "./region-faq-entries";
import { RegionFAQ } from "./RegionFAQ";

/**
 * `force-dynamic` (NÃO mudar para `revalidate`) — bug crítico do Next 14.2:
 *
 * Quando esta rota tinha `export const revalidate = 300`, o Next.js
 * tratava-a como ISR-able. Em rota ISR-able combinada com `notFound()`
 * dentro do server component, o Next.js servia o conteúdo do
 * `not-found.tsx` global mas retornava **status HTTP 200** em vez de 404.
 *
 * Não trocar de volta para `revalidate` sem antes confirmar que o
 * comportamento `notFound() → 404` foi corrigido no Next.
 */
export const dynamic = "force-dynamic";

/**
 * Página Regional pública — `/carros-usados/regiao/[slug]`.
 *
 * Briefing territorial 2026-05-20: a Regional é a principal página de
 * valor e conversão. Reuso integral do padrão visual da Página Cidade
 * (catálogo via `BuyMarketplacePageClient` variant="regional") +
 * blocos auxiliares regionais embaixo (cidades incluídas, marcas
 * frequentes, SEO blocks, FAQ).
 *
 * Estado de rollout (ver `docs/runbooks/regional-page-rollout.md`):
 *  - Fase A: flag `REGIONAL_PAGE_ENABLED=false` → notFound() sem renderizar.
 *  - Fase B: flag `true` em staging → renderiza com `noindex, follow`.
 *  - Fase C: flag `true` em produção, ainda `noindex` até aprovação SEO.
 *  - Fase D: canonical próprio + indexação SEO. Flags
 *           `REGIONAL_PAGE_INDEXABLE` + `REGIONAL_PAGE_CANONICAL_SELF`.
 *
 * O raio usado pelo backend vem de platform_settings (key
 * `regional.radius_km`, default 80, range 10..150) — editável pelo admin
 * em /admin/regional-settings. O frontend NÃO passa radius — o backend
 * lê do DB. Fonte única de verdade.
 */

interface RegionPageProps {
  params: { slug: string };
  searchParams?: SearchParams;
}

const loadCatalog = cache(async (slug: string, searchParams: SearchParams) => {
  return loadRegionalCatalogData(slug, searchParams);
});

const getTerritoryContext = cache(async (slug: string) => {
  return resolveTerritory({ level: "region", regionSlug: slug });
});

function buildTitle(cityName: string) {
  return `Carros usados em ${cityName} e região | Carros na Cidade`;
}

function buildDescription(cityName: string) {
  return `Veja ofertas de carros usados em ${cityName} e cidades próximas. Compare veículos de lojas e particulares na região.`;
}

export async function generateMetadata({
  params,
  searchParams = {},
}: RegionPageProps): Promise<Metadata> {
  // CRÍTICO: chamar notFound() AQUI, não só no Page. Em Next 14.2 App Router
  // com `dynamic = "force-dynamic"`, o ciclo de SSR é:
  //   1. generateMetadata roda para preencher <head>.
  //   2. Next "comita" o status code com base no resultado.
  //   3. Page (default export) roda depois.
  //   4. notFound() chamado no Page troca o BODY mas é TARDE para trocar
  //      o status code — já foi enviado como 200.
  //
  // Sintoma reproduzido em produção: regiao-fake-zz retornava 200 +
  // not-found UI. Fix: chamar notFound() AQUI antes do comit do status.
  if (!isRegionalPageEnabled()) {
    notFound();
  }

  const catalog = await loadCatalog(params.slug, searchParams);
  if (!catalog) {
    notFound();
  }

  const { region, city, radiusKm, initialResults } = catalog;
  const title = buildTitle(region.base.name);
  const description = buildDescription(region.base.name);

  // Canonical é flag-driven (REGIONAL_PAGE_CANONICAL_SELF):
  //   - false (default): aponta para /carros-em/[slug] (cidade-base).
  //     Proteção temporária do runbook §5.
  //   - true: aponta para a própria regional via TerritoryContext.
  const territory = await getTerritoryContext(params.slug);
  const canonical = isRegionalPageCanonicalSelf()
    ? toAbsoluteUrl(territory.canonicalUrl)
    : toAbsoluteUrl(`/carros-em/${encodeURIComponent(region.base.slug)}`);

  // OG image: primeira imagem válida do primeiro anúncio da região.
  // Em qualquer falha cai para `undefined` (OG default do layout).
  const ads = Array.isArray(initialResults?.data) ? initialResults.data : [];
  const ogImage = pickDynamicOgImage(ads) ?? undefined;
  const totalAdsForIndex =
    typeof initialResults?.pagination?.total === "number" && initialResults.pagination.total >= 0
      ? initialResults.pagination.total
      : ads.length;

  // Decisão final de indexabilidade: combina flag global + threshold
  // de inventário mínimo (REGIONAL_INDEX_MIN_ADS). Regional vazia ou
  // com inventário abaixo do threshold sempre vira noindex.
  // `radiusKm` é usado abaixo no JSON-LD; preservar a leitura aqui mesmo
  // que não entre no metadata evita refetch quando o Page roda.
  void radiusKm;
  void city;

  const indexable = shouldIndexRegionalPage(totalAdsForIndex);

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: "website",
      locale: "pt_BR",
      url: canonical,
      siteName: "Carros na Cidade",
      title,
      description,
      images: ogImage ? [{ url: ogImage, width: 1200, height: 630, alt: title }] : undefined,
    },
    twitter: {
      card: ogImage ? "summary_large_image" : "summary",
      title,
      description,
      images: ogImage ? [ogImage] : undefined,
    },
    robots: {
      index: indexable,
      follow: true,
      googleBot: { index: indexable, follow: true },
    },
  };
}

function buildFaqJsonLd(args: {
  cityName: string;
  citySlug: string;
  stateUF: string;
  members: Parameters<typeof buildRegionFaqEntries>[0]["members"];
  radiusKm: number;
}) {
  const entries = buildRegionFaqEntries({
    cityName: args.cityName,
    citySlug: args.citySlug,
    stateUF: args.stateUF,
    members: args.members,
    radiusKm: args.radiusKm,
  });

  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: entries.map((entry) => ({
      "@type": "Question",
      name: entry.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: entry.answer,
      },
    })),
  };
}

export default async function RegionPage({ params, searchParams = {} }: RegionPageProps) {
  // Dupla proteção: generateMetadata acima JÁ chama notFound() nos
  // mesmos cenários. Os checks aqui são defesa em profundidade.
  if (!isRegionalPageEnabled()) {
    notFound();
  }

  const catalog = await loadCatalog(params.slug, searchParams);
  if (!catalog) {
    notFound();
  }

  const { region, city, stateUf, radiusKm, filters, initialResults, initialFacets } = catalog;

  const ads = initialResults.data;
  const totalAds =
    typeof initialResults?.pagination?.total === "number" && initialResults.pagination.total >= 0
      ? initialResults.pagination.total
      : ads.length;

  // Facets locais sobre a amostra atual — alimentam os blocos auxiliares
  // (cidades + marcas) sem chamar facets do backend de novo.
  const topBrands = aggregateBrandsFromAds(ads);
  const cityCounts = aggregateCityCountsFromAds(ads, region.base, region.members);

  const structuredData = buildRegionStructuredDataBlocks({
    base: region.base,
    members: region.members,
    totalAds,
    radiusKm,
    sampleAds: ads.slice(0, 12).map((ad) => ({
      slug: ad.slug,
      title: ad.title,
      brand: ad.brand,
      model: ad.model,
      year: ad.year,
    })),
  });

  // FAQ JSON-LD só faz sentido quando a página é indexável — sem isso
  // estaríamos alimentando rich snippets do Google a partir de uma URL
  // marcada como noindex (desperdício).
  const indexable = shouldIndexRegionalPage(totalAds);
  const faqJsonLd = indexable
    ? buildFaqJsonLd({
        cityName: region.base.name,
        citySlug: region.base.slug,
        stateUF: stateUf,
        members: region.members,
        radiusKm,
      })
    : null;

  return (
    <>
      {structuredData.map((block, index) => (
        <script
          key={`region-jsonld-${index}`}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(block) }}
        />
      ))}
      {faqJsonLd ? (
        <script
          type="application/ld+json"
          data-testid="regional-faq-jsonld"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
        />
      ) : null}

      <BuyMarketplacePageClient
        initialResults={initialResults}
        initialFacets={initialFacets}
        initialFilters={filters}
        city={city}
        variant="regional"
        stateUf={stateUf}
        regionalEnabled
      />

      {/* Wrapper com pb-20 md:pb-0 — o `BuyPageShell` reserva esse espaço
          internamente porque o `SiteBottomNav` mobile é fixed, mas tudo
          que renderiza DEPOIS do shell precisa replicar o mesmo padding
          para não ficar coberto pela bottom nav. */}
      <div className="bg-cnc-bg pb-20 md:pb-0">
        {/* NearbyRegionButton agora é injetado pelo BuyMarketplacePageClient
            no topo do catálogo — visível imediatamente, sem precisar
            rolar até os blocos auxiliares. */}
        <RegionalAuxiliaryBlocks
          base={region.base}
          members={region.members}
          radiusKm={radiusKm}
          topBrands={topBrands}
          cityCounts={cityCounts}
        />

        <div className="mx-auto w-full max-w-7xl px-3 pb-8 sm:px-6 lg:px-8">
          <RegionFAQ
            cityName={region.base.name}
            citySlug={region.base.slug}
            stateUF={stateUf}
            members={region.members}
            radiusKm={radiusKm}
          />
        </div>
      </div>
    </>
  );
}
