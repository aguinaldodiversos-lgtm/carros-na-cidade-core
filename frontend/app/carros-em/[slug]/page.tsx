import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import BuyMarketplacePageClient from "@/components/buy/BuyMarketplacePageClient";
import { isRegionalPageEnabled } from "@/lib/env/feature-flags";
import { loadCityCatalogData } from "@/lib/buy/city-catalog-loader";
import { isValidBrazilianCitySlug, type SearchParams } from "@/lib/buy/territory-variant";
import { normalizePublicAd } from "@/lib/public-contracts";
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
 *      variant="cidade") — espelha as imagens
 *      `atualização_catalogo_desktop.png` e
 *      `atualização_catalogo_celular.png` (briefing 2026-05-22):
 *      breadcrumb + H1 + busca + sidebar/action-bar + cards + bottom nav.
 *   2. Meio (condicional) = bloco "Também na região de [cidade]" quando
 *      a cidade tem poucos anúncios e a flag regional está ativa.
 *   3. Final = `CompactCitySeoBlock` — h2 + parágrafo curto + marcas
 *      frequentes. Sinal SEO preservado, sem virar "segundo rodapé".
 *      Substituiu o `LocalSeoLanding compactBelow` + `TerritorialFooterLinks`
 *      removidos no briefing 2026-05-22.
 *
 * Variantes irmãs (`/carros-baratos-em/`, `/carros-automaticos-em/`)
 * continuam usando a factory `createLocalSeoPage` stand-alone — nesta
 * fase não recebem catálogo porque resolvem intenções específicas
 * (preço/câmbio) e a hierarquia territorial não se aplica.
 */

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

/**
 * Modelo de conteúdo local — usado por `generateMetadata` e pelos JSON-LD.
 *
 * `onServiceFailure: "degrade"` (Fase 5.0B, §6): esta rota tem catálogo
 * transacional próprio, vindo de outro loader. Uma queda do serviço de conteúdo
 * não pode devolver 404 numa cidade com estoque no ar — degrada para
 * `noindex, follow` e o catálogo continua servindo. Cidade que de fato não
 * existe continua 404: o `notFound()` interno é re-lançado.
 */
const loadSeoModel = cache((slug: string) =>
  loadLocalSeoLanding(slug, "em", { onServiceFailure: "degrade" })
);

export async function generateMetadata({
  params,
  searchParams = {},
}: PageProps): Promise<Metadata> {
  const slug = String(params.slug || "").trim();
  // `isValidBrazilianCitySlug` = formato `nome-uf` E UF brasileira real (fonte
  // única em territory-variant). Chamamos notFound() no generateMetadata para
  // que o status 404 seja comitado ANTES do Page rodar — senão o crawler vê
  // HTTP 200 com body not-found (soft-404).
  if (!isValidBrazilianCitySlug(slug)) notFound();
  const model = await loadSeoModel(slug);
  // `searchParams` entra na metadata (auditoria 2026-08-06): antes era
  // ignorado, e por isso TODA variante com filtro/ordenação desta rota
  // respondia `index,follow` com canonical autorreferente. `?raio=25`,
  // `?sort=price_asc` e `?seller_kind=dealer` eram três páginas indexáveis com
  // o mesmo conteúdo. Ver `lib/seo/query-policy.ts`.
  return buildLocalSeoMetadata(model, searchParams);
}

