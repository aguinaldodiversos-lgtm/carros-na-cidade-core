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
 *   "default"  1 / 2 / 3 — o fallback do componente, sem call-site no catálogo.
 *   "wide"     1 / 2 / 3 / 4 — a quarta coluna entra a partir de 1392px.
 *
 * ── Quem usa qual ───────────────────────────────────────────────────────────
 * `VehicleGrid` é montado por `BuyMarketplacePageClient`, que serve CINCO rotas
 * (`/comprar`, `/comprar/estado/[uf]`, `/carros-usados/[uf]`,
 * `/carros-usados/regiao/[slug]` e `/carros-em/[slug]`). Desde que o shell largo
 * virou o único shell do catálogo, as cinco passam `columns="wide"`.
 *
 * "default" continua sendo o valor omitido de propósito: ele é o único que serve
 * um container estreito, e é o que qualquer montagem futura de `VehicleGrid`
 * fora do shell de 1600px recebe sem pedir. Os testes de coluna guardam essa
 * separação — 4 colunas dentro de 864px dariam 201px por card.
 *
 * ── A coluna é consequência do shell, não a mudança em si ───────────────────
 * No shell histórico o card tem 275px em QUALQUER desktop, porque o container é
 * `max-w-7xl` (1280px) e não cresce:
 *
 *     1280 − 64 (px-8) − 320 (sidebar) − 32 (gap-8) = 864px de área de cards
 *
 * Espremer 4 colunas nesses 864px dá **201px por card** — medido em runtime,
 * não estimado. Foi por isso que a primeira versão desta variante colocou a
 * quarta coluna só em 1600px: era a única largura em que o shell antigo
 * comportava, e mesmo assim com card de 281px.
 *
 * O catálogo passou a usar um shell mais largo (teto 1600px, padding 24px,
 * sidebar 296px, gap 20px — ver `BuyMarketplacePageClient`), estreado em
 * `/carros-em/[slug]` pela Fase 5.0B e depois promovido às cinco rotas. Com
 * ele a área de cards cresce ~80px em qualquer viewport:
 *
 *     1440 → 257px por card       1600  → 297px por card
 *     1536 → 281px por card       1920  → 297px por card (container trava em 1600)
 *
 * ── De onde sai 1392, um número que ninguém escolheria ──────────────────────
 * É a largura em que o card de 4 colunas atinge 245px, o piso que a fase fixou:
 *
 *     (V − 48 padding − 296 sidebar − 20 gap − 48 gaps de card) / 4 ≥ 245
 *     V ≥ 1392
 *
 * Não é um breakpoint "redondo" porque não foi escolhido: foi resolvido. Abaixo
 * dele a quarta coluna existiria comprimindo o card, que é exatamente o que a
 * fase proibiu.
 *
 * Em 1366 — testado a pedido — a conta dá 238px. Só passaria de 245 com a
 * sidebar em 270px ou menos, e aí o botão "Particulares (0)" do filtro de
 * vendedor estoura a própria caixa (medido: 296px é o mínimo em que nada
 * transborda). Preferiu-se a sidebar íntegra à quarta coluna nessa largura.
 *
 * Abaixo de 1392, 3 colunas — e o shell largo aparece como card MAIOR, não como
 * coluna extra: 295px em 1280 e 323px em 1366, contra os 275px do shell
 * histórico.
 */
export type VehicleGridColumns = "default" | "wide";

const GRID_COLUMNS: Record<VehicleGridColumns, string> = {
  default: "grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 lg:gap-5",
  wide: "grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 min-[1392px]:grid-cols-4",
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
