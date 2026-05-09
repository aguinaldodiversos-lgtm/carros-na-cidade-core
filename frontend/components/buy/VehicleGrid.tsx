// frontend/components/buy/VehicleGrid.tsx

import Link from "next/link";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { CatalogItem } from "@/components/buy/CatalogVehicleCard";
import CatalogVehicleCard from "@/components/buy/CatalogVehicleCard";
import { stateNameFromUf } from "@/lib/buy/territory-variant";

/**
 * VehicleGrid + Empty State.
 *
 * Empty state é a vitrine quando o backend devolveu zero anúncios reais
 * (já filtrados por status=active e price>0 no SSR). NUNCA renderiza
 * placeholder ou veículo fictício — a página de credibilidade é mais
 * importante que ter "algo na tela".
 *
 * Ações disponíveis variam pelo escopo da rota:
 *   - cidade  → limpar filtros · ver estado inteiro · trocar cidade · anunciar
 *   - estado  → limpar filtros · catálogo Brasil · anunciar
 *   - nacional→ limpar filtros · escolher estado/cidade · anunciar
 *
 * O CatalogVehicleCard é o adapter que renderiza <AdCard variant="grid">.
 */

type EmptyStateContext = {
  variant: "cidade" | "estadual" | "nacional";
  /** Slug da cidade ativa (cidade variant) ou null nas demais. */
  citySlug?: string;
  /** Nome amigável da cidade ativa, quando aplicável. */
  cityName?: string;
  /** UF da cidade/estado ativo. */
  stateUf?: string;
  /** Houve filtros aplicados (q/brand/price/year/etc.) — muda a copy. */
  hasFilters?: boolean;
};

type VehicleGridProps = {
  items: CatalogItem[];
  inferWeight: (item: CatalogItem) => 1 | 2 | 3 | 4;
  emptyContext?: EmptyStateContext;
};

function buildEmptyTitle(ctx: EmptyStateContext): string {
  if (ctx.hasFilters) return "Nenhum anúncio encontrado com esses filtros";
  if (ctx.variant === "cidade" && ctx.cityName) {
    return `Ainda não há veículos cadastrados em ${ctx.cityName}`;
  }
  if (ctx.variant === "estadual" && ctx.stateUf) {
    return `Ainda não há veículos cadastrados em ${stateNameFromUf(ctx.stateUf)}`;
  }
  return "Ainda não há veículos cadastrados";
}

function buildEmptyDescription(ctx: EmptyStateContext): string {
  if (ctx.hasFilters) {
    return "Tente remover algum filtro, ampliar a faixa de preço/ano, ou buscar em outra cidade.";
  }
  if (ctx.variant === "cidade") {
    return "Nenhum anúncio ativo no momento. Veja o catálogo do estado, troque de cidade ou seja o primeiro a anunciar aqui.";
  }
  if (ctx.variant === "estadual") {
    return "Nenhum anúncio ativo no momento neste estado. Veja o catálogo Brasil ou anuncie agora.";
  }
  return "Nenhum anúncio ativo no momento. Tente novamente em instantes ou seja o primeiro a anunciar.";
}

function EmptyState({ ctx }: { ctx: EmptyStateContext }) {
  const title = buildEmptyTitle(ctx);
  const description = buildEmptyDescription(ctx);

  // Ação primária: limpar filtros (cidade/estado mantém pathname para
  // preservar canonical; nacional sempre vai para /comprar limpo).
  const clearFiltersHref =
    ctx.variant === "cidade" && ctx.citySlug
      ? `/comprar/cidade/${ctx.citySlug}`
      : ctx.variant === "estadual" && ctx.stateUf
        ? `/comprar/estado/${ctx.stateUf.toLowerCase()}`
        : "/comprar";

  // Ação secundária: ampliar escopo. Cidade → estado, estado → Brasil,
  // nacional → não tem (já é o topo).
  const broaderHref =
    ctx.variant === "cidade" && ctx.stateUf
      ? `/comprar/estado/${ctx.stateUf.toLowerCase()}`
      : ctx.variant === "estadual"
        ? "/comprar"
        : null;

  const broaderLabel =
    ctx.variant === "cidade" && ctx.stateUf
      ? `Ver ofertas em ${stateNameFromUf(ctx.stateUf)}`
      : ctx.variant === "estadual"
        ? "Ver catálogo Brasil"
        : null;

  return (
    <Card
      variant="flat"
      padding="lg"
      className="col-span-full flex flex-col items-center justify-center text-center"
    >
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary-soft text-primary">
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="h-8 w-8"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path
            d="M21 21l-4.35-4.35M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <h3 className="mt-4 text-lg font-bold text-cnc-text-strong sm:text-xl">{title}</h3>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-cnc-muted">{description}</p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        <Button href={clearFiltersHref} variant="primary" size="md">
          Limpar filtros
        </Button>

        {broaderHref && broaderLabel ? (
          <Button href={broaderHref} variant="secondary" size="md">
            {broaderLabel}
          </Button>
        ) : null}

        {/* "Trocar cidade" — disponível em cidade/estadual via /comprar
            (catálogo nacional é o ponto de troca). Em "nacional" o seletor
            de cidade no header já cumpre esse papel. */}
        {ctx.variant !== "nacional" ? (
          <Link
            href="/comprar"
            className="text-sm font-semibold text-primary hover:text-primary-strong"
          >
            Trocar cidade →
          </Link>
        ) : null}

        <Link
          href="/anunciar/novo"
          className="text-sm font-semibold text-primary hover:text-primary-strong"
        >
          Anunciar grátis →
        </Link>
      </div>
    </Card>
  );
}

export function VehicleGrid({ items, inferWeight, emptyContext }: VehicleGridProps) {
  if (items.length === 0) {
    const ctx: EmptyStateContext = emptyContext ?? { variant: "nacional" };
    return <EmptyState ctx={ctx} />;
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 lg:gap-5">
      {items.map((item, index) => (
        <CatalogVehicleCard
          key={`card-${item.id ?? item.slug ?? item.title ?? index}`}
          item={item}
          weight={inferWeight(item)}
          priority={index < 3}
        />
      ))}
    </div>
  );
}
