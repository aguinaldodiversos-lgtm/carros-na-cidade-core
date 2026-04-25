import type { AdItem } from "@/lib/search/ads-search";
import AdCard, { type AdCardVariant } from "./AdCard";

/**
 * `variant` legado:
 *   - "default" → AdCard variant="grid"
 *   - "home"    → AdCard variant="carousel"
 *
 * Mapeamento mantido para não quebrar consumidores que ainda passam
 * o nome antigo. Consumidores novos devem passar a variante de AdCard
 * direta via prop `cardVariant`.
 */
type AdGridLegacyVariant = "default" | "home";

interface AdGridProps {
  items: AdItem[];
  priorityFirstRow?: boolean;
  priorityCount?: number;
  variant?: AdGridLegacyVariant;
  /** Override direto da variante do AdCard (sobrepõe `variant`). */
  cardVariant?: AdCardVariant;
  className?: string;
}

function mapLegacyVariant(legacy: AdGridLegacyVariant): AdCardVariant {
  return legacy === "home" ? "carousel" : "grid";
}

export function AdGrid({
  items,
  priorityFirstRow = false,
  priorityCount = 3,
  variant = "default",
  cardVariant,
  className = "",
}: AdGridProps) {
  if (!items.length) {
    return (
      <div className="cnc-empty-state">
        <p className="cnc-empty-state__title">Nenhum anúncio encontrado</p>
        <p className="cnc-empty-state__desc">
          Afrouxe um filtro, troque a ordenação ou busque outro modelo — o catálogo deste território
          pode mudar ao longo do dia.
        </p>
      </div>
    );
  }

  const resolvedCardVariant = cardVariant ?? mapLegacyVariant(variant);

  return (
    <div
      className={
        className ||
        `grid gap-4 ${
          variant === "home"
            ? "grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
            : "grid-cols-1 md:grid-cols-2 xl:grid-cols-3"
        }`
      }
    >
      {items.map((item, index) => (
        <AdCard
          key={`${item.id}-${item.slug || index}`}
          item={item}
          priority={priorityFirstRow && index < priorityCount}
          variant={resolvedCardVariant}
        />
      ))}
    </div>
  );
}
