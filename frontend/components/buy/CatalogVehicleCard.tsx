// frontend/components/buy/CatalogVehicleCard.tsx

import { AdCard, type BaseAdData } from "@/components/ads/AdCard";
import type { AdItem } from "@/lib/search/ads-search";

/**
 * CatalogVehicleCard — adapter histórico para o AdCard unificado.
 *
 * Antes do PR F este componente reimplementava lógica de card
 * paralela ao AdCard. Agora ele apenas converte o `CatalogItem`
 * (formato vindo do backend de busca/territorial) em `BaseAdData`
 * e renderiza via AdCard com a variante apropriada.
 *
 * Variante mapeada:
 *   - featured=true  → AdCard variant="featured" (16:9, primeiro card)
 *   - featured=false → AdCard variant="grid" (4:3, demais cards)
 *
 * O `weight` (1..4) é propagado via `item.catalogWeight`, que o AdCard
 * já consome em `inferWeight()` para resolver a badge primária.
 *
 * Mantém esta interface pública e o tipo `CatalogItem` por compat com
 * VehicleGrid e catalog-helpers; consumidores novos devem usar
 * `<AdCard>` direto.
 */

export type CatalogItem = AdItem & {
  title?: string;
  brand?: string;
  model?: string;
  version?: string;
  year?: number | string;
  year_model?: string | null;
  yearLabel?: string | null;
  mileage?: number | string;
  transmission?: string | null;
  fuel_type?: string | null;
  body_type?: string | null;
  city?: string;
  state?: string;
  price?: number | string;
  image_url?: string | null;
  image?: string | null;
  cover_image_url?: string | null;
  cover_image?: string | null;
  images?: string[] | null;
  photos?: unknown;
  gallery?: unknown;
  storage_key?: string | null;
  slug?: string;
  below_fipe?: boolean;
  highlight_until?: string | null;
  plan?: string | null;
  seller_type?: string | null;
  seller_kind?: string | null;
  account_type?: string | null;
  dealer_name?: string | null;
  dealership_name?: string | null;
  dealership_id?: number | null;
  reviewed_after_below_fipe?: boolean | null;
  created_at?: string | null;
  catalogWeight?: 1 | 2 | 3 | 4;
};

interface CatalogVehicleCardProps {
  item: CatalogItem;
  featured?: boolean;
  weight: 1 | 2 | 3 | 4;
  /** Mantido por compat (não usado em produção); efeito visual neutro. */
  linkMode?: "self" | "none";
  hrefOverride?: string;
  className?: string;
  priority?: boolean;
}

function toBaseAdData(item: CatalogItem, weight: 1 | 2 | 3 | 4): BaseAdData {
  return {
    id: item.id,
    slug: item.slug ?? null,
    title: item.title ?? null,
    brand: item.brand ?? null,
    model: item.model ?? null,
    version: item.version ?? null,
    year: item.year ?? null,
    yearLabel: item.yearLabel ?? null,
    year_model: item.year_model ?? null,
    mileage: item.mileage ?? null,
    city: item.city ?? null,
    state: item.state ?? null,
    price: item.price ?? null,
    image: item.image ?? null,
    image_url: item.image_url ?? null,
    cover_image_url: item.cover_image_url ?? null,
    cover_image: item.cover_image ?? null,
    storage_key: item.storage_key ?? null,
    images: item.images ?? null,
    photos: item.photos,
    gallery: item.gallery,
    below_fipe: item.below_fipe ?? null,
    highlight_until: item.highlight_until ?? null,
    catalogWeight: item.catalogWeight ?? weight,
    plan: item.plan ?? null,
    dealership_id: item.dealership_id ?? null,
    dealership_name: item.dealership_name ?? null,
    dealer_name: item.dealer_name ?? null,
    seller_type: item.seller_type ?? null,
    seller_kind: item.seller_kind ?? null,
    account_type: item.account_type ?? null,
    reviewed_after_below_fipe: item.reviewed_after_below_fipe ?? null,
  };
}

export default function CatalogVehicleCard({
  item,
  featured = false,
  weight,
  hrefOverride,
  className = "",
  priority = false,
}: CatalogVehicleCardProps) {
  const variant = featured ? "featured" : "grid";
  return (
    <AdCard
      item={toBaseAdData(item, weight)}
      variant={variant}
      priority={priority}
      href={hrefOverride}
      className={className}
    />
  );
}
