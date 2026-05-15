import Link from "next/link";

import { BuyPageShell } from "@/components/buy/BuyPageShell";
import { CatalogBreadcrumb } from "@/components/buy/CatalogBreadcrumb";
import { VehicleGrid } from "@/components/buy/VehicleGrid";
import { SiteBottomNav } from "@/components/shell/SiteBottomNav";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import type { AdItem } from "@/lib/search/ads-search";
import type { RegionBase, RegionMember } from "@/lib/regions/fetch-region";
import type { BrandCount, CityCount } from "@/lib/regions/regional-facets";
import {
  formatTotal,
  inferWeight,
  toSafeCatalogItems,
  type BuyCityContext,
} from "@/lib/buy/catalog-helpers";

import { RegionFAQ } from "./RegionFAQ";

/**
 * View server-render-friendly da Página Regional alinhada ao padrão
 * visual da Página Estadual/Cidade.
 *
 * Por que esse refactor?
 *   O Tier 1 funcionou tecnicamente (JSON-LD, contagem, chips, marcas)
 *   mas o layout era um "panel desktop" próprio — destoava do padrão
 *   premium mobile-first do portal. Aqui realinhamos:
 *     - BuyPageShell (mesmo wrapper de /comprar/cidade)
 *     - CatalogBreadcrumb compartilhado
 *     - h1 com cidade em `text-primary` + Badge com o total
 *     - SearchBar e chips rápidos com a MESMA aparência do catálogo
 *     - VehicleGrid + CatalogVehicleCard → reusa AdCard variant="grid"
 *     - SiteBottomNav (mesma barra inferior mobile do portal)
 *
 * Princípios mantidos:
 *   - Server component puro: sem `"use client"`, sem state. Chips e
 *     SearchBar funcionam via navegação (Link / form GET) — o spec
 *     proíbe criar filtros interativos novos nesta rodada.
 *   - Todos os dados Tier 1 continuam visíveis: contagem destacada,
 *     cidades incluídas com contagem, marcas frequentes, blocos SEO
 *     contextuais, faixa de links finais.
 *   - data-testid mantidos para anti-regressão de smoke/E2E.
 *   - Empty state regional preservado (fallback profissional quando
 *     a região tem 0 anúncios — diferente do empty state genérico
 *     do VehicleGrid, que não conhece a regra "alcance de até X km").
 */

interface RegionPageViewProps {
  base: RegionBase;
  members: RegionMember[];
  ads: AdItem[];
  radiusKm: number;
  /**
   * Total agregado de anúncios na região (`pagination.total`). Diferente
   * de `ads.length` que é só a amostra. Usado na contagem destacada e
   * nas seções SEO para refletir o número real do estoque regional.
   */
  totalAds: number;
  /** Top marcas agregadas da amostra (até 5). */
  topBrands?: BrandCount[];
  /** Contagem por cidade (base + membros) derivada da amostra. */
  cityCounts?: CityCount[];
}

/* ---------------------------------------------------------------------
 * Helpers de formatação
 * ------------------------------------------------------------------- */

function formatDistance(km: number | null | undefined): string {
  if (km == null || !Number.isFinite(km)) return "";
  if (km < 1) return "<1 km";
  return `${Math.round(km)} km`;
}

function formatBrlAbbrev(value: number): string {
  if (value >= 1000) {
    const k = value / 1000;
    return `R$ ${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)} mil`;
  }
  return `R$ ${value}`;
}

/* ---------------------------------------------------------------------
 * Chips rápidos — navegação para /comprar com escopo regional
 *
 * Como não criamos filtros interativos nesta rodada (spec), cada chip
 * é um Link para /comprar com `city_slug=base` + filtro pre-aplicado.
 * Visual idêntico ao Chip do design system (variant=filter, estado
 * default não selecionado). O quinto chip "Perto de [Cidade]" é
 * static-selected — comunica o escopo atual da página regional.
 * ------------------------------------------------------------------- */