export default async function CarrosEmCidadePage({ params, searchParams = {} }: PageProps) {
  const slug = String(params.slug || "").trim();
  if (!isValidBrazilianCitySlug(slug)) notFound();

  const regionalEnabled = isRegionalPageEnabled();

  // Fase 5.0B — catálogo limpo. Caíram daqui, junto com os blocos que
  // alimentavam, `loadNearbyRadiusAds` e `loadCitySeoOverview`: eram duas
  // chamadas de rede por request servindo conteúdo que a página não renderiza
  // mais. `?raio=` deixa de ser lido porque o único consumidor era o bloco
  // "Próximos".
  //
  // Sobram DUAS cargas: o conteúdo local (metadata + JSON-LD) e o catálogo.
  const [model, catalog] = await Promise.all([
    loadSeoModel(slug),
    // applyTerritoryFallback=false: o catálogo é só a própria cidade (0 km).
    loadCityCatalogData(slug, searchParams, { applyTerritoryFallback: false }),
  ]);

  const { ctx, filters, initialResults: rawResults, initialFacets } = catalog;

  // Defesa em profundidade — briefing P2-B 2026-05-25:
  // backend já filtra DIRTY + price>0; `normalizePublicAd` é o último
  // gate antes do card, eliminando: ad sem slug (impossível link),
  // dirty data residual, e price 0 (substring de "R$ 0" no card).
  const initialResults = {
    ...rawResults,
    data: (rawResults.data || []).filter((ad) => normalizePublicAd(ad) !== null),
  };

  // CollectionPage canônico. O `mainEntity` (ItemList) é sobrescrito mais
  // abaixo pelos anúncios realmente renderizados.
  //
  // `areaServed` saiu junto com o bloco "Próximos" (Fase 5.0B): ele era montado
  // de `nearbyResult.coverageCities`, e declarar cobertura de vizinhança num
  // schema cuja página não mostra mais nenhuma cidade vizinha seria afirmar o
  // que a página não sustenta.
  const jsonLd: Record<string, unknown> = { ...buildLocalSeoJsonLd(model) };
  const breadcrumbJsonLd = buildLocalSeoBreadcrumbJsonLd(model);

  // O FAQPage saiu com o `FaqBlock` (Fase 5.0B, §4). A regra é a que a Fase 4.3
  // escreveu ao criá-lo: o schema só existia porque as MESMAS perguntas eram
  // renderizadas de forma visível. Sem a FAQ na página, manter o `FAQPage` seria
  // schema sem conteúdo correspondente — o que o Google trata como spam
  // estrutural. Os dois saem juntos, sempre.

  // ItemList ÚNICO (Fase 3, Etapa 44).
  //
  // A página emitia DOIS: o `CollectionPage.mainEntity` do
  // `buildLocalSeoJsonLd` (10 itens da amostra) e um ItemList solto (que
  // declarava `numberOfItems: 27` listando 20). Dois ItemList na mesma URL,
  // com contagens diferentes, descrevendo a mesma coleção.
  //
  // Agora existe um só, dentro do CollectionPage — que é o container correto
  // — construído dos anúncios REALMENTE renderizados nesta página. E
  // `numberOfItems` conta os itens listados, não o total do catálogo: dizer
  // 27 numa lista de 20 é declarar sete itens que o schema não contém.
  //
  // Sem fallback territorial: a lista sempre reflete a cidade pedida. Cidade
  // vazia não emite ItemList (uma lista de zero itens não descreve nada).
  const itemListElement = initialResults.data.slice(0, 20).map((ad, index) => ({
    "@type": "ListItem",
    position: index + 1,
    url: toAbsoluteUrl(`/veiculo/${ad.slug || ad.id}`),
    name: ad.title || `${ad.brand ?? ""} ${ad.model ?? ""}`.trim() || "Veículo",
  }));

  if (itemListElement.length > 0) {
    jsonLd.mainEntity = {
      "@type": "ItemList",
      name: `Carros usados em ${ctx.name}`,
      itemListOrder: "https://schema.org/ItemListOrderAscending",
      numberOfItems: itemListElement.length,
      itemListElement,
    };
  }

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
      {/*
        Fase 5.0B — a página termina no catálogo.

        O `BuyMarketplacePageClient` é o ÚLTIMO elemento antes do rodapé. Com
        `variant="cidade"` ele entrega o grid de 4 colunas em telas ≥1600px e o
        paginador visível mesmo com uma página só — que é o que marca o fim da
        listagem agora que não há mais nada entre ela e o `PublicFooter`.

        Saíram daqui: `NearbyRadiusSection`, `CityAuthoritySection`,
        `CompactCitySeoBlock` e `FaqBlock`. Os componentes continuam no projeto e
        intactos; esta rota só deixou de montá-los. A auditoria da Fase 5.0
        mediu o que eles ocupavam: 1704px no desktop (1,9 viewport) e 2509px no
        mobile (3 rolagens), para produzir 5 links internos — links que os
        sitemaps `brands.xml`/`models.xml` já publicam.
      */}
      <BuyMarketplacePageClient
        initialResults={initialResults}
        initialFacets={initialFacets}
        initialFilters={filters}
        city={ctx}
        variant="cidade"
        stateUf={ctx.state}
        regionalEnabled={regionalEnabled}
      />
    </>
  );
}
