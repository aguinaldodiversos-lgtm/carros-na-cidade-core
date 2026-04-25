// frontend/components/home/sections/types.ts

/**
 * Tipos compartilhados das seções da home.
 *
 * `VehicleCardItem` era exportado de `sections/VehicleCard.tsx`, que
 * passou a ser órfão (substituído pelo AdCard unificado). Movido para
 * cá para preservar o contrato de tipos consumido por `HomeCarousels`
 * sem reanimar o componente.
 */

export type VehicleCardItem = {
  id: number | string;
  slug?: string;
  title?: string;
  brand?: string;
  model?: string;
  version?: string;
  year?: number | string;
  mileage?: number | string;
  transmission?: string | null;
  city?: string;
  state?: string;
  price?: number | string;
  fipe_price?: number | string;
  below_fipe?: boolean;
  highlight_until?: string | null;
  image_url?: string | null;
  image?: string | null;
  cover_image_url?: string | null;
  cover_image?: string | null;
  images?: string[] | null;
  photos?: unknown;
  gallery?: unknown;
};