type QuickChipDef = {
  key: string;
  label: string;
  filterParams: Record<string, string>;
};

const QUICK_CHIPS: ReadonlyArray<QuickChipDef> = [
  { key: "ate-50k", label: `Até ${formatBrlAbbrev(50000)}`, filterParams: { max_price: "50000" } },
  { key: "suv", label: "SUV", filterParams: { body_type: "SUV" } },
  { key: "auto", label: "Automático", filterParams: { transmission: "automatic" } },
  { key: "below-fipe", label: "Abaixo da FIPE", filterParams: { below_fipe: "true" } },
];

function buildQuickChipHref(baseSlug: string, params: Record<string, string>): string {
  const qs = new URLSearchParams({ city_slug: baseSlug, ...params });
  return `/comprar?${qs.toString()}`;
}

/* ---------------------------------------------------------------------
 * Componentes auxiliares (server-only)
 * ------------------------------------------------------------------- */

function HeartIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 20.5s-7.25-4.35-7.25-10.1a4.2 4.2 0 0 1 7.25-2.7 4.2 4.2 0 0 1 7.25 2.7c0 5.75-7.25 10.1-7.25 10.1Z" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 text-cnc-muted" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" strokeLinecap="round" />
    </svg>
  );
}

function FiltersIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 6h16M7 12h10M10 18h4" strokeLinecap="round" />
    </svg>
  );
}

/* ---------------------------------------------------------------------
 * Página
 * ------------------------------------------------------------------- */

