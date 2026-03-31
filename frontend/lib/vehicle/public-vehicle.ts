import type { ListingCar } from "@/lib/car-data";
import { buyCars } from "@/lib/car-data";
import type { PublicAdDetail } from "@/lib/ads/ad-detail";
import { SITE_LOGO_SRC } from "@/lib/site/brand-assets";

export type SellerDealer = {
  type: "dealer";
  name: string;
  logo: string;
  address: string;
  rating: number;
  phone?: string;
  storeSlug: string;
};

export type SellerPrivate = {
  type: "private";
  name: string;
  phone?: string;
};

export type SellerInfo = SellerDealer | SellerPrivate;

export type VehicleDetail = {
  id: string;
  slug: string;
  model: string;
  fullName: string;
  price: string;
  /** Valor numérico do preço (BRL), quando derivado do anúncio */
  priceNumeric: number | null;
  condition: "Novo" | "Usado";
  year: string;
  km: string;
  fuel: string;
  transmission: string;
  color: string;
  city: string;
  citySlug: string;
  adCode: string;
  /** ISO 8601 quando disponível na API */
  adPublishedAt: string | null;
  /** ISO 8601 quando disponível e diferente da publicação */
  adUpdatedAt: string | null;
  isBelowFipe: boolean;
  fipePrice: string;
  /** Diferença anúncio − referência FIPE estimada (BRL); negativo = abaixo da referência */
  fipeDeltaBrl: number | null;
  /** Mesma diferença em % sobre a referência estimada */
  fipeDeltaPercent: number | null;
  /** Plano pago ou destaque ativo (para carrossel e prioridades de conversão) */
  isPaidListing: boolean;
  /** ID do anunciante na base, quando disponível */
  advertiserId: string | null;
  images: string[];
  description: string;
  optionalItems: string[];
  safetyItems: string[];
  comfortItems: string[];
  sellerNotes: string;
  seller: SellerInfo;
};

/** Rótulos para exibição no detalhe do anúncio (pt-BR). */
export function formatListingDateLabels(
  publishedIso: string | null | undefined,
  updatedIso: string | null | undefined
): { primary: string; secondary?: string } {
  const published = publishedIso ? new Date(publishedIso) : null;
  const updated = updatedIso ? new Date(updatedIso) : null;

  const fmt = new Intl.DateTimeFormat("pt-BR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const pubOk = published && Number.isFinite(published.getTime());
  const updOk = updated && Number.isFinite(updated.getTime());

  if (pubOk) {
    const primary = `Publicado em ${fmt.format(published!)}`;
    if (updOk && Math.abs(updated!.getTime() - published!.getTime()) > 86_400_000) {
      return { primary, secondary: `Atualizado em ${fmt.format(updated!)}` };
    }
    return { primary };
  }

  if (updOk) {
    return { primary: `Última atualização em ${fmt.format(updated!)}` };
  }

  return { primary: "" };
}

const FALLBACK_IMAGES = ["/images/hero.jpeg", "/images/banner1.jpg", "/images/banner2.jpg"];

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function toTitleCase(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function sanitizeText(value: unknown, fallback = "") {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return fallback;
}

function sanitizeNullableText(value: unknown) {
  const text = sanitizeText(value);
  return text || null;
}

function formatPrice(value?: number | string | null) {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(
            String(value)
              .replace(/[^\d,.-]/g, "")
              .replace(/\.(?=\d{3}(\D|$))/g, "")
              .replace(",", ".")
          )
        : NaN;

  if (!Number.isFinite(numeric) || numeric <= 0) {
    return "R$ 0";
  }

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(numeric);
}

function toNumber(value?: number | string | null) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;

  const normalized = Number(
    value
      .replace(/[^\d,.-]/g, "")
      .replace(/\.(?=\d{3}(\D|$))/g, "")
      .replace(",", ".")
  );

  return Number.isFinite(normalized) ? normalized : null;
}

function formatYear(value?: number | string | null) {
  if (typeof value === "number" && value > 0) {
    return `${value}/${value}`;
  }

  const raw = sanitizeText(value);
  if (!raw) return "Ano não informado";
  return raw.includes("/") ? raw : `${raw}/${raw}`;
}

function formatMileage(value?: number | string | null) {
  const numeric = toNumber(value);
  if (!numeric || numeric <= 0) return "Km não informado";
  return `${numeric.toLocaleString("pt-BR")} km`;
}

function deriveCityDisplay(city?: string | null, state?: string | null) {
  const cleanCity = sanitizeText(city, "São Paulo");
  const cleanState = sanitizeText(state, "SP").toUpperCase();

  if (cleanCity.includes("(")) {
    return cleanCity;
  }

  return `${toTitleCase(cleanCity)} (${cleanState})`;
}

function deriveCitySlug(city?: string | null, state?: string | null) {
  const cleanCity = sanitizeText(city, "sao paulo");
  const cleanState = sanitizeText(state, "sp").toLowerCase();
  return slugify(`${cleanCity} ${cleanState}`);
}

function normalizeImageValue(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (value && typeof value === "object") {
    const maybe = value as Record<string, unknown>;
    const candidate =
      maybe.url ?? maybe.src ?? maybe.image ?? maybe.image_url ?? maybe.cover_image ?? maybe.thumb;

    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return null;
}

function parseImages(ad: PublicAdDetail): string[] {
  const normalized = new Set<string>();

  if (Array.isArray(ad.images)) {
    for (const item of ad.images) {
      const image = normalizeImageValue(item);
      if (image) normalized.add(image);
    }
  } else if (typeof ad.images === "string" && ad.images.trim()) {
    const raw = ad.images.trim();

    if (raw.startsWith("[")) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            const image = normalizeImageValue(item);
            if (image) normalized.add(image);
          }
        }
      } catch {
        raw
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
          .forEach((image) => normalized.add(image));
      }
    } else {
      raw
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
        .forEach((image) => normalized.add(image));
    }
  }

  const directImage = sanitizeNullableText(ad.image_url);
  if (directImage) normalized.add(directImage);

  const finalImages = Array.from(normalized).filter(Boolean);

  if (finalImages.length > 0) return finalImages;

  return [...FALLBACK_IMAGES];
}

