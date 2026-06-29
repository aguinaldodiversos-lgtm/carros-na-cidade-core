// frontend/components/home/HomeVehicleCard.tsx
"use client";

import { AdCard, type BaseAdData } from "@/components/ads/AdCard";

/**
 * HomeVehicleCard — adapter histórico para o AdCard unificado.
 *
 * Antes do PR F este componente reimplementava lógica de card paralela
 * ao AdCard. Agora ele apenas converte o formato de entrada (VehicleItem
 * vindo de carrosséis da home/FIPE) e renderiza via AdCard com a variante
 * apropriada.
 *
 * Variantes mapeadas:
 *   - "highlight"   → AdCard variant="featured" (16:9, mais destaque)
 *   - "opportunity" → AdCard variant="carousel" (4:3, padrão home)
 *
 * Mantém esta interface pública por compat com FipePageClient e
 * FipeVehicleCarousel; consumidores novos devem usar <AdCard> direto.
 */

export type VehicleItem = {
  id: number | string;
  slug?: string;
  title?: string;
  brand?: string;
  model?: string;
  year?: number | string;
  mileage?: number | string;
  city?: string;
  state?: string;
  price?: number | string;
  below_fipe?: boolean;
  /** Coluna canônica do backend (opportunityExpr). >=10% abaixo da FIPE. */
  opportunity?: boolean;
  highlight_until?: string | null;
  /** Tier canônico do backend (commercialLayerExpr). */
  priority_tier?: 1 | 2 | 3 | 4 | null;
  /** Tipo de vendedor (loja vs particular) — fonte do selo LOJA/PARTICULAR. */
  seller_kind?: string | null;
  seller_type?: string | null;
  account_type?: string | null;
  dealership_id?: number | string | null;
  image_url?: string | null;
  image?: string | null;
  cover_image_url?: string | null;
  cover_image?: string | null;
  images?: string[] | null;
  photos?: unknown;
  gallery?: unknown;
};

interface HomeVehicleCardProps {
  item: VehicleItem;
  variant: "highlight" | "opportunity";
  priority?: boolean;
}

function buildTitle(item: VehicleItem): string {
  if (item.title) return item.title;
  return [item.year, item.brand, item.model].filter(Boolean).join(" ") || "Veículo";
}

function toBaseAdData(item: VehicleItem): BaseAdData {
  return {
    id: item.id,
    slug: item.slug ?? null,
    title: buildTitle(item),
    brand: item.brand ?? null,
    model: item.model ?? null,
    year: item.year ?? null,
    mileage: item.mileage ?? null,
    city: item.city ?? null,
    state: item.state ?? null,
    price: item.price ?? null,
    below_fipe: item.below_fipe ?? null,
    opportunity: item.opportunity ?? null,
    highlight_until: item.highlight_until ?? null,
    priority_tier: item.priority_tier ?? null,
    seller_kind: item.seller_kind ?? null,
    seller_type: item.seller_type ?? null,
    account_type: item.account_type ?? null,
    dealership_id: item.dealership_id ?? null,
    image: item.image ?? null,
    image_url: item.image_url ?? null,
    cover_image_url: item.cover_image_url ?? null,
    cover_image: item.cover_image ?? null,
    images: item.images ?? null,
    photos: item.photos,
    gallery: item.gallery,
  };
}

export function HomeVehicleCard({ item, variant, priority = false }: HomeVehicleCardProps) {
  const adVariant = variant === "highlight" ? "featured" : "carousel";
  // showDealerPill={false}: na home exibimos só o badge "LOJA" na fileira de
  // selos, sem a pílula laranja sobre a imagem (decisão de produto).
  return (
    <AdCard
      item={toBaseAdData(item)}
      variant={adVariant}
      priority={priority}
      showDealerPill={false}
    />
  );
}
