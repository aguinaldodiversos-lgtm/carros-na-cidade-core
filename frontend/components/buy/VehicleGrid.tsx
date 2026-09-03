// frontend/components/buy/VehicleGrid.tsx

import Link from "next/link";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { CatalogItem } from "@/components/buy/CatalogVehicleCard";
import CatalogVehicleCard from "@/components/buy/CatalogVehicleCard";
import { stateNameFromUf } from "@/lib/buy/territory-variant";
import { buildEmptyStateCopy, type EmptyStateVariant } from "@/lib/public-contracts";

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
 * Briefing P2-B 2026-05-25: title/body do empty state vêm do helper
 * único `buildEmptyStateCopy` em `lib/public-contracts/`. CTAs (Limpar
 * filtros, Ver outro escopo, Trocar cidade, Anunciar) ficam aqui — são
 * lógica de roteamento + componente Button visual, não copy de produto.
 *
 * O CatalogVehicleCard é o adapter que renderiza <AdCard variant="grid">.
 */

type EmptyStateContext = {
  variant: "cidade" | "regional" | "estadual" | "nacional";
  /** Slug da cidade ativa (cidade/regional) ou null nas demais. */
  citySlug?: string;
  /** Nome amigável da cidade ativa, quando aplicável. */
  cityName?: string;
  /** UF da cidade/estado ativo. */
  stateUf?: string;
  /** Houve filtros aplicados (q/brand/price/year/etc.) — muda a copy. */
  hasFilters?: boolean;
};

/**
 * Densidade de colunas do grid.
 *
 *   "default"  1 / 2 / 3 — o comportamento histórico, usado por TODAS as rotas.
 *   "wide"     1 / 2 / 3 / 4 — a quarta coluna entra só em telas ≥ 1600px.
 *
 * ── Por que uma variante em vez de trocar `lg:grid-cols-3` por 4 ────────────
 * `VehicleGrid` é montado por `BuyMarketplacePageClient`, que serve CINCO rotas
 * (`/comprar`, `/comprar/estado/[uf]`, `/carros-usados/[uf]`,
 * `/carros-usados/regiao/[slug]` e `/carros-em/[slug]`). Trocar a classe global
 * mudaria as cinco de uma vez. Só a página de cidade pediu 4 colunas.
 *
 * ── Por que 1600px, e não 1440 ou 1536 ──────────────────────────────────────
 * Medido em produção: o card tem 275px em QUALQUER desktop, porque o container
 * é `max-w-7xl` (1280px) e não cresce. A largura disponível para cards é
 *
 *     1280 − 64 (px-8) − 320 (sidebar) − 32 (gap-8) = 864px
 *
 * Espremer 4 colunas nesses 864px dá **201px por card** (−27%) — foto e título
 * comprimidos. A quarta coluna só cabe sem perda se o CONTAINER crescer junto:
 *
 *     ≥1600px → container 1600 → (1600−64−320−32−60)/4 = 281px por card
 *
 * 281 > 275: os cards ficam ligeiramente MAIORES que hoje, não menores. Em
 * 1440 e 1536 a conta não fecha (241px e 265px), por isso essas larguras
 * continuam em 3 colunas.
 */
export type VehicleGridColumns = "default" | "wide";

const GRID_COLUMNS: Record<VehicleGridColumns, string> = {
  default: "grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 lg:gap-5",
  wide: "grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 lg:gap-5 min-[1600px]:grid-cols-4",
};

type VehicleGridProps = {
  items: CatalogItem[];
  inferWeight: (item: CatalogItem) => 1 | 2 | 3 | 4;
  emptyContext?: EmptyStateContext;
  /** Densidade de colunas. Omitido = comportamento histórico (1/2/3). */
  columns?: VehicleGridColumns;
};

function resolveEmptyVariant(ctx: EmptyStateContext): EmptyStateVariant {
  if (ctx.hasFilters) return "filters-no-results";
  if (ctx.variant === "cidade") return "city-no-ads";
  if (ctx.variant === "regional") return "region-no-ads";
  if (ctx.variant === "estadual") return "state-no-ads";
  // 'nacional' sem cidade definida cai em filters-no-results (texto neutro).
  return "filters-no-results";
}

function resolveEmptyLabel(ctx: EmptyStateContext): string | null {
  if ((ctx.variant === "cidade" || ctx.variant === "regional") && ctx.cityName) {
    return ctx.cityName;
  }
  if (ctx.variant === "estadual" && ctx.stateUf) {
    return stateNameFromUf(ctx.stateUf);
  }
  return null;
}

function EmptyState({ ctx }: { ctx: EmptyStateContext }) {
  // Copy unificada via lib/public-contracts (briefing P2-B 2026-05-25).
  const { title, body: description } = buildEmptyStateCopy(resolveEmptyVariant(ctx), {
    label: resolveEmptyLabel(ctx),
  });

  // Ação primária: limpar filtros (cidade/regional/estado mantém pathname
  // para preservar canonical; nacional sempre vai para /comprar limpo).
  const clearFiltersHref =
    ctx.variant === "cidade" && ctx.citySlug
      ? `/carros-em/${ctx.citySlug}`
      : ctx.variant === "regional" && ctx.citySlug
        ? `/carros-usados/regiao/${ctx.citySlug}`
        : ctx.variant === "estadual" && ctx.stateUf
          ? `/comprar/estado/${ctx.stateUf.toLowerCase()}`
          : "/comprar";

  // Ação secundária: ampliar escopo. Cidade → região (ou estado),
  // regional → estado, estado → Brasil, nacional → não tem.
  const broaderHref =
    ctx.variant === "cidade" && ctx.stateUf
      ? `/comprar/estado/${ctx.stateUf.toLowerCase()}`
      : ctx.variant === "regional" && ctx.stateUf
        ? `/comprar/estado/${ctx.stateUf.toLowerCase()}`
        : ctx.variant === "estadual"
          ? "/comprar"
          : null;

  const broaderLabel =
    ctx.variant === "cidade" && ctx.stateUf
      ? `Ver ofertas em ${stateNameFromUf(ctx.stateUf)}`
      : ctx.variant === "regional" && ctx.stateUf
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
        {/* Sem filtro aplicado (city-no-ads / state-no-ads), "Limpar filtros"
            aponta para a própria rota — não faz nada e sugere ao visitante
            que ele mesmo causou o vazio. Só aparece quando há o que limpar. */}
        {ctx.hasFilters ? (
          <Button href={clearFiltersHref} variant="primary" size="md">
            Limpar filtros
          </Button>
        ) : null}

        {/* Sem "Limpar filtros", ampliar o escopo passa a ser a ÚNICA saída
            da tela — então vira a ação primária. Com filtro aplicado
            continua secundária: ali o caminho mais curto é limpar. */}
        {broaderHref && broaderLabel ? (
          <Button href={broaderHref} variant={ctx.hasFilters ? "secondary" : "primary"} size="md">
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

export function VehicleGrid({
  items,
  inferWeight,
  emptyContext,
  columns = "default",
}: VehicleGridProps) {
  if (items.length === 0) {
    const ctx: EmptyStateContext = emptyContext ?? { variant: "nacional" };
    return <EmptyState ctx={ctx} />;
  }

  return (
    <div className={GRID_COLUMNS[columns]}>
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
