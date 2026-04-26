// frontend/components/buy/VehicleGrid.tsx

import Link from "next/link";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { CatalogItem } from "@/components/buy/CatalogVehicleCard";
import CatalogVehicleCard from "@/components/buy/CatalogVehicleCard";

/**
 * PR H — VehicleGrid com Empty State premium.
 *
 * Usa <Card variant="default" padding="lg"> + <Button variant="secondary">
 * do DS, sem hex hardcoded. Mantém grid responsivo (1/2/3 colunas).
 *
 * O CatalogVehicleCard é o adapter (PR F) que renderiza
 * <AdCard variant="grid"> internamente.
 */

type VehicleGridProps = {
  items: CatalogItem[];
  inferWeight: (item: CatalogItem) => 1 | 2 | 3 | 4;
};

function EmptyState() {
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
          <path d="M21 21l-4.35-4.35M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <h3 className="mt-4 text-lg font-bold text-cnc-text-strong sm:text-xl">
        Nenhum anúncio encontrado
      </h3>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-cnc-muted">
        Não encontramos veículos com os filtros selecionados nesta cidade. Tente ampliar a busca,
        remover algum filtro ou explorar cidades vizinhas.
      </p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        <Button href="/comprar" variant="primary" size="md">
          Limpar filtros
        </Button>
        <Link
          href="/anunciar/novo"
          className="text-sm font-semibold text-primary hover:text-primary-strong"
        >
          Anunciar nesta cidade →
        </Link>
      </div>
    </Card>
  );
}

export function VehicleGrid({ items, inferWeight }: VehicleGridProps) {
  if (items.length === 0) {
    return <EmptyState />;
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