function deriveVehicleNames(ad: PublicAdDetail) {
  const title = sanitizeText(ad.title);
  const brand = sanitizeText(ad.brand);
  const model = sanitizeText(ad.model);
  const version = sanitizeText((ad as PublicAdDetail & { version?: string | null }).version);
  const year = sanitizeText(ad.year);

  const fullName =
    title || [brand, model, version, year].filter(Boolean).join(" ").trim() || "Veículo";

  const safeModel = model || title || [brand, model].filter(Boolean).join(" ").trim() || "Veículo";

  return {
    model: toTitleCase(safeModel),
    fullName,
  };
}

function buildFipeReferenceAmount(price: number | null, belowFipe: boolean): number | null {
  if (!price || price <= 0) return null;

  return belowFipe ? Math.round(price / 0.95) : Math.round(price * 1.04);
}

function buildFipeReference(price: number | null, belowFipe: boolean) {
  const estimated = buildFipeReferenceAmount(price, belowFipe);
  if (estimated == null) return "Consulte";
  return formatPrice(estimated);
}

function computeIsPaidListing(
  plan: string | null | undefined,
  highlightUntil: string | null | undefined
): boolean {
  if (highlightUntil) {
    const t = new Date(highlightUntil).getTime();
    if (Number.isFinite(t) && t > Date.now()) return true;
  }

  const p = (plan || "free").toLowerCase().trim();
  if (!p || p === "free") return false;
  if (p.includes("free-essential") || p.includes("cpf-free")) return false;
  return true;
}

function advertiserIdFromAd(ad: PublicAdDetail): string | null {
  const v = ad.advertiser_id;
  if (v == null || v === "") return null;
  return String(v);
}

function buildSellerInfo(ad: PublicAdDetail): SellerInfo {
  const sellerName =
    sanitizeText((ad as PublicAdDetail & { seller_name?: string | null }).seller_name) ||
    sanitizeText((ad as PublicAdDetail & { dealership_name?: string | null }).dealership_name) ||
    "Anunciante no Carros na Cidade";

  const sellerPhone =
    sanitizeNullableText((ad as PublicAdDetail & { phone?: string | null }).phone) ||
    sanitizeNullableText((ad as PublicAdDetail & { whatsapp?: string | null }).whatsapp) ||
    undefined;

  const plan = sanitizeText(ad.plan).toLowerCase();
  const isDealer =
    plan.includes("premium") ||
    plan.includes("pro") ||
    plan.includes("plus") ||
    plan.includes("master") ||
    plan.includes("dealer") ||
    Boolean((ad as PublicAdDetail & { dealership_name?: string | null }).dealership_name);

  if (isDealer) {
    const cityDisplay = deriveCityDisplay(ad.city, ad.state);

    return {
      type: "dealer",
      name: sellerName,
      logo: SITE_LOGO_SRC,
      address: cityDisplay,
      rating: 4.8,
      phone: sellerPhone,
      storeSlug: slugify(sellerName || "lojista"),
    };
  }

  return {
    type: "private",
    name: sellerName,
    phone: sellerPhone,
  };
}

function buildOptionalItems(ad: PublicAdDetail) {
  const items = [
    ad.transmission ? `Câmbio ${sanitizeText(ad.transmission).toLowerCase()}` : null,
    ad.fuel_type ? `Combustível ${sanitizeText(ad.fuel_type).toLowerCase()}` : null,
    ad.below_fipe ? "Preço competitivo em relação à FIPE" : null,
    "Simulação de financiamento disponível",
    "Contato rápido com o anunciante",
  ].filter(Boolean) as string[];

  return Array.from(new Set(items)).slice(0, 6);
}