export function RegionPageView({
  base,
  members,
  ads,
  radiusKm,
  totalAds,
  topBrands = [],
  cityCounts = [],
}: RegionPageViewProps) {
  const memberCount = members.length;
  const stateUF = base.state.toUpperCase();
  const cityHref = `/carros-em/${encodeURIComponent(base.slug)}`;
  const stateHref = `/comprar/estado/${stateUF.toLowerCase()}`;

  // Pagination.total > sample length quando o backend respondeu. Para a
  // contagem destacada e os blocos SEO, sempre preferir o agregado real;
  // só cair para `ads.length` se o envelope vier sem pagination.
  const safeTotal = totalAds > 0 ? totalAds : ads.length;

  // Adapter Region → BuyCityContext para reusar as helpers e o card do
  // catálogo. label segue o padrão "Cidade (UF)" usado no portal.
  const cityCtx: BuyCityContext = {
    slug: base.slug,
    name: base.name,
    state: stateUF,
    label: `${base.name} (${stateUF})`,
  };

  const catalogItems = toSafeCatalogItems(ads, cityCtx);
  const belowFipeItems = catalogItems.filter((c) => c.below_fipe === true);
  const showBelowFipeSection = belowFipeItems.length >= 2;

  const memberPreviewNames = members.slice(0, 4).map((m) => m.name);
  const remainingMembers = Math.max(0, memberCount - memberPreviewNames.length);

  // Chips de cidades: usa `cityCounts` (com contagem) quando disponíveis,
  // caindo para a lista crua de members quando a amostra não derivou
  // agregação. Limitado a 6 visíveis + "Ver todas" → catálogo da cidade-base
  // (sem rota de listagem de cidades vizinhas isolada nesta rodada).
  const cityChips =
    cityCounts.length > 0
      ? cityCounts
      : [
          { slug: base.slug, name: base.name, count: 0, distance_km: null, is_base: true },
          ...members.map((m) => ({
            slug: m.slug,
            name: m.name,
            count: 0,
            distance_km: m.distance_km,
            is_base: false,
          })),
        ];
  const visibleCityChips = cityChips.slice(0, 6);
  const hasMoreCities = cityChips.length > visibleCityChips.length;

  return (
    <BuyPageShell mobileFilterTrigger={<SiteBottomNav />}>
      {/* ───────── HEADER (breadcrumb + hero compacto) ─────────
          Top spacing reduzido no mobile (auditoria 2026-05-11) para
          encurtar a distância entre o header global e os anúncios. */}
      <div className="border-b border-cnc-line bg-cnc-surface">
        <div className="mx-auto w-full max-w-7xl px-4 pb-2 pt-2 sm:px-6 sm:pb-5 sm:pt-6 lg:px-8 lg:pt-8">
          <CatalogBreadcrumb
            items={[
              { label: "Início", href: "/" },
              { label: stateUF, href: stateHref },
              { label: base.name, href: cityHref },
              { label: "Região" },
            ]}
          />

          <div className="mt-2.5 flex flex-col gap-1 sm:mt-4 sm:gap-1.5">
            <h1 className="text-[18px] font-extrabold leading-tight tracking-tight text-cnc-text-strong sm:text-[26px] md:text-[32px] lg:text-[36px]">
              Carros na região de <span className="text-primary">{base.name}</span>
            </h1>
            <p className="flex flex-wrap items-center gap-2 text-[12.5px] text-cnc-muted sm:text-sm md:text-base">
              <span data-testid="regional-count-highlight">
                {safeTotal > 0 ? (
                  <Badge variant="info" size="md">
                    <span className="tabular-nums">{formatTotal(safeTotal)}</span>
                    {safeTotal === 1 ? " carro" : " carros"} em até {radiusKm} km de {base.name}
                  </Badge>
                ) : (
                  <Badge variant="neutral" size="md">
                    Em até {radiusKm} km de {base.name}
                  </Badge>
                )}
              </span>
              <span>
                Ofertas em <strong className="text-cnc-text-strong">{base.name}</strong> e cidades
                próximas.
              </span>
            </p>
          </div>

          {/* Busca principal — form GET para /comprar com city_slug fixo.
              Sem state local; não cria filtro interativo novo nesta rota.
              O Botão "Filtros" leva ao catálogo principal onde os filtros
              completos já existem. */}
          <form
            role="search"
            action="/comprar"
            method="get"
            aria-label={`Buscar veículos na região de ${base.name}`}
            className="mt-4"
          >
            <input type="hidden" name="city_slug" value={base.slug} />
            <div className="flex items-stretch gap-2">
              <label htmlFor="region-search-input" className="sr-only">
                Buscar veículos
              </label>
              <div className="flex h-12 flex-1 items-center gap-2 rounded-md border border-cnc-line bg-white px-3 transition focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/30">
                <span aria-hidden="true" className="flex shrink-0 items-center">
                  <SearchIcon />
                </span>
                <input
                  id="region-search-input"
                  type="search"
                  name="q"
                  placeholder="Busque por marca, modelo ou cidade"
                  autoComplete="off"
                  inputMode="search"
                  className="flex-1 bg-transparent text-base text-cnc-text outline-none placeholder:text-cnc-muted-soft"
                  aria-label="Buscar marca, modelo ou cidade"
                />
              </div>
              <Button
                href={`/comprar?city_slug=${encodeURIComponent(base.slug)}`}
                variant="primary"
                size="md"
                className="hidden sm:inline-flex"
                aria-label="Abrir filtros completos no catálogo"
              >
                <FiltersIcon />
                <span className="ml-1">Filtros</span>
              </Button>
              <Button
                href={`/comprar?city_slug=${encodeURIComponent(base.slug)}`}
                variant="primary"
                size="md"
                className="sm:hidden"
                aria-label="Abrir filtros completos no catálogo"
              >
                <FiltersIcon />
              </Button>
            </div>
          </form>

          {/* Chips rápidos: carrossel horizontal no mobile, wrap em sm+.
              "Perto de <Cidade>" é static-selected — representa o
              escopo atual desta página regional. */}
          <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0 [&::-webkit-scrollbar]:hidden">
            <span className="sr-only">Filtros rápidos</span>
            <span
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-primary bg-primary-soft px-3.5 text-sm font-semibold text-primary-strong sm:shrink"
              aria-current="true"
              title={`Escopo atual: região de ${base.name}`}
            >
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                className="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
              >
                <path d="M12 22s-7-7.5-7-13a7 7 0 1 1 14 0c0 5.5-7 13-7 13Z" strokeLinejoin="round" />
                <circle cx="12" cy="9" r="2.5" />
              </svg>
              Perto de {base.name}
            </span>
            {QUICK_CHIPS.map((c) => (
              <Link
                key={c.key}
                href={buildQuickChipHref(base.slug, c.filterParams)}
                className="inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-cnc-line bg-white px-3.5 text-sm font-medium text-cnc-text transition hover:border-cnc-line-strong hover:bg-cnc-bg sm:shrink"
              >
                {c.label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* ───────── BODY ───────── */}
      <main>
        <div className="mx-auto w-full max-w-7xl px-3 pb-8 pt-4 sm:px-6 sm:pb-10 sm:pt-6 lg:px-8 lg:pb-12">
          {/* Cidades incluídas — faixa horizontal compacta. Renderiza
              SÓ quando há cidades vizinhas (memberCount > 0). Quando a
              região está reduzida à cidade-base, a seção é suprimida —
              evita exibir o label "Cidades nesta região" com apenas o
              chip base, que confunde o usuário e quebra o smoke
              validator (que espera ao menos uma vizinha quando o
              label aparece). */}
          {memberCount > 0 && visibleCityChips.length > 0 && (
            <section aria-label="Cidades incluídas na região" className="mb-5">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-cnc-muted">
                Cidades nesta região
              </p>
              {/* Mobile: carrossel horizontal sem wrap (auditoria 2026-05-11)
                  para evitar grade gigante de chips em telas estreitas. */}
              <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0 [&::-webkit-scrollbar]:hidden">
                {visibleCityChips.map((c) =>
                  c.is_base ? (
                    <span
                      key={`base-${c.slug}`}
                      className="inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-primary bg-primary-soft px-3 text-xs font-semibold text-primary-strong sm:shrink"
                      title={`${c.name} (cidade base) — ${c.count} anúncio(s) nesta página`}
                    >
                      {c.name}
                      <span className="text-[10px] uppercase tracking-wide opacity-80">base</span>
                      {c.count > 0 && (
                        <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold tabular-nums">
                          {c.count}
                        </span>
                      )}
                    </span>
                  ) : (
                    <Link
                      key={`chip-${c.slug}`}
                      href={`/carros-em/${encodeURIComponent(c.slug)}`}
                      className="inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-cnc-line bg-white px-3 text-xs font-medium text-cnc-text transition hover:border-primary hover:text-primary sm:shrink"
                      title={
                        c.distance_km != null
                          ? `${c.name} — ${formatDistance(c.distance_km)} de ${base.name}`
                          : c.name
                      }
                    >
                      {c.name}
                      {c.distance_km != null && (
                        <span className="text-[10px] text-cnc-muted-soft">
                          {formatDistance(c.distance_km)}
                        </span>
                      )}
                      {c.count > 0 && (
                        <span className="rounded-full bg-cnc-bg px-1.5 py-0.5 text-[10px] font-bold tabular-nums">
                          {c.count}
                        </span>
                      )}
                    </Link>
                  )
                )}
                {hasMoreCities && (
                  <Link
                    href={stateHref}
                    className="inline-flex h-8 shrink-0 items-center whitespace-nowrap rounded-full border border-cnc-line bg-white px-3 text-xs font-semibold text-primary transition hover:border-primary sm:shrink"
                  >
                    Ver todas →
                  </Link>
                )}
              </div>
            </section>
          )}

          {/* Marcas frequentes — chips discretos, carrossel no mobile */}
          {topBrands.length > 0 && (
            <section
              aria-label="Marcas frequentes nesta região"
              className="mb-6"
              data-testid="regional-top-brands"
            >
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-cnc-muted">
                Marcas frequentes em {base.name}
              </p>
              <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0 [&::-webkit-scrollbar]:hidden">
                {topBrands.map((b) => (
                  <Link
                    key={b.brand}
                    href={`/comprar?city_slug=${encodeURIComponent(base.slug)}&brand=${encodeURIComponent(b.brand)}`}
                    className="inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-cnc-line bg-white px-3 text-xs font-medium text-cnc-text transition hover:border-primary hover:text-primary sm:shrink"
                    title={`${b.brand} — ${b.count} anúncio(s) nesta página`}
                  >
                    <span className="font-semibold">{b.brand}</span>
                    <span className="rounded-full bg-cnc-bg px-1.5 py-0.5 text-[10px] font-bold tabular-nums">
                      {b.count}
                    </span>
                  </Link>
                ))}
                <Link
                  href={`/comprar?city_slug=${encodeURIComponent(base.slug)}`}
                  className="inline-flex h-8 shrink-0 items-center whitespace-nowrap rounded-full border border-cnc-line bg-white px-3 text-xs font-semibold text-primary transition hover:border-primary sm:shrink"
                >
                  Ver mais →
                </Link>
              </div>
            </section>
          )}

          {/* Destaques na região — grid principal */}
          {ads.length === 0 ? (
            <section className="rounded-xl border border-dashed border-cnc-line bg-cnc-bg/40 p-8 text-center">
              <p className="text-base font-semibold text-cnc-text-strong">
                Ainda não encontramos veículos nesta região
              </p>
              <p className="mt-2 text-sm text-cnc-muted">
                Veja anúncios em todo o estado de {stateUF} ou anuncie grátis o seu carro.
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-3">
                <Button href={stateHref} variant="primary" size="md">
                  Ver anúncios em {stateUF}
                </Button>
                <Button href="/anunciar" variant="secondary" size="md">
                  Anunciar grátis
                </Button>
              </div>
            </section>
          ) : (
            <section aria-label={`Destaques na região de ${base.name}`}>
              <div className="mb-3 flex items-end justify-between gap-3">
                <h2 className="text-lg font-bold text-cnc-text-strong sm:text-xl">
                  Destaques na região de {base.name}
                </h2>
                <Link
                  href={`/comprar?city_slug=${encodeURIComponent(base.slug)}`}
                  className="hidden text-sm font-semibold text-primary hover:text-primary-strong sm:inline-flex"
                >
                  Ver todos →
                </Link>
              </div>
              <VehicleGrid items={catalogItems} inferWeight={inferWeight} />
            </section>
          )}

          {/* Oportunidades abaixo da FIPE — segunda seção opcional, só
              quando a amostra atual tem 2+ itens abaixo da FIPE. Não
              dispara fetch novo: filtra a amostra existente. */}
          {showBelowFipeSection && (
            <section aria-label="Oportunidades abaixo da FIPE na região" className="mt-8">
              <div className="mb-3 flex items-end justify-between gap-3">
                <h2 className="text-lg font-bold text-cnc-text-strong sm:text-xl">
                  Oportunidades abaixo da FIPE
                </h2>
                <Link
                  href={`/comprar?city_slug=${encodeURIComponent(base.slug)}&below_fipe=true`}
                  className="hidden text-sm font-semibold text-primary hover:text-primary-strong sm:inline-flex"
                >
                  Ver todas →
                </Link>
              </div>
              <VehicleGrid items={belowFipeItems} inferWeight={inferWeight} />
            </section>
          )}

          {/* Bloco explicativo regional — depois da área comercial */}
          <section
            aria-label="Sobre a região de busca"
            className="mt-10 grid gap-4 md:grid-cols-3"
            data-testid="regional-seo-blocks"
          >
            <article className="rounded-xl border border-cnc-line bg-white p-4 md:p-5">
              <h2 className="text-sm font-semibold text-cnc-text-strong md:text-base">
                Por que comprar na região de {base.name}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-cnc-muted">
                Quando você amplia a busca para a região de {base.name}, encontra mais oferta, mais
                variedade de marcas e mais flexibilidade para negociar sem precisar viajar para
                longe. Carros de cidades vizinhas costumam estar a poucos quilômetros e podem ser
                visitados no mesmo dia.
              </p>
            </article>

            <article className="rounded-xl border border-cnc-line bg-white p-4 md:p-5">
              <h2 className="text-sm font-semibold text-cnc-text-strong md:text-base">
                Cidades próximas incluídas
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-cnc-muted">
                {memberCount > 0 ? (
                  <>
                    Esta região inclui {base.name} e mais{" "}
                    <strong className="text-cnc-text-strong">
                      {memberCount} cidade{memberCount === 1 ? "" : "s"}
                    </strong>{" "}
                    próxima{memberCount === 1 ? "" : "s"}
                    {memberPreviewNames.length > 0 ? (
                      <>
                        , como{" "}
                        <strong className="text-cnc-text-strong">{memberPreviewNames.join(", ")}</strong>
                        {remainingMembers > 0 ? ` e mais ${remainingMembers}` : ""}
                      </>
                    ) : null}
                    . Todas dentro do alcance de até {radiusKm} km a partir da cidade-base.
                  </>
                ) : (
                  <>
                    No momento, a região de {base.name} mostra anúncios apenas da própria
                    cidade-base. Conforme novos veículos forem cadastrados em cidades vizinhas,
                    eles aparecem aqui automaticamente.
                  </>
                )}
              </p>
            </article>

            <article className="rounded-xl border border-cnc-line bg-white p-4 md:p-5">
              <h2 className="text-sm font-semibold text-cnc-text-strong md:text-base">
                Como funciona o alcance regional inteligente
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-cnc-muted">
                O alcance regional inteligente une {base.name} às cidades vizinhas dentro de{" "}
                {radiusKm} km e prioriza anúncios mais próximos da cidade-base. Você vê primeiro o
                que está perto, sem precisar configurar filtros, e sem perder ofertas que estariam
                de fora numa busca só por cidade.
              </p>
            </article>
          </section>

          {/* FAQ regional — 4 perguntas estratégicas (vale a pena, cidades,
              só cidade, anunciar). Server-rendered com <details>, sem JS.
              Page.tsx pode também emitir FAQPage JSON-LD quando a flag
              REGIONAL_PAGE_INDEXABLE estiver true. */}
          <RegionFAQ
            cityName={base.name}
            citySlug={base.slug}
            stateUF={stateUF}
            members={members}
            radiusKm={radiusKm}
          />

          {/* Faixa de CTAs com hierarquia clara — a Região é o ponto atual,
              então as ações listadas aqui são as ALTERNATIVAS:
                1. Anunciar na região (comercial, primary)
                2. Ver somente {cidade} (restrição, secondary)
                3. Ver catálogo de {UF} (ampliação, secondary)
              Removido o link genérico "Buscar outra cidade" — a busca já
              vive no header do portal e na home. */}
          <nav
            aria-label="Próximos passos na Região de {base.name}"
            className="mt-10 flex flex-wrap items-center gap-3"
            data-testid="regional-footer-ctas"
          >
            <Button
              href={`/anunciar?city_slug=${encodeURIComponent(base.slug)}`}
              variant="primary"
              size="md"
              data-testid="regional-anunciar-cta"
            >
              Anunciar na região
            </Button>
            <Link
              href={cityHref}
              className="inline-flex items-center rounded-lg border border-cnc-line bg-white px-4 py-2 text-sm font-semibold text-cnc-text transition hover:border-primary hover:text-primary"
              data-testid="regional-city-cta"
            >
              Ver somente {base.name}
            </Link>
            <Link
              href={stateHref}
              className="inline-flex items-center rounded-lg border border-cnc-line bg-white px-4 py-2 text-sm font-semibold text-cnc-text transition hover:border-primary hover:text-primary"
              data-testid="regional-state-cta"
            >
              Ampliar para {stateUF}
            </Link>
          </nav>
        </div>
      </main>
    </BuyPageShell>
  );
}
