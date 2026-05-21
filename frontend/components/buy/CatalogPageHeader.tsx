// frontend/components/buy/CatalogPageHeader.tsx
"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { FilterChip } from "@/components/ui/FilterChip";
import { SearchBar } from "@/components/ui/SearchBar";
import { Select } from "@/components/ui/Select";
import { BRAZIL_UFS } from "@/lib/city/brazil-ufs";
import type { AdsSearchFilters } from "@/lib/search/ads-search";
import { buildSearchQueryString, mergeSearchFilters } from "@/lib/search/ads-search-url";
import { formatTotal, type BuyCityContext } from "@/lib/buy/catalog-helpers";
import { buildStatePath, type ComprarVariant, stateNameFromUf } from "@/lib/buy/territory-variant";
import { slugToRegionHref } from "@/lib/regions/ancora-url";

import { CatalogBreadcrumb } from "./CatalogBreadcrumb";

/**
 * PR H — Header da página /comprar/cidade/[slug] redesenhada.
 *
 * Layout mobile-first em vitrine local:
 *   1. Breadcrumb minimalista
 *   2. Aviso de fallback territorial (quando aplicável)
 *   3. H1 regional + contador de ofertas formatado
 *   4. Linha de chips rápidos (filtros comuns) — toggleam querystring
 *   5. SearchBar protagonista
 *   6. Filtros aplicados (FilterChip removível) + ordenação inline
 *
 * Sem hex hardcoded. SSR-friendly: o submit redireciona via router.push,
 * preservando preserve canonical/breadcrumb que vêm do Server Component
 * pai.
 */

/**
 * Chips de filtro rápido alinhados à imagem `atualização-catalogo.png` e
 * à política de produto territorial (briefing 2026-05-20):
 *   Até R$ 50 mil • SUV • Automático • Abaixo da FIPE • Loja •
 *   Particular • Oportunidade • Destaque.
 *
 * Cada chip mapeia para um filtro canônico do backend
 * (`AdsSearchFilters`). Loja/Particular usam `seller_kind`, Oportunidade
 * usa a flag canônica `opportunity` (computed pelo backend, >=10% abaixo
 * da FIPE) e Destaque usa `priority_tier=4`.
 *
 * Loja e Particular são mutuamente exclusivos — clicar em um remove o
 * outro automaticamente (apply() retorna o seller_kind oposto como
 * undefined). Os demais chips são ortogonais entre si.
 *
 * PENDÊNCIA (variant="regional") — filtros de distância:
 *   O briefing 2026-05-20 lista chips "Até 30 km / 50 km / 80 km /
 *   100 km" para a Página Regional. NÃO entregues nesta PR porque o
 *   backend não aceita `distance_max_km` como filtro de query e a
 *   filtragem client-side post-fetch quebraria paginação. Estratégia
 *   recomendada: ver TODO em `lib/buy/region-catalog-loader.ts` (filtrar
 *   `region.members` por distância no SSR antes de compor `city_slugs`).
 */
