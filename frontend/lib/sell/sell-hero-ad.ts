import { fetchAdsSearch, type AdItem, type AdsSearchFilters } from "@/lib/search/ads-search";
import { resolvePublicListingImageUrl } from "@/lib/vehicle/detail-utils";
import { buildPublicVehicleHref } from "@/lib/public-contracts/build-public-vehicle-href";

/**
 * Anúncio REAL exibido no card do hero de /anunciar.
 *
 * Reaproveita a infraestrutura pública já usada pela Home
 * (`fetchAdsSearch` → `/api/ads/search`, com `revalidate: 60` e fetch
 * resiliente). NÃO toca backend, regras de estoque ou ranking — apenas
 * lê um anúncio publicado/aprovado para servir de vitrine real.
 *
 * Em qualquer falha (backend fora, lista vazia), retorna `null` e a página
 * cai numa PRÉVIA honesta — sem fingir que o exemplo é um anúncio real.
 */
export type SellHeroAd = {
  href: string | null;
  imageSrc: string;
  imageAlt: string;
  title: string;
  year: number | null;
  mileage: number | null;
  transmission: string | null;
  fuelType: string | null;
  price: number | null;
  city: string | null;
  state: string | null;
  belowFipe: boolean;
  highlight: boolean;
};

function sanitize(value?: string | null): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function buildTitle(ad: AdItem): string {
  const explicit = sanitize(ad.title);
  if (explicit) return explicit;
  const parts = [sanitize(ad.brand), sanitize(ad.model), sanitize(ad.version)].filter(Boolean);
  return parts.length ? parts.join(" ") : "Veículo";
}

function mapAd(ad: AdItem): SellHeroAd {
  const title = buildTitle(ad);
  const city = sanitize(ad.city);
  const state = sanitize(ad.state)?.toUpperCase() ?? null;
  const location = city ? ` em ${city}${state ? `, ${state}` : ""}` : "";

  return {
    href: buildPublicVehicleHref(ad),
    imageSrc: resolvePublicListingImageUrl(ad),
    imageAlt: `Anúncio de ${title}${location} publicado no Carros na Cidade`,
    title,
    year: typeof ad.year === "number" && Number.isFinite(ad.year) ? ad.year : null,
    mileage: typeof ad.mileage === "number" && Number.isFinite(ad.mileage) ? ad.mileage : null,
    transmission: sanitize(ad.transmission),
    fuelType: sanitize(ad.fuel_type),
    price: typeof ad.price === "number" && ad.price > 0 ? ad.price : null,
    city,
    state,
    belowFipe: Boolean(ad.below_fipe || ad.opportunity),
    highlight: Boolean(ad.highlight_until) || ad.priority_tier === 4,
  };
}

/**
 * Busca 1 anúncio real para o hero. Preferência por anúncio em destaque
 * (vitrine forte); fallback para o mais recente. Nunca lança — sempre
 * devolve `SellHeroAd` ou `null`.
 */
export async function getSellHeroAd(): Promise<SellHeroAd | null> {
  const attempts: AdsSearchFilters[] = [
    { highlight_only: true, limit: 1, sort: "highlight" },
    { limit: 1, sort: "recent" },
  ];

  for (const filters of attempts) {
    try {
      const res = await fetchAdsSearch(filters);
      const ad = Array.isArray(res?.data) ? res.data[0] : undefined;
      if (ad) return mapAd(ad);
    } catch {
      // segue para a próxima tentativa / fallback honesto
    }
  }

  return null;
}