function buildSafetyItems() {
  return [
    "Confirme histórico de sinistros e origem do veículo antes de fechar qualquer pagamento",
    "Prefira inspeção presencial, fotos reais e leitura de chassi; desconfie de anúncios genéricos ou com pressa para pix antecipado",
    "Exija documentação em dia e considere vistoria cautelar reconhecida antes da quitação",
    "Use os canais do portal para registrar o primeiro contato e mantenha comprovantes em caso de negociação",
  ];
}

function buildComfortItems(ad: PublicAdDetail) {
  const items = [
    "Atendimento digital para proposta inicial",
    "Experiência otimizada para mobile",
    "CTA direto para contato e financiamento",
    ad.city ? `Anúncio com contexto regional de ${toTitleCase(sanitizeText(ad.city))}` : null,
  ].filter(Boolean) as string[];

  return Array.from(new Set(items)).slice(0, 6);
}

export function adaptAdDetailToVehicle(ad: PublicAdDetail): VehicleDetail {
  const id = sanitizeText(ad.id, "sem-id");
  const slug = sanitizeText(ad.slug, slugify(id) || "veiculo");
  const images = parseImages(ad);
  const priceNumber = toNumber(ad.price);
  const belowFipe = ad.below_fipe === true;
  const { model, fullName } = deriveVehicleNames(ad);
  const city = deriveCityDisplay(ad.city, ad.state);
  const citySlug = sanitizeNullableText(ad.city_slug) || deriveCitySlug(ad.city, ad.state);
  const seller = buildSellerInfo(ad);

  const publishedRaw = sanitizeNullableText(ad.created_at);
  const updatedRaw = sanitizeNullableText(ad.updated_at);

  const refAmount = buildFipeReferenceAmount(priceNumber, belowFipe);
  const fipeDeltaBrl = refAmount != null && priceNumber != null ? priceNumber - refAmount : null;
  const fipeDeltaPercent =
    refAmount != null && refAmount > 0 && fipeDeltaBrl != null
      ? (fipeDeltaBrl / refAmount) * 100
      : null;

  const isPaidListing = computeIsPaidListing(ad.plan, ad.highlight_until);
  const advertiserId = advertiserIdFromAd(ad);

  return {
    id,
    slug,
    model,
    fullName,
    price: formatPrice(ad.price),
    priceNumeric: priceNumber,
    condition: "Usado",
    year: formatYear(ad.year),
    km: formatMileage(ad.mileage),
    fuel: sanitizeText(ad.fuel_type, "Não informado"),
    transmission: sanitizeText(ad.transmission, "Não informado"),
    color: sanitizeText((ad as PublicAdDetail & { color?: string | null }).color, "Não informado"),
    city,
    citySlug,
    adCode: id,
    adPublishedAt: publishedRaw,
    adUpdatedAt: updatedRaw,
    isBelowFipe: belowFipe,
    fipePrice: buildFipeReference(priceNumber, belowFipe),
    fipeDeltaBrl,
    fipeDeltaPercent,
    isPaidListing,
    advertiserId,
    images,
    description:
      sanitizeText(ad.description) ||
      "Anúncio publicado no Carros na Cidade com informações oficiais do backend e contexto comercial da região.",
    optionalItems: buildOptionalItems(ad),
    safetyItems: buildSafetyItems(),
    comfortItems: buildComfortItems(ad),
    sellerNotes:
      "Os dados deste anúncio foram carregados da camada pública oficial do portal. Recomendamos confirmar disponibilidade, opcionais e documentação com o anunciante.",
    seller,
  };
}

function toListingCarFromSeed(seed: ListingCar, vehicle: VehicleDetail, index: number): ListingCar {
  return {
    ...seed,
    id: `${seed.id}-${vehicle.id}-${index}`,
    slug: seed.slug || `${slugify(seed.model)}-${vehicle.id}-${index}`,
    city: vehicle.city,
  };
}

export function buildCityVehicles(vehicle: VehicleDetail, limit = 6): ListingCar[] {
  return buyCars.slice(0, limit).map((seed, index) => toListingCarFromSeed(seed, vehicle, index));
}

export function buildSimilarVehicles(vehicle: VehicleDetail, limit = 8): ListingCar[] {
  return buyCars
    .filter((seed) => slugify(seed.model) !== slugify(vehicle.model))
    .slice(0, limit)
    .map((seed, index) => toListingCarFromSeed(seed, vehicle, index + 100));
}

export function buildSellerVehicles(vehicle: VehicleDetail, limit = 6): ListingCar[] {
  if (vehicle.seller.type !== "dealer") {
    return [];
  }

  return buyCars.slice(0, limit).map((seed, index) => ({
    ...toListingCarFromSeed(seed, vehicle, index + 200),
    city: vehicle.city,
  }));
}