const QUICK_FILTERS: ReadonlyArray<{
  key: string;
  label: string;
  matches: (filters: AdsSearchFilters) => boolean;
  apply: (filters: AdsSearchFilters) => Partial<AdsSearchFilters>;
  remove: () => Partial<AdsSearchFilters>;
}> = [
  {
    key: "ate-50k",
    label: "Até R$ 50 mil",
    matches: (f) => Number(f.max_price) === 50000,
    apply: () => ({ max_price: 50000, page: 1 }),
    remove: () => ({ max_price: undefined, page: 1 }),
  },
  {
    key: "suv",
    label: "SUV",
    matches: (f) => (f.body_type || "").toUpperCase() === "SUV",
    apply: () => ({ body_type: "SUV", page: 1 }),
    remove: () => ({ body_type: undefined, page: 1 }),
  },
  {
    key: "auto",
    label: "Automático",
    matches: (f) => (f.transmission || "").toLowerCase() === "automatic",
    apply: () => ({ transmission: "automatic", page: 1 }),
    remove: () => ({ transmission: undefined, page: 1 }),
  },
  {
    key: "below-fipe",
    label: "Abaixo da FIPE",
    matches: (f) => f.below_fipe === true,
    apply: () => ({ below_fipe: true, page: 1 }),
    remove: () => ({ below_fipe: undefined, page: 1 }),
  },
  {
    key: "loja",
    label: "Loja",
    matches: (f) => f.seller_kind === "dealer",
    apply: () => ({ seller_kind: "dealer", page: 1 }),
    remove: () => ({ seller_kind: undefined, page: 1 }),
  },
  {
    key: "particular",
    label: "Particular",
    matches: (f) => f.seller_kind === "private",
    apply: () => ({ seller_kind: "private", page: 1 }),
    remove: () => ({ seller_kind: undefined, page: 1 }),
  },
  {
    key: "oportunidade",
    label: "Oportunidade",
    matches: (f) => f.opportunity === true,
    apply: () => ({ opportunity: true, page: 1 }),
    remove: () => ({ opportunity: undefined, page: 1 }),
  },
  {
    key: "destaque",
    label: "Destaque",
    matches: (f) => f.priority_tier === 4,
    apply: () => ({ priority_tier: 4, page: 1 }),
    remove: () => ({ priority_tier: undefined, page: 1 }),
  },
];

const SORT_OPTIONS = [
  { value: "relevance", label: "Mais relevantes" },
  { value: "recent", label: "Recém-publicados" },
  { value: "price_asc", label: "Menor preço" },
  { value: "price_desc", label: "Maior preço" },
  { value: "year_desc", label: "Mais novo" },
  { value: "mileage_asc", label: "Menos km" },
  { value: "highlight", label: "Em destaque" },
];

type AppliedFilter = {
  key: string;
  label: string;
  value?: string;
  remove: () => Partial<AdsSearchFilters>;
};

function buildAppliedChips(filters: AdsSearchFilters): AppliedFilter[] {
  const chips: AppliedFilter[] = [];
  if (filters.brand) {
    chips.push({
      key: "brand",
      label: "Marca",
      value: filters.brand,
      remove: () => ({ brand: undefined, model: undefined, page: 1 }),
    });
  }
  if (filters.model) {
    chips.push({
      key: "model",
      label: "Modelo",
      value: filters.model,
      remove: () => ({ model: undefined, page: 1 }),
    });
  }
  if (filters.fuel_type) {
    chips.push({
      key: "fuel",
      label: "Combustível",
      value: filters.fuel_type,
      remove: () => ({ fuel_type: undefined, page: 1 }),
    });
  }
  if (filters.year_min || filters.year_max) {
    const range = [filters.year_min, filters.year_max].filter(Boolean).join("–");
    chips.push({
      key: "year",
      label: "Ano",
      value: range || "Filtrado",
      remove: () => ({ year_min: undefined, year_max: undefined, page: 1 }),
    });
  }
  if (filters.min_price || filters.max_price) {
    const fmt = (v?: number) =>
      v != null
        ? new Intl.NumberFormat("pt-BR", {
            style: "currency",
            currency: "BRL",
            maximumFractionDigits: 0,
          }).format(v)
        : "";
    const range = [fmt(filters.min_price), fmt(filters.max_price)].filter(Boolean).join(" – ");
    chips.push({
      key: "price",
      label: "Preço",
      value: range || "Filtrado",
      remove: () => ({ min_price: undefined, max_price: undefined, page: 1 }),
    });
  }
  return chips;
}

type CatalogPageHeaderProps = {
  city: BuyCityContext;
  filters: AdsSearchFilters;
  totalResults: number;
  onPatch: (patch: Partial<AdsSearchFilters>) => void;
  variant?: ComprarVariant;
  stateUf?: string;
  fallbackTerritory?: {
    requestedName: string;
    actualName: string;
    actualState: string;
    actualSlug: string;
  };
  /**
   * Quando true e variant="cidade", renderiza o CTA pill primário
   * "Veículos na região de [cidade]" — destino natural de ampliação a
   * partir de uma cidade pequena. Resolvido em SSR via
   * `isRegionalPageEnabled()` e propagado pelo Server Component.
   */
  regionalEnabled?: boolean;
};

