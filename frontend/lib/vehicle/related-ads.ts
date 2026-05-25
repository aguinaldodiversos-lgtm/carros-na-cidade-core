import type { BaseAdData } from "@/components/ads/AdCard";
import type { PublicAdDetail } from "@/lib/ads/ad-detail";
import { buildPublicVehicleHref, normalizePublicAd } from "@/lib/public-contracts";
import { fetchAdsSearch, type AdItem } from "@/lib/search/ads-search";
import type { VehicleDetail } from "@/lib/vehicle/public-vehicle";

/**
 * Predicate: ad relacionado é renderizável? (briefing P2-C 2026-05-25)
 *
 * Critérios (defesa em profundidade — backend já filtra DIRTY/price≤0):
 *   - `normalizePublicAd(ad) !== null` (price > 0, sem dirty data,
 *     slug OU id válido)
 *   - `buildPublicVehicleHref(ad) !== null` (href válido para /veiculo)
 *
 * Sem isso, um ad com slug vazio + id ausente vazaria como card com
 * href quebrado ("/veiculo/undefined"). Sem isso, um ad com price 0
 * vazaria como "R$ 0" se o componente downstream não filtrar.
 *
 * Exportado para testabilidade direta (sem mockar fetchAdsSearch).
 */
export function keepRenderableRelated(ad: AdItem): boolean {
  if (normalizePublicAd(ad) === null) return false;
  if (buildPublicVehicleHref(ad) === null) return false;
  return true;
}

function toCurrentAdId(ad: PublicAdDetail): number | null {
  const raw = ad.id;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && /^\d+$/.test(raw.trim())) return Number.parseInt(raw.trim(), 10);
  return null;
}

/**
 * Mapeia AdItem → BaseAdData (shape consumido por `<AdCard />`). Preserva
 * o `price` como número para que o AdCard formate uma única vez via
 * Intl.NumberFormat. Usado nas seções "Mais carros em [Cidade]" e
 * "Outros carros da loja" no detalhe do veículo.
 */
export function mapAdItemToBaseAdData(item: AdItem): BaseAdData {
  return {
    id: item.id,
    slug: item.slug ?? null,
    title: item.title ?? null,
    brand: item.brand ?? null,
    model: item.model ?? null,
    version: item.version ?? null,
    year: item.year ?? null,
    yearLabel: item.year_model ?? (item.year ? String(item.year) : null),
    year_model: item.year_model ?? null,
    city: item.city ?? null,
    state: item.state ?? null,
    price: item.price ?? null,
    mileage: item.mileage ?? null,
    image: item.image ?? null,
    image_url: item.image_url ?? null,
    cover_image_url: item.cover_image_url ?? null,
    cover_image: item.cover_image ?? null,
    storage_key: item.storage_key ?? null,
    images: item.images ?? null,
    photos: item.photos,
    gallery: item.gallery,
    below_fipe: item.below_fipe ?? null,
    opportunity: item.opportunity ?? null,
    highlight_until: item.highlight_until ?? null,
    priority_tier: item.priority_tier ?? null,
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

function filterOtherAds(items: AdItem[], currentId: number | null, limit: number): BaseAdData[] {
  const out: BaseAdData[] = [];

  for (const item of items) {
    if (currentId !== null && item.id === currentId) continue;
    // Briefing P2-C 2026-05-25 — defesa em profundidade:
    // dropa relacionados sem href válido / sem preço real / dirty.
    if (!keepRenderableRelated(item)) continue;
    out.push(mapAdItemToBaseAdData(item));
    if (out.length >= limit) break;
  }

  return out;
}

function parseAdvertiserId(ad: PublicAdDetail, vehicle: VehicleDetail): number | null {
  const fromVehicle = vehicle.advertiserId;
  if (fromVehicle && /^\d+$/.test(String(fromVehicle).trim())) {
    return Number.parseInt(String(fromVehicle).trim(), 10);
  }
  const raw = ad.advertiser_id;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && /^\d+$/.test(raw.trim())) return Number.parseInt(raw.trim(), 10);
  return null;
}

/**
 * Carrega carrosséis para a página do anúncio: loja + pago → mesma conta; caso contrário (ou vazio) → cidade.
 *
 * Retorna `BaseAdData[]` (price numérico) — o `<AdCard />` formata uma
 * única vez via Intl.NumberFormat. Anteriormente retornávamos
 * `ListingCar[]` (price string formatado "R$ 103.900"), e o AdCard
 * re-parseava com parseFloat após strip → "103.900" virava 103.9 →
 * formatava como "R$ 104". Bug reportado em produção 2026-05-24.
 */
export async function fetchRelatedListingsForAdPage(
  ad: PublicAdDetail,
  vehicle: VehicleDetail
): Promise<{ seller: BaseAdData[]; city: BaseAdData[] }> {
  const currentId = toCurrentAdId(ad);
  const citySlug = ad.city_slug?.trim() || vehicle.citySlug;
  const isPaid = vehicle.isPaidListing;
  const isDealer = vehicle.seller.type === "dealer";
  const advertiserId = parseAdvertiserId(ad, vehicle);

  let seller: BaseAdData[] = [];

  if (isDealer && isPaid && advertiserId != null) {
    const res = await fetchAdsSearch({
      advertiser_id: advertiserId,
      city_slug: citySlug,
      limit: 12,
      page: 1,
      sort: "recent",
    });

    if (res.success && res.data?.length) {
      seller = filterOtherAds(res.data, currentId, 8);
    }
  }

  const showCity = seller.length === 0 || !isDealer || !isPaid;

  let city: BaseAdData[] = [];

  if (showCity) {
    const res = await fetchAdsSearch({
      city_slug: citySlug,
      limit: 12,
      page: 1,
      sort: "recent",
    });

    if (res.success && res.data?.length) {
      city = filterOtherAds(res.data, currentId, 8);
    }
  }

  return { seller, city };
}
