import type { BaseAdData } from "@/components/ads/AdCard";
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

/**
 * Adapter para o legado ListingCar (rotas que ainda usam o tipo antigo
 * de car-data). NÃO usar para alimentar `<AdCard />` — o AdCard espera
 * BaseAdData com `price` numérico; passar uma string formatada como
 * "R$ 103.900" faz o parseNumber interno do AdCard interpretar como
 * 103.9 (parseFloat após strip de chars não-decimais), produzindo
 * "R$ 104" no card (bug 2026-05-24 nos relacionados do detalhe).
 */
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
    item.image_url ||
    (Array.isArray(item.images) && item.images[0]) ||
    "/images/vehicle-placeholder.svg";

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