export function CatalogPageHeader({
  city,
  filters,
  totalResults,
  onPatch,
  variant = "estadual",
  stateUf,
  fallbackTerritory,
  regionalEnabled = false,
}: CatalogPageHeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = useState(filters.q || "");

  // No modo "nacional" não há UF de contexto — manter Select sem valor
  // selecionado para o usuário escolher (e não exibir "BR" como opção, que
  // não existe em BRAZIL_UFS). Em estadual/cidade mantém o comportamento
  // anterior (UF da rota).
  const activeStateUf =
    variant === "nacional"
      ? filters.state || ""
      : stateUf || filters.state || city.state || "SP";
  const stateName = activeStateUf ? stateNameFromUf(activeStateUf) : "";

  const breadcrumbItems = useMemo(() => {
    if (variant === "cidade") {
      return [
        { label: "Home", href: "/" },
        { label: "Comprar", href: "/comprar" },
        { label: `${city.name} (${city.state})` },
      ];
    }
    if (variant === "regional") {
      return [
        { label: "Home", href: "/" },
        { label: "Comprar", href: "/comprar" },
        { label: city.state, href: `/comprar/estado/${city.state.toLowerCase()}` },
        { label: city.name, href: `/carros-em/${city.slug}` },
        { label: "Região" },
      ];
    }
    if (variant === "nacional") {
      return [{ label: "Home", href: "/" }, { label: "Comprar" }];
    }
    return [
      { label: "Home", href: "/" },
      { label: "Comprar", href: "/comprar" },
      { label: "Catálogo" },
    ];
  }, [variant, city.name, city.state, city.slug]);

  const stateOptions = useMemo(() => {
    const ufs = BRAZIL_UFS.map((uf) => ({
      label: `${uf.label} - ${uf.value}`,
      value: uf.value,
    }));
    // No catálogo nacional, primeira opção é "Todos os estados" (vazia)
    // — sem isso o Select renderiza fora de qualquer opção e o usuário
    // não consegue voltar para Brasil-todo após filtrar por estado.
    return variant === "nacional"
      ? [{ label: "Todos os estados", value: "" }, ...ufs]
      : ufs;
  }, [variant]);

  const submitSearch = useCallback(
    (value: string) => {
      const merged = mergeSearchFilters(filters, {
        q: value.trim() || undefined,
        page: 1,
      });
      const qs = buildSearchQueryString(merged);
      router.push(qs ? `${pathname}?${qs}` : pathname);
    },
    [filters, pathname, router]
  );

  const handleStateChange = useCallback(
    (uf: string) => {
      if (!uf) {
        // No nacional: limpar = ficar em /comprar (Brasil todo).
        // No estadual/cidade: mantém comportamento anterior (limpar via patch).
        if (variant === "nacional") {
          router.push("/comprar");
          return;
        }
        onPatch({ state: undefined, city: undefined, city_slug: undefined, city_id: undefined });
        return;
      }
      if (variant === "cidade" || variant === "nacional" || uf !== activeStateUf) {
        router.push(buildStatePath(uf, { ...filters, page: 1 }));
        return;
      }
      onPatch({ state: uf, city: undefined, city_slug: undefined, city_id: undefined });
    },
    [onPatch, variant, activeStateUf, filters, router]
  );

  const appliedChips = useMemo(() => buildAppliedChips(filters), [filters]);

  return (
    <div className="border-b border-cnc-line bg-cnc-surface">
      {/* pt/pb reduzidos no mobile (auditoria 2026-05-11) — antes
          pt-3 já era razoável mas sobrava no pb-3 + chips em wrap. */}
      <div className="mx-auto w-full max-w-7xl px-4 pb-2 pt-2 sm:px-6 sm:pb-5 sm:pt-6 lg:px-8 lg:pt-8">
        <CatalogBreadcrumb items={breadcrumbItems} />

        {fallbackTerritory ? (
          <div
            role="status"
            className="mt-3 flex flex-col gap-2 rounded-lg border border-cnc-warning/40 bg-cnc-warning/10 p-3 text-sm text-cnc-text sm:flex-row sm:items-center sm:justify-between sm:gap-3"
          >
            <p className="leading-snug">
              Ainda não há anúncios em <strong>{fallbackTerritory.requestedName}</strong>. Mostrando
              ofertas em{" "}
              <strong>
                {fallbackTerritory.actualName} ({fallbackTerritory.actualState})
              </strong>
              .
            </p>
            <Button
              href={buildStatePath(activeStateUf, filters)}
              variant="secondary"
              size="sm"
              className="shrink-0"
            >
              Ver todas de {stateName}
            </Button>
          </div>
        ) : null}

        <div className="mt-2 flex flex-col gap-0.5 sm:mt-4 sm:gap-1.5">
          <h1 className="text-[18px] font-extrabold leading-tight tracking-tight text-cnc-text-strong sm:text-[26px] md:text-[32px] lg:text-[36px]">
            {variant === "cidade" ? (
              <>
                Carros usados em <span className="text-primary">{city.name}</span>
              </>
            ) : variant === "regional" ? (
              <>
                Carros usados em <span className="text-primary">{city.name}</span> e região
              </>
            ) : variant === "nacional" ? (
              <>
                Carros usados <span className="text-primary">no Brasil</span>
              </>
            ) : (
              <>
                Carros usados em <span className="text-primary">{stateName}</span>
              </>
            )}
          </h1>
          <p className="flex flex-wrap items-center gap-2 text-[12.5px] text-cnc-muted sm:text-sm md:text-base">
            <Badge variant="info" size="md">
              <span className="tabular-nums">{formatTotal(totalResults)}</span>
              {variant === "cidade"
                ? " ofertas locais"
                : variant === "regional"
                  ? " ofertas na região"
                  : variant === "nacional"
                    ? " ofertas no Brasil"
                    : " ofertas no estado"}
            </Badge>
            {variant === "cidade" ? (
              <>
                <span>em</span>
                <strong className="text-cnc-text-strong">
                  {city.name} - {city.state}
                </strong>
              </>
            ) : variant === "regional" ? (
              <>
                <span>em</span>
                <strong className="text-cnc-text-strong">{city.name}</strong>
                <span>e cidades próximas</span>
              </>
            ) : variant === "nacional" ? (
              <span>refine por estado ou cidade quando quiser</span>
            ) : (
              <>
                <span>em cidades e regiões de</span>
                <strong className="text-cnc-text-strong">{activeStateUf}</strong>
              </>
            )}
          </p>
        </div>

        {variant === "cidade" ? (
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
            {regionalEnabled && city.slug ? (
              <Link
                href={slugToRegionHref(city.slug)}
                className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary-soft px-3 py-1.5 font-semibold text-primary transition hover:border-primary hover:bg-primary-soft/80"
                data-testid="city-region-cta"
                aria-label={`Veículos na região de ${city.name}`}
              >
                <PinSmallIcon />
                Veículos na região de {city.name}
              </Link>
            ) : null}
            {/*
              Briefing 2026-05-21: a Página Cidade NÃO deve ampliar
              direto para o Estado como CTA principal — a ampliação
              padrão é Cidade → Regional. Mantemos só um link discreto
              de texto (sem pill, sem destaque visual) para quem
              realmente quer pular para o catálogo estadual. Quando a
              flag regional está OFF, este link assume papel principal
              (fallback) porque a Regional não existe.
            */}
            <Link
              href={buildStatePath(activeStateUf, filters)}
              className={
                regionalEnabled
                  ? "text-xs font-medium text-cnc-muted underline-offset-2 transition hover:text-primary hover:underline"
                  : "inline-flex items-center gap-1.5 rounded-full border border-cnc-line bg-cnc-surface px-3 py-1.5 font-semibold text-primary transition hover:border-primary hover:bg-primary-soft"
              }
              data-testid="city-state-cta"
            >
              <span aria-hidden="true">{regionalEnabled ? "" : "← "}</span>
              Ampliar para {stateName}
            </Link>
          </div>
        ) : null}

        {variant === "regional" && city.slug ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            {/* CTA primário pill: caminho de "restrição" para a Página
                Cidade (apenas anúncios da cidade-base). Outlined igual ao
                CTA da Cidade — hierarquia coerente no padrão visual. */}
            <Link
              href={`/carros-em/${encodeURIComponent(city.slug)}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary-soft px-3 py-1.5 font-semibold text-primary transition hover:border-primary hover:bg-primary-soft/80"
              data-testid="regional-city-cta"
              aria-label={`Ver apenas carros em ${city.name}`}
            >
              <PinSmallIcon />
              Ver apenas carros em {city.name}
            </Link>
            <Link
              href={buildStatePath(activeStateUf, filters)}
              className="inline-flex items-center gap-1.5 rounded-full border border-cnc-line bg-cnc-surface px-3 py-1.5 font-semibold text-primary transition hover:border-primary hover:bg-primary-soft"
              data-testid="regional-state-cta"
            >
              <span aria-hidden="true">←</span>
              Ampliar para {stateName}
            </Link>
          </div>
        ) : null}

        {/* Busca protagonista */}
        <div className="mt-4">
          <SearchBar
            value={query}
            onChange={setQuery}
            onSubmit={submitSearch}
            placeholder={
              variant === "cidade"
                ? "Buscar marca, modelo ou versão nesta cidade"
                : variant === "regional"
                  ? "Buscar marca, modelo ou versão nesta região"
                  : variant === "nacional"
                    ? "Buscar marca, modelo ou versão no Brasil"
                    : // Estadual: briefing 2026-05-20 pede "Buscar marca, modelo
                      // ou cidade em [Estado]" — referindo-se ao nome cheio do
                      // estado (ex.: "São Paulo"), não à UF.
                      `Buscar marca, modelo ou cidade em ${stateName}`
            }
            ariaLabel="Buscar no catálogo"
            filterButton={
              <Button type="submit" variant="primary" size="md" className="hidden sm:inline-flex">
                Buscar
              </Button>
            }
          />
        </div>

        {/*
          Chips de filtro rápido. Mobile (auditoria 2026-05-11):
          carrossel horizontal, sem quebra de linha, scrollbar
          escondida — evita o bloco gigante que empurra os anúncios
          para baixo da dobra. sm+ volta ao flex-wrap clássico.
        */}
        <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0 [&::-webkit-scrollbar]:hidden">
          <span className="sr-only">Filtros rápidos</span>
          {QUICK_FILTERS.map((f) => {
            const active = f.matches(filters);
            return (
              <Chip
                key={f.key}
                variant="filter"
                selected={active}
                onClick={() => onPatch(active ? f.remove() : f.apply(filters))}
                className="shrink-0 sm:shrink"
              >
                {f.label}
              </Chip>
            );
          })}
        </div>

        {/* Filtros aplicados + ordenação */}
        <div className="mt-4 flex flex-col gap-3 border-t border-cnc-line pt-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            {appliedChips.length > 0 ? (
              <>
                <span className="text-xs font-semibold uppercase tracking-wideish text-cnc-muted">
                  Filtros aplicados
                </span>
                {appliedChips.map((chip) => (
                  <FilterChip
                    key={chip.key}
                    variant="removable"
                    label={chip.label}
                    value={chip.value}
                    onRemove={() => onPatch(chip.remove())}
                  />
                ))}
              </>
            ) : (
              <span className="text-xs text-cnc-muted-soft">Sem filtros avançados aplicados.</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {variant === "estadual" || variant === "nacional" ? (
              <Select
                aria-label="Estado"
                value={activeStateUf}
                onChange={(event) => handleStateChange(event.target.value)}
                options={stateOptions}
                fullWidth={false}
                containerClassName="w-44"
              />
            ) : null}
            <Select
              aria-label="Ordenar por"
              value={filters.sort || "relevance"}
              onChange={(event) => onPatch({ sort: event.target.value, page: 1 })}
              options={SORT_OPTIONS}
              fullWidth={false}
              containerClassName="w-44"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function PinSmallIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 22s7-7 7-13a7 7 0 1 0-14 0c0 6 7 13 7 13Z" />
      <circle cx="12" cy="9" r="2.2" />
    </svg>
  );
}
