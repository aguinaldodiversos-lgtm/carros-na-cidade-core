// frontend/components/buy/CatalogPageHeader.tsx
"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { NearbyRegionButton } from "@/components/territorial/NearbyRegionButton";
import { Button } from "@/components/ui/Button";
import { SearchBar } from "@/components/ui/SearchBar";
import { buildPublicTerritoryLabel } from "@/lib/public-contracts";
import { slugToRegionHref } from "@/lib/regions/ancora-url";
import type { AdsSearchFilters } from "@/lib/search/ads-search";
import { buildSearchQueryString, mergeSearchFilters } from "@/lib/search/ads-search-url";
import { type BuyCityContext } from "@/lib/buy/catalog-helpers";
import { type ComprarVariant, stateNameFromUf } from "@/lib/buy/territory-variant";

import { CatalogBreadcrumb } from "./CatalogBreadcrumb";

/**
 * Header da página Comprar/Catálogo — reescrito para o briefing
 * 2026-05-22 ("Atualizar página Comprar/Catálogo conforme base
 * visual obrigatória"). A regra-mestra:
 *
 *   "Complexidade dentro dos filtros; simplicidade na vitrine."
 *
 * Layout (mockup `atualização_catalogo_desktop.png`):
 *   1. Breadcrumb minimalista
 *   2. Grid 2 colunas:
 *      - Esquerda: H1 ("Carros usados em [cidade]" com cidade em azul)
 *        e subtítulo curto ("Ofertas em [cidade] e região").
 *      - Direita (desktop ≥ md): pill "Cidade, UF ▾" + botão branco
 *        "Ver carros perto de mim" outlined, ícone+texto azul.
 *   3. SearchBar full-width com botão `Buscar` no desktop.
 *
 * REMOVIDO (em relação à versão anterior):
 *   - Chips QUICK_FILTERS no topo (duplicavam a sidebar no desktop e
 *     poluíam o mobile — o mobile agora tem a barra Ver perto /
 *     Ordenar / Filtrar via `CatalogActionBar`).
 *   - Alerta amarelo de fallback territorial.
 *   - CTAs pills "Ampliar para [Estado]" / "Veículos na região de X" /
 *     "Ver apenas carros em X" no topo (briefing veta CTA de Estado
 *     no topo da Cidade).
 *   - Select de Estado (movido para a sidebar `Localização`).
 *   - Linha "Filtros aplicados" + microcopy "Sem filtros avançados
 *     aplicados" (briefing veta).
 *   - Select de Ordenação (movido para `CatalogResultsHeader` e
 *     `CatalogActionBar`).
 *
 * MANTIDO:
 *   - Breadcrumb por variant (cidade / regional / estadual / nacional).
 *   - H1 contextual.
 *   - SearchBar com placeholder por variant.
 *
 * NOVO:
 *   - Bloco top-right com seletor de cidade resumido (label só) +
 *     `NearbyRegionButton variant="compact"`.
 *   - Prop `softFallbackMessage` para a frase discreta cinza usada
 *     quando o SSR fez fallback territorial (substitui o alerta
 *     amarelo agressivo).
 */

type CatalogPageHeaderProps = {
  city: BuyCityContext;
  filters: AdsSearchFilters;
  totalResults: number;
  onPatch: (patch: Partial<AdsSearchFilters>) => void;
  variant?: ComprarVariant;
  stateUf?: string;
  /**
   * Quando o SSR não encontrou estoque na cidade pedida e está
   * mostrando ofertas próximas, o caller pode passar uma frase
   * discreta (sem cor de alerta) que aparece abaixo do subtítulo.
   */
  softFallbackMessage?: string;
  /**
   * Resolvido em SSR via `isRegionalPageEnabled()`. Repassa para o
   * `NearbyRegionButton` (geo → Regional vs Cidade fallback).
   */
  regionalEnabled?: boolean;
};

