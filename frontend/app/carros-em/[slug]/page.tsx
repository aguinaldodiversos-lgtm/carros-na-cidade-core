import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import BuyMarketplacePageClient from "@/components/buy/BuyMarketplacePageClient";
import { NearbyRadiusSection } from "@/components/buy/NearbyRadiusSection";
import { CityAuthoritySection } from "@/components/seo/CityAuthoritySection";
import { CompactCitySeoBlock } from "@/components/seo/CompactCitySeoBlock";
import { FaqBlock } from "@/components/seo/FaqBlock";
import { loadCitySeoOverview } from "@/lib/seo/city-seo-overview";
import {
  buildCityFaqEntries,
  buildCityInventoryFaqEntries,
  buildFaqPageJsonLd,
} from "@/lib/seo/faq";
import { isRegionalPageEnabled } from "@/lib/env/feature-flags";
import { loadCityCatalogData } from "@/lib/buy/city-catalog-loader";
import { loadNearbyRadiusAds } from "@/lib/buy/city-radius-catalog";
import { parseRadiusParam } from "@/lib/buy/regional-radius-config";
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

const loadSeoModel = cache((slug: string) => loadLocalSeoLanding(slug, "em"));

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

  // SEO model carrega em paralelo com o catálogo. Falha aqui chama
  // notFound() internamente, então usamos try/catch no caller.
  const regionalEnabled = isRegionalPageEnabled();

  // Filtro "Distância (km)" = AÇÃO DO USUÁRIO via `?raio=` (25/50/75/100, padrão
  // 50). Controla SÓ o raio do bloco "Próximos"; o catálogo próprio (0 km) não
  // muda. Não afeta canonical/robots (generateMetadata ignora searchParams → a
  // URL com `?raio=` é sempre deduplicada para a cidade limpa). Ver parseRadiusParam.
  const radiusKm = parseRadiusParam(searchParams?.raio);

  const [model, catalog, nearbyResult, overviewResult] = await Promise.all([
    loadSeoModel(slug),
    // applyTerritoryFallback=false: o catálogo PRINCIPAL é o bloco "Em [cidade]"
    // — só anúncios da própria cidade (0 km). A vizinhança (raio) vem no bloco
    // separado <NearbyRadiusSection>, com procedência+distância por card. Isso
    // substitui o antigo <AlsoInRegionBlock> (âncora regional — Onda 2 Fase 2a).
    loadCityCatalogData(slug, searchParams, { applyTerritoryFallback: false }),
    loadNearbyRadiusAds(slug, { radiusKm }),
    // Camada de autoridade local (Fase 3). Falha do backend devolve
    // `unavailable`, NÃO um overview vazio — os módulos somem em vez de
    // afirmar "0 veículos" numa cidade que tem estoque.
    loadCitySeoOverview(slug),
  ]);

  const { ctx, filters, initialResults: rawResults, initialFacets } = catalog;
  const overview = overviewResult.status === "ok" ? overviewResult.overview : null;

  // Defesa em profundidade — briefing P2-B 2026-05-25:
  // backend já filtra DIRTY + price>0; `normalizePublicAd` é o último
  // gate antes do card, eliminando: ad sem slug (impossível link),
  // dirty data residual, e price 0 (substring de "R$ 0" no card).
  const initialResults = {
    ...rawResults,
    data: (rawResults.data || []).filter((ad) => normalizePublicAd(ad) !== null),
  };

  // areaServed (âncora regional — Onda 2 Fase 2a): cidade da página + cidades
  // de COBERTURA dentro do raio. Só NOMES de cidade — nunca bairro (respeita a
  // trava PF). Sinaliza ao Google a geografia atendida sem criar entidade
  // concorrente (a identidade segue na própria cidade, self-canonical).
  const areaServed = [
    { "@type": "City", name: ctx.name, ...(ctx.state ? { addressRegion: ctx.state } : {}) },
    ...nearbyResult.coverageCities.map((c) => ({
      "@type": "City",
      name: c.name,
      ...(c.state ? { addressRegion: c.state } : {}),
    })),
  ];

  // CollectionPage canônico. O `mainEntity` (ItemList) é sobrescrito mais
  // abaixo pelos anúncios realmente renderizados. `areaServed` só entra quando
  // há cobertura real de vizinhança (>1 = base + pelo menos uma cidade no raio).
  const jsonLd: Record<string, unknown> = {
    ...buildLocalSeoJsonLd(model),
    ...(areaServed.length > 1 ? { areaServed } : {}),
  };
  const breadcrumbJsonLd = buildLocalSeoBreadcrumbJsonLd(model);

  // Fase 4.3 (§7) — FAQ útil e específico da cidade. O FAQPage JSON-LD só é
  // emitido porque o FaqBlock abaixo renderiza as MESMAS perguntas (visível).
  //
  // Fase 3: as perguntas de INVENTÁRIO vêm primeiro (são as que só esta
  // cidade responde) e são geradas do mesmo `overview` que alimenta os
  // módulos acima — se o número muda na página, muda no FAQ e no schema
  // junto. Sem overview (backend indisponível ou cidade vazia) restam as
  // perguntas de processo, que continuam verdadeiras.
  const faqEntries = [
    ...(overview
      ? buildCityInventoryFaqEntries({
          cityName: overview.city.name,
          activeAds: overview.inventory.activeAds,
          activeDealers: overview.inventory.activeDealers,
          automaticCount: overview.inventory.automaticCount,
          belowFipeCount: overview.inventory.belowFipeCount,
          brandLabels: overview.brands.map((b) => b.label),
          medianPrice: overview.priceStats.publishable ? overview.priceStats.medianPrice : null,
        })
      : []),
    ...buildCityFaqEntries({ cityName: ctx.name, stateUf: ctx.state }),
  ];
  const faqJsonLd = buildFaqPageJsonLd(faqEntries);

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
        regionalEnabled={regionalEnabled}
        radiusKm={radiusKm}
      />

      {/* Wrapper com pb-20 md:pb-0 — o `BuyPageShell` reserva esse
          espaço internamente porque o `SiteBottomNav` mobile é fixed,
          mas tudo que renderiza DEPOIS do shell precisa replicar o
          mesmo padding para não ficar coberto pela bottom nav. */}
      <div className="bg-cnc-bg pb-20 md:pb-0">
        {/* Bloco "Próximos, até X km" — vizinhança por raio (âncora regional,
            Onda 2 Fase 2a): anúncios de cidades vizinhas ordenados por
            distância, cada card com procedência + "~X km". Marco 0 km = a
            própria cidade (bloco principal acima). Renderiza null quando não há
            vizinhas com estoque. Substitui o antigo AlsoInRegionBlock. */}
        <NearbyRadiusSection result={nearbyResult} cityName={ctx.name} />

        {/* Camada de autoridade local (Fase 3) — Server Component puro:
            mercado, marcas, modelos comerciais, lojas e cidades próximas,
            tudo derivado do inventário ativo DESTA cidade. Ausente quando o
            backend está indisponível (nunca renderiza "0 veículos" por falha)
            e quando a cidade não tem estoque (nada a dizer). */}
        {overview ? <CityAuthoritySection overview={overview} /> : null}

        {/* Bloco SEO mínimo pós-paginação. Sem stats grandes, sem
            "Continue explorando", sem CTAs grandes — o briefing
            2026-05-22 vetou expressamente o "segundo rodapé".
            Renderiza apenas h2 + parágrafo curto + marcas frequentes. */}
        <CompactCitySeoBlock model={model} />

        {/* FAQ visível — perguntas reais e específicas (compra segura, FIPE,
            documentação) com contexto da cidade. Alimenta o FAQPage acima. */}
        <FaqBlock
          title={`Perguntas frequentes sobre comprar carro usado em ${ctx.name}`}
          entries={faqEntries}
        />
      </div>
    </>
  );
}
