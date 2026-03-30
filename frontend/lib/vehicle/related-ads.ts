import type { ListingCar } from "@/lib/car-data";
import type { PublicAdDetail } from "@/lib/ads/ad-detail";
import { fetchAdsSearch, type AdItem } from "@/lib/search/ads-search";
import type { VehicleDetail } from "@/lib/vehicle/public-vehicle";

function toCurrentAdId(ad: PublicAdDetail): number | null {
  const raw = ad.id;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && /^\d+$/.test(raw.trim())) return Number.parseInt(raw.trim(), 10);
  return null;
}

function formatBrl(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(value);
}

export function mapAdItemToListingCar(item: AdItem): ListingCar {
  const year = item.year ?? new Date().getFullYear();
  const yearModel = `${year}/${year}`;
  const kmNum = item.mileage ?? 0;
  const km =
    typeof kmNum === "number" && kmNum > 0
      ? `${kmNum.toLocaleString("pt-BR")} Km`
      : "Km não informado";

  const priceNum = item.price ?? 0;
  const price = priceNum > 0 ? formatBrl(priceNum) : "Consulte";

  const title =
    item.title || [item.brand, item.model].filter(Boolean).join(" ").trim() || "Veículo";

  const brandUpper = (item.brand || title.split(" ")[0] || "Veículo").toUpperCase();
  const modelRest = item.model
    ? item.model
    : title.replace(new RegExp(`^${item.brand || ""}`, "i"), "").trim() || title;

  const cityLabel = item.city && item.state ? `${item.city} (${item.state})` : item.city || "";

  const hl = item.highlight_until ? new Date(item.highlight_until).getTime() : NaN;
  const hasHighlight = Number.isFinite(hl) && hl > Date.now();

  const badge = hasHighlight ? "destaque" : item.below_fipe ? "fipe" : undefined;

  const image =
    item.image_url || (Array.isArray(item.images) && item.images[0]) || "/images/hero.jpeg";

  return {
    id: String(item.id),
    slug: item.slug,
    model: brandUpper,
    version: modelRest,
    yearModel,
    km,
    city: cityLabel,
    price,
    image,
    badge,
  };
}

function filterOtherAds(items: AdItem[], currentId: number | null, limit: number): ListingCar[] {
  const out: ListingCar[] = [];

  for (const item of items) {
    if (currentId !== null && item.id === currentId) continue;
    out.push(mapAdItemToListingCar(item));
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
 */
export async function fetchRelatedListingsForAdPage(
  ad: PublicAdDetail,
  vehicle: VehicleDetail
): Promise<{ seller: ListingCar[]; city: ListingCar[] }> {
  const currentId = toCurrentAdId(ad);
  const citySlug = ad.city_slug?.trim() || vehicle.citySlug;
  const isPaid = vehicle.isPaidListing;
  const isDealer = vehicle.seller.type === "dealer";
  const advertiserId = parseAdvertiserId(ad, vehicle);

  let seller: ListingCar[] = [];

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

  let city: ListingCar[] = [];

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
