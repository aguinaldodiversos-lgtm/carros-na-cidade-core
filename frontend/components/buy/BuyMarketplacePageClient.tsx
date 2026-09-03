"use client";

import { useCallback, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { BuyPageShell } from "@/components/buy/BuyPageShell";
import { CatalogActionBar } from "@/components/buy/CatalogActionBar";
import { CatalogPageHeader } from "@/components/buy/CatalogPageHeader";
import { CatalogPagination } from "@/components/buy/CatalogPagination";
import { CatalogResultsHeader } from "@/components/buy/CatalogResultsHeader";
import { FilterSidebar } from "@/components/buy/FilterSidebar";
import { GeoToCityRedirect } from "@/components/buy/GeoToCityRedirect";
import { VehicleGrid } from "@/components/buy/VehicleGrid";
import { AppliedFilterChips } from "@/components/search/AppliedFilterChips";
import { SiteBottomNav } from "@/components/shell/SiteBottomNav";
import type {
  AdsFacetsResponse,
  AdsSearchFilters,
  AdsSearchResponse,
} from "@/lib/search/ads-search";
import { buildSearchQueryString, mergeSearchFilters } from "@/lib/search/ads-search-url";
import { DEFAULT_RADIUS_KM } from "@/lib/buy/regional-radius-config";
import {
  DEFAULT_BRAND_OPTIONS,
  DEFAULT_MODEL_OPTIONS,
  DEFAULT_POPULAR_BRANDS,
  inferWeight,
  toSafeBrandFacets,
  toSafeCatalogItems,
  toSafeModelFacets,
  type BuyCityContext,
} from "@/lib/buy/catalog-helpers";
import { buildNonTerritoryQueryString, type ComprarVariant } from "@/lib/buy/territory-variant";
import { decideSeoQueryPolicy } from "@/lib/seo/query-policy";

export type FallbackTerritoryInfo = {
  requestedName: string;
  actualName: string;
  actualState: string;
  actualSlug: string;
};

interface BuyMarketplacePageClientProps {
  initialResults: AdsSearchResponse;
  initialFacets: AdsFacetsResponse["facets"];
  initialFilters: AdsSearchFilters;
  city: BuyCityContext;
  variant?: ComprarVariant;
  stateUf?: string;
  /** Ativa GeoToCityRedirect apenas em páginas estaduais. */
  enableGeoRedirect?: boolean;
  /**
   * Quando o SSR fez fallback automático, passa só os nomes para que
   * o header exiba a frase discreta cinza (sem alerta amarelo). Não
   * propagamos mais para o `CatalogPageHeader` o objeto completo — o
   * briefing 2026-05-22 baniu o yellow-alert.
   */
  fallbackTerritory?: FallbackTerritoryInfo;
  /**
   * Resolvido em SSR via `isRegionalPageEnabled()`. Repassa para o
   * `NearbyRegionButton` no header + ações.
   */
  regionalEnabled?: boolean;
  /**
   * Raio (km) atual do bloco "Próximos", resolvido em SSR de `?raio=`
   * (âncora regional — página de cidade). Alimenta o seletor "Distância (km)"
   * da sidebar. Ao mudar, o client re-navega com o novo `?raio=` preservando os
   * demais filtros. Default DEFAULT_RADIUS_KM (50) → URL sem o parâmetro.
   */
  radiusKm?: number;
}

export default function BuyMarketplacePageClient({
  initialResults,
  initialFacets,
  initialFilters,
  city,
  variant = "estadual",
  stateUf,
  enableGeoRedirect = false,
  fallbackTerritory,
  regionalEnabled = false,
  radiusKm,
}: BuyMarketplacePageClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const items = useMemo(
    () => toSafeCatalogItems(initialResults?.data, city),
    [initialResults?.data, city]
  );

  const brandFacets = useMemo(
    () => toSafeBrandFacets(initialFacets?.brands),
    [initialFacets?.brands]
  );

  const modelFacets = useMemo(
    () => toSafeModelFacets(initialFacets?.models),
    [initialFacets?.models]
  );

  // Rótulo com contagem por opção ("Toyota (48)") quando o facet informa total.
  const brandOptions = useMemo(() => {
    const options = brandFacets.slice(0, 20).map((item) => ({
      label: item.total > 0 ? `${item.brand} (${item.total})` : item.brand,
      value: item.brand,
    }));

    return options.length > 0
      ? [{ label: "Todas as marcas", value: "" }, ...options]
      : DEFAULT_BRAND_OPTIONS;
  }, [brandFacets]);

  const modelOptions = useMemo(() => {
    const filtered = initialFilters.brand
      ? modelFacets.filter((item) => item.brand === initialFilters.brand)
      : modelFacets;

    const options = filtered.slice(0, 20).map((item) => ({
      label: item.total > 0 ? `${item.model} (${item.total})` : item.model,
      value: item.model,
    }));

    return options.length > 0
      ? [{ label: "Todos os modelos", value: "" }, ...options]
      : DEFAULT_MODEL_OPTIONS;
  }, [initialFilters.brand, modelFacets]);

  const popularBrands = useMemo(() => {
    return brandFacets.length > 0 ? brandFacets.slice(0, 8) : DEFAULT_POPULAR_BRANDS;
  }, [brandFacets]);

  /**
   * Contagem dos controles da sidebar (Ofertas, Vendedor, Câmbio). Escopo
   * territorial — ver buildAdsFacetScopeWhere no backend.
   *
   * Cada bloco fica `undefined` quando a facet não veio, para a sidebar
   * renderizar sem número em vez de "(0)": sem dado, "(0)" seria mentira.
   * Necessário porque o BFF pode responder EMPTY_FACETS em erro/timeout, e
   * porque outras páginas montam a sidebar sem passar esta prop.
   */
  const controlTotals = useMemo(() => {
    const sellerKindRows = initialFacets?.sellerKinds;
    const sellerKind =
      Array.isArray(sellerKindRows) && sellerKindRows.length > 0
        ? {
            dealer: sellerKindRows.find((r) => r.seller_kind === "dealer")?.total ?? 0,
            private: sellerKindRows.find((r) => r.seller_kind === "private")?.total ?? 0,
          }
        : undefined;

    const transmissionRows = initialFacets?.transmissions;
    const transmission =
      Array.isArray(transmissionRows) && transmissionRows.length > 0
        ? Object.fromEntries(transmissionRows.map((r) => [r.transmission, r.total]))
        : undefined;

    return { sellerKind, offers: initialFacets?.offers, transmission };
  }, [initialFacets?.sellerKinds, initialFacets?.transmissions, initialFacets?.offers]);

  // `?raio=` (raio do bloco "Próximos") é ORTOGONAL aos filtros de veículo — não
  // faz parte de AdsSearchFilters. Ao re-navegar por um filtro de veículo,
  // reanexamos o raio atual para não perdê-lo (default 50 → omitido, URL limpa).
  const buildUrl = useCallback(
    (queryString: string): string => {
      const parts: string[] = [];
      if (queryString) parts.push(queryString);
      if (radiusKm && radiusKm !== DEFAULT_RADIUS_KM) parts.push(`raio=${radiusKm}`);
      const qs = parts.join("&");
      return qs ? `${pathname}?${qs}` : pathname;
    },
    [pathname, radiusKm]
  );

  const pushFilters = useCallback(
    (patch: Partial<AdsSearchFilters>, resetPage = true) => {
      const merged = mergeSearchFilters(initialFilters, {
        ...patch,
        ...(resetPage ? { page: 1 } : {}),
      });

      router.push(buildUrl(buildSearchQueryString(merged)));
      setMobileFiltersOpen(false);
    },
    [initialFilters, buildUrl, router]
  );

  const pushPage = useCallback(
    (patch: Partial<AdsSearchFilters>) => {
      const merged = mergeSearchFilters(initialFilters, patch);
      router.push(buildUrl(buildSearchQueryString(merged)));
      if (typeof window !== "undefined") {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    },
    [initialFilters, buildUrl, router]
  );

  /**
   * `href` de cada página da paginação — o MESMO builder que o clique usa,
   * para `href` e destino não poderem divergir.
   *
   * URL limpa por construção:
   *   - `buildNonTerritoryQueryString` tira território (já está no path) e
   *     `page` (reinserido só quando >= 2 — `?page=1` seria duplicata da
   *     vitrine);
   *   - a política central tira `sort=relevance` e valores vazios.
   *
   * Sem isso o href sairia como `?sort=relevance&limit=50&city_slug=…&page=1`,
   * que é a URL que a navegação interna vinha publicando a cada clique.
   */
  const buildPageHref = useCallback(
    (target: number): string => {
      const params = new URLSearchParams(buildNonTerritoryQueryString(initialFilters));
      if (target >= 2) params.set("page", String(target));
      if (radiusKm && radiusKm !== DEFAULT_RADIUS_KM) params.set("raio", String(radiusKm));

      const { normalizedQuery } = decideSeoQueryPolicy(params);
      return normalizedQuery ? `${pathname}?${normalizedQuery}` : pathname;
    },
    [initialFilters, pathname, radiusKm]
  );

  // `changeRadius` foi removido na Fase 5.0B junto com o seletor de distância:
  // sem `onRadiusChange`, nenhuma variante monta o slider, e o handler ficaria
  // inalcançável. `radiusKm` continua sendo PRESERVADO nos hrefs de paginação e
  // filtro logo acima — uma URL antiga com `?raio=` não perde o parâmetro ao
  // paginar.

  const clearFilters = useCallback(() => {
    // Limpar zera TUDO (chips, selects e o raio) → cidade limpa (padrão 50).
    router.push(pathname);
    setMobileFiltersOpen(false);
  }, [pathname, router]);

  const totalAds = initialResults?.pagination?.total || items.length || 0;
  const currentPage = initialResults?.pagination?.page || initialFilters.page || 1;
  const totalPages = initialResults?.pagination?.totalPages || 1;

  const hasFilters = Boolean(
    initialFilters.q ||
      initialFilters.brand ||
      initialFilters.model ||
      initialFilters.min_price ||
      initialFilters.max_price ||
      initialFilters.year_min ||
      initialFilters.year_max ||
      initialFilters.mileage_max ||
      initialFilters.fuel_type ||
      initialFilters.transmission ||
      initialFilters.body_type ||
      initialFilters.below_fipe === true ||
      initialFilters.highlight_only === true ||
      // Chips da sidebar que ficavam de fora: sem eles, filtrar
      // "Particulares" numa cidade com estoque só de loja caía no empty
      // state "Sem ofertas em <cidade>" (culpando o território) em vez de
      // "Nenhum anúncio combina com seus filtros" (culpando o filtro).
      // `priority_tier` é o campo do chip Destaques — `highlight_only`
      // acima é o filtro legado, não o mesmo controle.
      initialFilters.seller_kind === "dealer" ||
      initialFilters.seller_kind === "private" ||
      initialFilters.opportunity === true ||
      initialFilters.priority_tier === 1 ||
      initialFilters.priority_tier === 2 ||
      initialFilters.priority_tier === 3 ||
      initialFilters.priority_tier === 4
  );

  /**
   * A vitrine de CIDADE (`/carros-em/[slug]`) é a única que recebe o tratamento
   * "catálogo limpo" da Fase 5.0B: container mais largo e quarta coluna em telas
   * ≥1600px, e paginador visível mesmo com uma página só.
   *
   * As outras quatro rotas servidas por este componente (`/comprar`,
   * `/comprar/estado/[uf]`, `/carros-usados/[uf]`, `/carros-usados/regiao/[slug]`)
   * seguem exatamente como estavam. Toda diferença desta fase passa por esta
   * flag — é o único ponto a inspecionar para saber o que muda e onde.
   */
  const isCityVariant = variant === "cidade";

  const emptyContext = {
    variant,
    citySlug: variant === "cidade" || variant === "regional" ? city.slug : undefined,
    cityName: variant === "cidade" || variant === "regional" ? city.name : undefined,
    stateUf: variant === "nacional" ? undefined : stateUf || city.state,
    hasFilters,
  };

  const softFallbackMessage = fallbackTerritory
    ? `Mostrando ofertas próximas em ${fallbackTerritory.actualName} (${fallbackTerritory.actualState}).`
    : undefined;

  const sidebarProps = {
    filters: initialFilters,
    city,
    brandOptions,
    modelOptions,
    popularBrands,
    totalResults: totalAds,
    onPatch: (patch: Partial<AdsSearchFilters>) => pushFilters(patch),
    onClear: clearFilters,
    regionalEnabled,
    controlTotals,
    // Seletor "Distância (km)" — a sidebar só o mostra quando recebe
    // `onRadiusChange` (ver `showDistance` em FilterSidebar).
    //
    // Fase 5.0B: a página de cidade DEIXOU de mostrá-lo. O raio controlava
    // exclusivamente o bloco "Próximos, até X km" (`NearbyRadiusSection`), que
    // saiu desta rota. Manter o slider seria oferecer um controle que muda a URL
    // (`?raio=`) e não muda nada na tela — pior que não ter controle nenhum.
    //
    // As outras variantes nunca receberam o handler, então nada muda para elas.
    radiusKm,
    onRadiusChange: undefined,
  };

  return (
    <BuyPageShell
      mobileFilterTrigger={
        <>
          {/* Painel mobile de Filtros — abre via CatalogActionBar
              ("Filtrar"). Briefing 2026-05-22 removeu o FAB
              flutuante porque a action bar 3 botões já provê o
              acesso visível, sem ícone solto sobre o conteúdo. */}
          {mobileFiltersOpen ? (
            <div
              className="fixed inset-0 z-50 lg:hidden"
              role="dialog"
              aria-modal="true"
              aria-label="Filtros"
            >
              <button
                type="button"
                className="absolute inset-0 bg-cnc-text-strong/50 backdrop-blur-[2px]"
                aria-label="Fechar filtros"
                onClick={() => setMobileFiltersOpen(false)}
              />
              <div className="absolute inset-x-0 bottom-0 max-h-[90vh] overflow-hidden rounded-t-2xl bg-cnc-surface shadow-premium-lg">
                <div className="flex items-center justify-between border-b border-cnc-line px-4 py-3">
                  <span className="text-base font-bold text-cnc-text-strong">Filtros</span>
                  <button
                    type="button"
                    onClick={() => setMobileFiltersOpen(false)}
                    className="rounded-lg px-3 py-1.5 text-sm font-semibold text-primary hover:text-primary-strong"
                  >
                    Fechar
                  </button>
                </div>
                <div className="max-h-[calc(90vh-52px)] overflow-y-auto overscroll-contain px-3 pb-8 pt-3">
                  <FilterSidebar
                    {...sidebarProps}
                    showApplyCta
                    onApply={() => setMobileFiltersOpen(false)}
                  />
                </div>
              </div>
            </div>
          ) : null}

          {/* BottomNav mobile — "Comprar" ativo automaticamente em
              /comprar/* via pathname matching do <BottomNav>. */}
          <SiteBottomNav />
        </>
      }
    >
      {enableGeoRedirect && variant === "estadual" && stateUf ? (
        <GeoToCityRedirect stateUf={stateUf} filters={initialFilters} />
      ) : null}

      <CatalogPageHeader
        city={city}
        filters={initialFilters}
        totalResults={totalAds}
        onPatch={(patch) => pushFilters(patch)}
        variant={variant}
        stateUf={stateUf}
        regionalEnabled={regionalEnabled}
        softFallbackMessage={softFallbackMessage}
      />

      <main>
        {/*
          Container do catálogo.

          `max-w-7xl` (1280px) continua sendo o container de TODAS as rotas. A
          página de cidade ganha um teto maior a partir de 1600px — e SÓ ela —
          porque é a única que recebe a quarta coluna (`columns="wide"` no
          `VehicleGrid`). Sem alargar o container, a quarta coluna espremeria o
          card de 275px para 201px; com 1600px, ele fica em 281px.

          Abaixo de 1600px nada muda em rota nenhuma: mesmo container, mesmo
          grid, mesmo card. Ver a nota de geometria em `VehicleGrid.tsx`.
        */}
        <div
          className={`mx-auto w-full max-w-7xl px-3 pb-8 pt-4 sm:px-6 sm:pb-10 sm:pt-6 lg:px-8 lg:pb-12 ${
            isCityVariant ? "min-[1600px]:max-w-[1600px]" : ""
          }`}
        >
          <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(280px,320px)_minmax(0,1fr)] lg:items-start lg:gap-8">
            <aside className="hidden lg:sticky lg:top-[76px] lg:block lg:max-h-[calc(100vh-5rem)] lg:self-start lg:overflow-y-auto lg:pb-8 lg:pr-1">
              <FilterSidebar {...sidebarProps} />
            </aside>

            <div className="min-w-0 flex-1">
              {/* Mobile: barra de ações Ver perto / Ordenar / Filtrar.
                  Substitui o FAB flutuante e os chips quick-filter do
                  header anterior. Desktop: oculta (`lg:hidden`
                  interno). */}
              <CatalogActionBar
                filters={initialFilters}
                onPatch={(patch) => pushFilters(patch)}
                regionalEnabled={regionalEnabled}
                onOpenFilters={() => setMobileFiltersOpen(true)}
                variant={variant}
              />

              {/* Chips de filtro ativo. No mobile a sidebar é uma gaveta
                  fechada — sem esta linha o visitante não tem NENHUM sinal
                  de que há filtro ligado, e a única saída é o "Limpar
                  filtros" tudo-ou-nada. Aqui cada filtro sai sozinho.

                  Componente compartilhado com /anuncios e /cidade/*; não
                  renderiza nada quando não há filtro (retorna null), então
                  a vitrine limpa continua limpa.

                  lockedKeys territorial: cidade/UF vêm da ROTA, não de um
                  filtro removível — remover não mudaria a URL. Hoje o
                  loader já retira `city` dos filtros na página de cidade,
                  então o chip nem aparece; o lock é defesa para não
                  oferecer uma remoção que não funcionaria. */}
              <AppliedFilterChips
                filters={initialFilters}
                onRemove={(patch) => pushFilters(patch)}
                onClearAll={clearFilters}
                lockedKeys={["city", "city_slug", "city_id", "state"]}
                className="pb-1 pt-1"
              />

              {/* Contagem + sort. No mobile o sort fica na action bar
                  (Ordenar), então escondemos o <select> aqui via
                  hideSort para evitar duplicação. */}
              <CatalogResultsHeader
                totalResults={totalAds}
                sort={initialFilters.sort}
                onPatch={(patch) => pushFilters(patch)}
                hideSort={false}
              />

              <VehicleGrid
                items={items}
                inferWeight={inferWeight}
                emptyContext={emptyContext}
                columns={isCityVariant ? "wide" : "default"}
              />
              {/*
                `showSinglePage` só na cidade: a página perdeu os blocos SEO que
                antes marcavam o fim da listagem, e sem eles o catálogo emendava
                direto no rodapé. O paginador de uma página é o encerramento
                visual — não muda URL nem emite `?page=1`.
              */}
              <CatalogPagination
                page={currentPage}
                totalPages={totalPages}
                buildHref={buildPageHref}
                onPatch={(patch) => pushPage(patch)}
                showSinglePage={isCityVariant}
              />
            </div>
          </div>
        </div>
      </main>

      {/*
        Briefing 2026-05-22 — "Atualizar página Comprar/Catálogo":
        Página termina limpa: grid/paginação → (CompactCitySeoBlock
        renderizado no caller para variant="cidade") → PublicFooter
        azul de 6 colunas. Removidos QuickActionTile "Consulte a
        FIPE" e o NearbyRegionButton compacto que ficava acima do
        grid (o CTA agora vive no top-right do header desktop e
        dentro da seção Localização da sidebar + na CatalogActionBar
        mobile).
      */}
    </BuyPageShell>
  );
}
