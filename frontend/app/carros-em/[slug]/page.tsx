import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import BuyMarketplacePageClient from "@/components/buy/BuyMarketplacePageClient";
import { LocalSeoLanding } from "@/components/seo/LocalSeoLanding";
import { AlsoInRegionBlock } from "@/components/territorial/AlsoInRegionBlock";
import { NearbyRegionButton } from "@/components/territorial/NearbyRegionButton";
import { TerritorialFooterLinks } from "@/components/territorial/TerritorialFooterLinks";
import { isRegionalPageEnabled } from "@/lib/env/feature-flags";
import { loadCityCatalogData } from "@/lib/buy/city-catalog-loader";
import {
  isValidCitySlug,
  hasRestrictiveFilters,
  normalizeUf,
  type SearchParams,
} from "@/lib/buy/territory-variant";
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

/**
 * `force-dynamic` (NÃO mudar para `revalidate`) — bug Next 14.2:
 * ISR + `notFound()` em server component retorna HTTP 200 com body
 * not-found global (soft-404). Reproduzido em runtime na auditoria
 * 2026-05-21: `/carros-em/cidade-falsa-xx` retornava 200.
 *
 * `dynamic = "force-dynamic"` força runtime por request e preserva
 * o status 404 real quando `notFound()` é chamado. Sem perda material
 * de performance: o backend territorial-public tem cache próprio e
 * `fetchAdsSearch` tem `revalidate: 60` embutido.
 *
 * Mantemos `LOCAL_SEO_REVALIDATE` no import para compatibilidade com
 * `createLocalSeoPage` factory (usado por variantes
 * /carros-baratos-em/, /carros-automaticos-em/) que ainda dependem
 * dessa constante.
 */
export const dynamic = "force-dynamic";
void LOCAL_SEO_REVALIDATE; // import preservado por compat (ver doc acima)

const loadSeoModel = cache((slug: string) => loadLocalSeoLanding(slug, "em"));

/**
 * Valida que a UF embutida no slug é uma UF brasileira REAL (não só
 * 2 letras). Sem isso, slugs "cidade-falsa-xx" passariam o
 * `isValidCitySlug` (que valida só formato regex `^[a-z]{2}$`),
 * cairiam no fetch, retornariam vazio e produziriam soft-404.
 */
function slugHasValidBrazilianUf(slug: string): boolean {
  const parts = slug.trim().toLowerCase().split("-").filter(Boolean);
  if (parts.length < 2) return false;
  return normalizeUf(parts[parts.length - 1]) !== null;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const slug = String(params.slug || "").trim();
  if (!isValidCitySlug(slug) || !slugHasValidBrazilianUf(slug)) {
    // Chamamos notFound() no generateMetadata para que o status code
    // 404 seja comitado ANTES do Page rodar. Sem isso, o status já é
    // 200 quando o Page chama notFound() — body troca para not-found
    // mas o crawler vê HTTP 200 (soft-404).
    notFound();
  }
  const model = await loadSeoModel(slug);
  return buildLocalSeoMetadata(model);
}

export default async function CarrosEmCidadePage({ params, searchParams = {} }: PageProps) {
  const slug = String(params.slug || "").trim();
  if (!isValidCitySlug(slug) || !slugHasValidBrazilianUf(slug)) notFound();

  // SEO model carrega em paralelo com o catálogo. Falha aqui chama
  // notFound() internamente, então usamos try/catch no caller.
  const regionalEnabled = isRegionalPageEnabled();

  const [model, catalog] = await Promise.all([
    loadSeoModel(slug),
    // applyTerritoryFallback=false: a Página Cidade canônica é "prova
    // local" — listagem principal nunca mistura anúncios de cidades
    // vizinhas. Quando o estoque é baixo/zero, o <AlsoInRegionBlock>
    // oferece a saída regional num bloco visualmente separado.
    loadCityCatalogData(slug, searchParams, { applyTerritoryFallback: false }),
  ]);

  const { ctx, filters, initialResults, initialFacets } = catalog;

  const totalAds = initialResults.pagination.total || 0;
  const noFilters = !hasRestrictiveFilters(filters);
  const showAlsoInRegion = regionalEnabled && noFilters && totalAds < FEW_ADS_THRESHOLD;

  // BreadcrumbList canônico — usa o builder existente do LocalSeoLanding
  // (mesma estrutura usada na variant SEO stand-alone). ItemList só é
  // emitido fora de modo fallback territorial: o schema descreveria
  // anúncios de uma cidade vizinha sob a URL da cidade pedida e poluiria
  // o sinal de conteúdo local.
  const jsonLd = buildLocalSeoJsonLd(model);
  const breadcrumbJsonLd = buildLocalSeoBreadcrumbJsonLd(model);

  // Sem fallback territorial nesta rota: ItemList sempre reflete a
  // cidade pedida. Quando não há anúncios, emitimos ItemList vazio mas
  // numberOfItems=0 é semântico para o Google ("essa cidade existe,
  // está vazia agora").
  const itemListJsonLd = {
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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
      />

      <BuyMarketplacePageClient
        initialResults={initialResults}
        initialFacets={initialFacets}
        initialFilters={filters}
        city={ctx}
        variant="cidade"
        stateUf={ctx.state}
        regionalEnabled={regionalEnabled}
      />

      {/* Wrapper com pb-20 md:pb-0 — o `BuyPageShell` reserva esse
          espaço internamente porque o `SiteBottomNav` mobile é fixed,
          mas tudo que renderiza DEPOIS do shell precisa replicar o
          mesmo padding para não ficar coberto pela bottom nav. */}
      <div className="bg-cnc-bg pb-20 md:pb-0">
        {/* Briefing 2026-05-21: toda página pública de catálogo precisa
            de um atalho de geolocalização — visitante pode cair pelo
            Google em cidade errada. CTA leva direto para a Regional
            mais próxima via /carros-usados/regiao/[slug-detectado]. */}
        <NearbyRegionButton
          regionalEnabled={regionalEnabled}
          context="cidade"
          variant="compact"
          stateUf={ctx.state}
        />

        {showAlsoInRegion ? (
          <AlsoInRegionBlock slug={slug} cityName={ctx.name} cityAdsTotal={totalAds} />
        ) : null}

        <LocalSeoLanding model={model} compactBelow />

        <TerritorialFooterLinks slug={model.slug} cityName={model.cityName} state={model.state} />
      </div>
    </>
  );
}