export function CatalogPageHeader({
  city,
  filters,
  totalResults: _totalResults,
  onPatch: _onPatch,
  variant = "estadual",
  stateUf,
  softFallbackMessage,
  regionalEnabled = false,
}: CatalogPageHeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = useState(filters.q || "");

  // P3-B 2026-05-25 — fallback final "SP" removido: o resolver
  // territorial garante state em variants `cidade`/`regional`/`estadual`;
  // se ainda assim ausente, usar vazio (sem inventar SP).
  const activeStateUf =
    variant === "nacional" ? filters.state || "" : stateUf || filters.state || city.state || "";
  const stateName = activeStateUf ? stateNameFromUf(activeStateUf) : "";

  const breadcrumbItems = useMemo(() => {
    if (variant === "cidade") {
      return [
        { label: "Home", href: "/" },
        { label: "Comprar", href: "/comprar" },
        // P3-B 2026-05-25 — usa contrato público para o label "Cidade (UF)".
        { label: buildPublicTerritoryLabel({ city: city.name, state: city.state }) },
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
      { label: stateName || activeStateUf || "Estado" },
    ];
  }, [variant, city.name, city.state, city.slug, stateName, activeStateUf]);

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

  const heading = useMemo(() => {
    if (variant === "cidade") {
      return (
        <>
          Carros usados em <span className="text-primary">{city.name}</span>
        </>
      );
    }
    if (variant === "regional") {
      return (
        <>
          Carros usados em <span className="text-primary">{city.name}</span> e região
        </>
      );
    }
    if (variant === "nacional") {
      return (
        <>
          Carros usados <span className="text-primary">no Brasil</span>
        </>
      );
    }
    return (
      <>
        Carros usados em <span className="text-primary">{stateName || activeStateUf}</span>
      </>
    );
  }, [variant, city.name, stateName, activeStateUf]);

  const subtitle = useMemo(() => {
    if (variant === "cidade") return `Ofertas em ${city.name} e região`;
    if (variant === "regional") return `Ofertas em ${city.name} e cidades próximas`;
    if (variant === "nacional") return "Refine por estado ou cidade";
    return `Ofertas em cidades e regiões de ${activeStateUf || stateName}`;
  }, [variant, city.name, activeStateUf, stateName]);

  const placeholder =
    variant === "cidade"
      ? "Buscar marca, modelo ou versão nesta cidade"
      : variant === "regional"
        ? "Buscar marca, modelo ou versão nesta região"
        : variant === "nacional"
          ? "Buscar marca, modelo ou versão no Brasil"
          : `Buscar marca, modelo ou cidade em ${stateName || activeStateUf}`;

  // Pill "Cidade, UF" no canto direito (read-only label — o seletor
  // global de cidade fica no `PublicHeader`). Aqui só refletimos o
  // contexto territorial atual para o usuário identificar de cara
  // qual recorte está vendo.
  const cityPillLabel =
    variant === "cidade" || variant === "regional"
      ? `${city.name}, ${city.state}`
      : variant === "estadual"
        ? stateName || activeStateUf
        : "Brasil";

  return (
    <div className="border-b border-cnc-line bg-cnc-surface">
      <div className="mx-auto w-full max-w-7xl px-4 pb-3 pt-3 sm:px-6 sm:pb-5 sm:pt-6 lg:px-8 lg:pt-8">
        <CatalogBreadcrumb items={breadcrumbItems} />

        <div className="mt-3 grid gap-3 sm:mt-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start lg:gap-6">
          <div className="flex flex-col gap-1">
            <h1 className="text-[20px] font-extrabold leading-tight tracking-tight text-cnc-text-strong sm:text-[28px] md:text-[32px] lg:text-[36px]">
              {heading}
            </h1>
            <p className="text-[13px] text-cnc-muted sm:text-sm md:text-base">{subtitle}</p>
            {softFallbackMessage ? (
              <p
                role="status"
                className="mt-1 text-[12.5px] text-cnc-muted-soft"
                data-testid="catalog-soft-fallback"
              >
                {softFallbackMessage}
              </p>
            ) : null}
          </div>

          {/* Top-right desktop: pill "Cidade, UF ▾" (read-only) +
              NearbyRegionButton compact branco. No mobile (`lg:hidden`)
              o pill some — o seletor global do PublicHeader já entrega
              a localização — e o "Ver perto" vive na CatalogActionBar. */}
          <div className="hidden flex-col items-end gap-2 lg:flex">
            <span
              className="inline-flex items-center gap-1.5 rounded-full border border-cnc-line bg-cnc-surface px-3 py-1.5 text-sm font-semibold text-cnc-text"
              data-testid="catalog-city-pill"
            >
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                className="h-4 w-4 text-primary"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 22s7-7 7-13a7 7 0 1 0-14 0c0 6 7 13 7 13Z" />
                <circle cx="12" cy="9" r="2.2" />
              </svg>
              {cityPillLabel}
            </span>
            {/*
              CTA geo por variant (briefing 2026-05-23 → ajuste 2026-05-23b):

                ▸ Estadual: "Ver carros perto de mim" — porta de entrada;
                  visitante precisa do CTA visível para descobrir a região
                  dele. Mantém o card NearbyRegionButton.

                ▸ Regional: SEM card geo no top-right. Os 2 botões
                  ("Ver carros em minha região" + "Ver carros da cidade")
                  ficavam visualmente pesados ali ("não está de forma
                  profissional"). As mesmas intenções já estão expostas
                  na sidebar `Localização`:
                    - "Ver carros perto de mim" (geo → Regional)
                    - "Região de X" (link direto)
                    - "Apenas X" (link direto)

                ▸ Cidade: link direto "Ver carros na Região" — pill
                  outlined elegante, sem geo (slug já é conhecido).
            */}
            {variant === "regional" ? null : variant === "cidade" ? (
              <Link
                href={slugToRegionHref(city.slug)}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-white shadow-card transition hover:bg-primary-strong"
                data-testid="catalog-city-to-region-link"
                aria-label={`Ver carros na Região de ${city.name}`}
              >
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 22s7-7 7-13a7 7 0 1 0-14 0c0 6 7 13 7 13Z" />
                  <circle cx="12" cy="9" r="2.2" />
                </svg>
                Ver carros na Região
              </Link>
            ) : (
              <NearbyRegionButton
                regionalEnabled={regionalEnabled}
                context={variant === "estadual" ? "estadual" : "catalogo"}
                variant="compact"
                stateUf={stateUf || city.state}
              />
            )}
          </div>
        </div>

        {/* Busca protagonista — full-width, com botão Buscar no desktop */}
        <div className="mt-4">
          <SearchBar
            value={query}
            onChange={setQuery}
            onSubmit={submitSearch}
            placeholder={placeholder}
            ariaLabel="Buscar no catálogo"
            filterButton={
              <Button type="submit" variant="primary" size="md" className="hidden sm:inline-flex">
                Buscar
              </Button>
            }
          />
        </div>
      </div>
    </div>
  );
}
