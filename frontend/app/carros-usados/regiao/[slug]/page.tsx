import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";

import BuyMarketplacePageClient from "@/components/buy/BuyMarketplacePageClient";
import {
  isRegionalPageCanonicalSelf,
  isRegionalPageEnabled,
  shouldIndexRegionalPage,
} from "@/lib/env/feature-flags";
import { loadRegionalCatalogData } from "@/lib/buy/region-catalog-loader";
import type { SearchParams } from "@/lib/buy/territory-variant";
import { normalizePublicAd, publicCatalogPageCopy } from "@/lib/public-contracts";
import { pickDynamicOgImage } from "@/lib/regions/regional-facets";
import { buildRegionStructuredDataBlocks } from "@/lib/seo/region-structured-data";
import { toAbsoluteUrl } from "@/lib/seo/site";
import { resolveTerritory } from "@/lib/territory/territory-resolver";

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

// Title/description usam o helper único `publicCatalogPageCopy("region")`
// (briefing P2-B 2026-05-25). Preserva o sufixo "| Carros na Cidade" do
// metaTitle canônico mas converge nas frases base. Quando publicCatalogPageCopy
// não tem o que precisamos (ex.: subtítulo) os defaults aqui são fallback.
function buildTitle(cityName: string) {
  const copy = publicCatalogPageCopy("region", { label: cityName });
  return copy.metaTitle ?? `Carros usados em ${cityName} e região | Carros na Cidade`;
}

function buildDescription(cityName: string) {
  const copy = publicCatalogPageCopy("region", { label: cityName });
  return (
    copy.metaDescription ??
    `Veja ofertas de carros usados em ${cityName} e cidades próximas. Compare veículos de lojas e particulares na região.`
  );
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

  const { region, city, stateUf, radiusKm, filters, initialResults: rawResults, initialFacets } =
    catalog;

  // Defesa em profundidade — briefing P2-B 2026-05-25:
  // backend já filtra DIRTY + price>0; `normalizePublicAd` é o último
  // gate antes do card, eliminando: ad sem slug, dirty data residual,
  // e price 0 (substring de "R$ 0" no card).
  const initialResults = {
    ...rawResults,
    data: (rawResults.data || []).filter((ad) => normalizePublicAd(ad) !== null),
  };

  const ads = initialResults.data;
  const totalAds =
    typeof initialResults?.pagination?.total === "number" && initialResults.pagination.total >= 0
      ? initialResults.pagination.total
      : ads.length;

  // JSON-LD do tipo Place/Region — mantido (invisível, sinal SEO local).
  // Briefing 2026-05-23: blocos visuais auxiliares (cidades incluídas,
  // marcas frequentes, "Por que comprar...", "Como funciona o alcance
  // regional") e o FAQ ("Perguntas frequentes sobre a Região...") foram
  // REMOVIDOS por explicarem como o site funciona — informação irrelevante
  // para o visitante. A página termina no catálogo + paginação +
  // PublicFooter azul, sem segundo rodapé.
  //
  // FAQPage JSON-LD também removido junto com a UI: anunciar FAQ schema
  // sem perguntas visíveis na página viola a diretriz do Google de
  // structured data e pode gerar penalidade.
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
  // Mantemos a referência para evitar warning de "unused import"; a flag
  // pode voltar a ser consumida quando a regional ganhar outro bloco
  // condicional gateado por indexabilidade.
  void shouldIndexRegionalPage(totalAds);

  return (
    <>
      {structuredData.map((block, index) => (
        <script
          key={`region-jsonld-${index}`}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(block) }}
        />
      ))}

      <BuyMarketplacePageClient
        initialResults={initialResults}
        initialFacets={initialFacets}
        initialFilters={filters}
        city={city}
        variant="regional"
        stateUf={stateUf}
        regionalEnabled
      />
    </>
  );
}
